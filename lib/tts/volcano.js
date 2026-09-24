/**
 * dsh-chatty — 火山引擎 TTS Provider（Agent Plan 单向流式语音合成，HTTP）。
 *
 * 端点：`POST https://openspeech.bytedance.com/api/v3/tts/unidirectional`
 * 鉴权（Agent Plan）：`X-Api-App-Key` 与 `X-Api-Access-Key` 都填方舟 API Key
 * （与 STT 的 plan 模式同一把钥匙，凭据引用 `VOLCENGINE_AGENT_PLAN_API_KEY`）。
 *
 * 请求体（JSON）：{ user: { uid }, req_params: { text, speaker, audio_params: { format, sample_rate, speech_rate } } }
 * 响应（实测错误路径）：`{ header: { reqid, code, message }, data?: <base64> }`；
 *   code === 0 表示成功。成功时的音频载体按 JSON 行流（每行 {data}）处理，
 *   同时兼容服务端直接返回二进制音频（content-type audio/*）的情况。
 *
 * 已知限制：
 *   - 账号未开通豆包语音授权时返回 45000010 "load grant: ... not found in SaaS storage"；
 *     开通后运行 scripts/verify-tts-plan.mjs 做一次连通验证。
 *   - 纯 ESM；fetch/凭据全部注入；不 import 任何 npm 包。
 */

import { randomUUID } from 'node:crypto'
import {
  createAbortScope,
  decodeBase64Audio,
  normalizeSampleRate,
  normalizeTtsFormat,
  normalizeTtsSpeed,
  resolveTtsCredential,
  ttsCapability,
  TTS_DEFAULT_TIMEOUT_MS,
} from './providers.js'

/** Agent Plan 单向流式合成端点（HTTP POST，注意路径带 /plan/）。 */
export const VOLCANO_TTS_ENDPOINT = 'https://openspeech.bytedance.com/api/v3/plan/tts/unidirectional'

/** Agent Plan 合成的资源 ID（可用 config.resourceId 覆盖）。 */
export const VOLCANO_TTS_RESOURCE_ID = 'volc.bigtts'

/**
 * 创建火山 TTS Provider（Agent Plan 单向流式合成）。
 * @param {object} [options]
 * @param {object} [options.config] 用户配置（voice/endpoint/resourceId/credential/sampleRate/timeoutMs/uid）
 * @param {object} [options.defaults] 默认配置（providers.js 传入 TTS_DEFAULTS.volcano）
 * @param {Array} [options.staticVoices] 静态音色表（providers.js 传入 STATIC_VOICES）
 * @param {(name: string) => Promise<string|undefined>} [options.resolveKey]
 * @param {typeof fetch} [options.fetchImpl]
 * @param {object} [options.logger]
 */
export function createVolcanoTtsProvider(options = {}) {
  const {
    config = {},
    defaults = {},
    staticVoices = [],
    resolveKey,
    fetchImpl = globalThis.fetch,
    logger,
  } = options

  const name = 'volcano'
  const capability = ttsCapability(name)
  const defaultVoice = String(config.voice || defaults.voice || '')
  const defaultSampleRate = normalizeSampleRate(config.sampleRate, Number(defaults.sampleRate) || 24000)
  const credentialName = String(config.credential || defaults.credential || '').trim()
  const endpoint = String(config.endpoint || config.baseUrl || defaults.baseUrl || VOLCANO_TTS_ENDPOINT).replace(/\/+$/, '')
  const resourceId = String(config.resourceId || defaults.resourceId || VOLCANO_TTS_RESOURCE_ID)
  const uid = String(config.uid || 'dsh-chatty')
  const timeoutMs = Number.isFinite(Number(config.timeoutMs))
    ? Number(config.timeoutMs)
    : TTS_DEFAULT_TIMEOUT_MS

  async function resolveApiKey() {
    const apiKey = await resolveTtsCredential(name, resolveKey, credentialName)
    if (!apiKey) {
      const error = new Error(`volcano credential not configured: ${credentialName || '(agent plan api key)'}`)
      error.code = 'credential'
      throw error
    }
    return apiKey
  }

  /** 归一化一次合成请求（纯函数，不触网）。 */
  function buildRequest(params = {}) {
    const text = String(params.text ?? '')
    if (!text.trim()) throw new Error('volcano TTS text is empty')
    const voice = String(params.voice || defaultVoice)
    if (!voice) throw new Error('volcano TTS voice is empty')
    return {
      text,
      voice,
      format: normalizeTtsFormat(params.format, defaults.format || 'pcm'),
      speed: normalizeTtsSpeed(params.speed),
      sampleRate: defaultSampleRate,
      channels: 1,
    }
  }

  function errorFromHeader(header) {
    const code = Number(header?.code)
    const message = String(header?.message || 'unknown error')
    const error = new Error(`volcano TTS error ${Number.isNaN(code) ? 'unknown' : code}: ${message}`)
    error.code = Number.isNaN(code) ? 'tts' : String(code)
    if (code === 45000010) error.grant = false
    return error
  }

  /**
   * 打开合成请求并把响应解析成音频块流。
   * 兼容两种成功载体：JSON 行流（{header, data: base64}）与二进制音频（audio/*）。
   * @returns {AsyncGenerator<Uint8Array>}
   */
  async function* requestAudioStream(request, apiKey, scope) {
    if (typeof fetchImpl !== 'function') throw new Error('volcano TTS requires a fetch implementation')
    const res = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Api-App-Key': apiKey,
        'X-Api-Access-Key': apiKey,
        'X-Api-Resource-Id': resourceId,
        'X-Api-Request-Id': randomUUID(),
      },
      body: JSON.stringify({
        user: { uid },
        req_params: {
          text: request.text,
          speaker: request.voice,
          audio_params: {
            format: request.format,
            sample_rate: request.sampleRate,
            speech_rate: request.speed,
          },
        },
      }),
      signal: scope.signal,
    })
    if (!res || typeof res !== 'object') throw new Error('volcano TTS: fetch implementation returned an invalid response')
    if (!res.ok) {
      const detail = res.text ? (await res.text().catch(() => '')).slice(0, 300) : ''
      throw new Error(`volcano TTS HTTP ${res.status}${detail ? ` ${detail}` : ''}`)
    }

    const contentType = String(res.headers?.get?.('content-type') || '')
    if (contentType.includes('audio/')) {
      // 二进制音频载体：body 即音频流。
      const reader = res.body.getReader()
      while (true) {
        const part = await reader.read()
        if (part.done) return
        if (part.value.length) yield new Uint8Array(part.value)
      }
    }

    // JSON 行流载体：每行 { header: { code, message }, data: <base64> }。
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      if (scope.aborted) return
      const part = await reader.read()
      if (part.done) break
      if (scope.aborted) return
      buffer += decoder.decode(part.value, { stream: true })
      let newline
      while ((newline = buffer.indexOf('\n')) >= 0) {
        if (scope.aborted) return
        const line = buffer.slice(0, newline).trim()
        buffer = buffer.slice(newline + 1)
        if (!line) continue
        for (const chunk of parseLine(line)) {
          if (scope.aborted) return
          yield chunk
        }
      }
    }
    if (buffer.trim()) {
      for (const chunk of parseLine(buffer.trim())) {
        if (scope.aborted) return
        yield chunk
      }
    }
  }

  function parseLine(line) {
    let parsed
    try { parsed = JSON.parse(line) } catch {
      throw new Error(`volcano TTS 响应解析失败：${line.slice(0, 200)}`)
    }
    const header = parsed.header
    const code = header ? Number(header.code) : 0
    if (header && code !== 0) throw errorFromHeader(header)
    const data = typeof parsed.data === 'string' ? parsed.data : ''
    if (!data) return []
    const audio = decodeBase64Audio(data)
    return audio.length ? [audio] : []
  }

  return {
    name,
    capability,

    /** 火山音色为预置清单，返回静态表过滤结果。 */
    async listVoices(listOptions = {}) {
      void listOptions
      return staticVoices
        .filter((voice) => voice && voice.provider === name && voice.id)
        .map((voice) => ({
          provider: name,
          id: String(voice.id),
          label: String(voice.label || voice.id),
        }))
    },

    /**
     * 一次性合成：收集整个流式响应的音频块。
     * @param {{ text: string, voice?: string, speed?: number, format?: string, signal?: AbortSignal }} params
     * @returns {Promise<{ audio: Uint8Array, format: string, sampleRate: number, channels: number }>}
     */
    async synthesize(params = {}) {
      const request = buildRequest(params)
      const scope = createAbortScope(params.signal, timeoutMs)
      try {
        const apiKey = await resolveApiKey()
        const chunks = []
        for await (const chunk of requestAudioStream(request, apiKey, scope)) {
          chunks.push(chunk)
        }
        const total = chunks.reduce((sum, item) => sum + item.length, 0)
        const audio = new Uint8Array(total)
        let offset = 0
        for (const chunk of chunks) { audio.set(chunk, offset); offset += chunk.length }
        if (!total) throw new Error('volcano TTS returned no audio data')
        return { audio, format: request.format, sampleRate: request.sampleRate, channels: request.channels }
      } finally {
        scope.dispose()
      }
    },

    /**
     * 流式合成：响应音频块逐块产出。
     * 返回对象是同步的；凭据/连接错误在首次迭代 chunks 时抛出。
     * @param {{ text: string, voice?: string, speed?: number, format?: string, signal?: AbortSignal }} params
     * @returns {{ chunks: AsyncIterable<Uint8Array>, format: string, sampleRate: number, channels: number, cancel: () => void }}
     */
    createStream(params = {}) {
      const request = buildRequest(params)
      const scope = createAbortScope(params.signal, timeoutMs)
      async function* generate() {
        try {
          const apiKey = await resolveApiKey()
          yield* requestAudioStream(request, apiKey, scope)
        } finally {
          scope.dispose()
        }
      }
      return {
        chunks: generate(),
        format: request.format,
        sampleRate: request.sampleRate,
        channels: request.channels,
        cancel() {
          scope.abort(new Error('volcano TTS stream cancelled'))
          logger?.info?.(`[${name}] TTS 流已取消`)
        },
      }
    },
  }
}
