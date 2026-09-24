/**
 * dsh-chatty — 火山引擎 TTS Provider（Agent Plan 语音合成 2.0，HTTP 单请求）。
 *
 * 端点：`POST https://openspeech.bytedance.com/api/v3/plan/tts/unidirectional`
 * 鉴权（Agent Plan）：`X-Api-Key: <方舟 API Key>`（与 STT plan 模式同一把钥匙，
 * 凭据引用 `VOLCENGINE_AGENT_PLAN_API_KEY`）。
 *
 * 请求体（JSON）：{ user: { uid }, req_params: { text, speaker, audio_params: { format, sample_rate, speech_rate } } }
 * 响应体（单个 JSON）：{ code: 0, message: '', data: <base64 音频> }；code !== 0 为错误
 * （如 55000000 = resource 与音色代次不匹配：2.0 音色须配 seed-tts-2.0）。
 *
 * 实测记录（2026-09-24，真实 Agent Plan Key）：
 *   - `X-Api-App-Key` / `X-Api-Access-Key` 双头组合返回 401 grant not found（plan Key
 *     不走旧版 AppID+Token 授权体系）；
 *   - `X-Api-Key` + resource `seed-tts-2.0` + 2.0 代音色（*_uranus_bigtts）成功返回 MP3；
 *   - 1.0 代音色（*_moon_bigtts）配 seed-tts-2.0 会返回 55000000 音色不匹配。
 *
 * 约束：纯 ESM；只 import 本地文件与 Node 内置模块；fetch 通过参数注入。
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

/** Agent Plan 合成端点（HTTP POST，注意路径带 /plan/）。 */
export const VOLCANO_TTS_ENDPOINT = 'https://openspeech.bytedance.com/api/v3/plan/tts/unidirectional'

/** Agent Plan 合成资源 ID（豆包语音合成模型 2.0；可用 config.resourceId 覆盖）。 */
export const VOLCANO_TTS_RESOURCE_ID = 'seed-tts-2.0'

/**
 * 创建火山 TTS Provider（Agent Plan 合成 2.0）。
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

  /** 把服务端错误翻译成带提示的 Error。 */
  function errorFromCode(code, message) {
    const error = new Error(`volcano TTS error ${code}: ${message}`)
    error.code = String(code)
    if (code === 55000000) {
      error.message += '（resource ID 与音色代次不匹配：2.0 音色配 seed-tts-2.0，1.0 音色配 seed-tts-1.0）'
    } else if (/speaker permission denied|access denied/i.test(message)) {
      error.message += '（音色未授权，请换用免费音色或在控制台购买）'
    }
    return error
  }

  /**
   * 发起一次合成并返回完整音频。
   * @param {{ text: string, voice: string, speed: number, format: string, sampleRate: number, signal?: AbortSignal }} request
   * @returns {Promise<Uint8Array>}
   */
  async function requestAudio(request, apiKey, scope) {
    if (typeof fetchImpl !== 'function') throw new Error('volcano TTS requires a fetch implementation')
    const res = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Api-Key': apiKey,
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
    const raw = Buffer.from(await res.arrayBuffer())
    if (!res.ok) {
      throw new Error(`volcano TTS HTTP ${res.status}${raw.length ? ` ${raw.toString('utf8').slice(0, 300)}` : ''}`)
    }
    let parsed
    try { parsed = JSON.parse(raw.toString('utf8')) } catch {
      throw new Error('volcano TTS: response is not valid JSON')
    }
    const code = Number(parsed.code)
    if (code !== 0) throw errorFromCode(code, parsed.message || 'unknown error')
    const data = typeof parsed.data === 'string' ? parsed.data : ''
    if (!data.trim()) throw new Error('volcano TTS returned no audio data')
    return decodeBase64Audio(data)
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
     * 一次性合成。
     * @param {{ text: string, voice?: string, speed?: number, format?: string, signal?: AbortSignal }} params
     * @returns {Promise<{ audio: Uint8Array, format: string, sampleRate: number, channels: number }>}
     */
    async synthesize(params = {}) {
      const request = buildRequest(params)
      const scope = createAbortScope(params.signal, timeoutMs)
      try {
        const apiKey = await resolveApiKey()
        const audio = await requestAudio(request, apiKey, scope)
        return { audio, format: request.format, sampleRate: request.sampleRate, channels: request.channels }
      } finally {
        scope.dispose()
      }
    },

    /**
     * 流式接口占位：Agent Plan HTTP 合成是单请求单响应，V1 以「整块一次产出」
     * 实现 createStream（接口形状与契约一致，未来接双向流式时只换实现）。
     * @param {{ text: string, voice?: string, speed?: number, format?: string, signal?: AbortSignal }} params
     * @returns {{ chunks: AsyncIterable<Uint8Array>, format: string, sampleRate: number, channels: number, cancel: () => void }}
     */
    createStream(params = {}) {
      const request = buildRequest(params)
      const scope = createAbortScope(params.signal, timeoutMs)
      async function* generate() {
        try {
          const apiKey = await resolveApiKey()
          const audio = await requestAudio(request, apiKey, scope)
          if (scope.aborted) return
          yield audio
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
