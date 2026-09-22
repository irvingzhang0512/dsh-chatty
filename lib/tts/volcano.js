/**
 * dsh-chatty — 火山引擎（豆包语音）TTS Provider。
 *
 * API 来源：
 *   - 一次性合成（HTTP 非流式）：https://www.volcengine.com/docs/6561/79820
 *   - 鉴权方法：https://www.volcengine.com/docs/6561/1105162
 *   - 预置音色表：https://www.volcengine.com/docs/6561/97465
 *   端点：POST https://openspeech.bytedance.com/api/v1/tts
 *
 * 请求体（按官方文档与多份社区实现交叉确认）：
 *   {
 *     app:     { appid, token, cluster },
 *     user:    { uid },
 *     audio:   { voice_type, encoding, speed_ratio },
 *     request: { reqid, text, operation: 'query' }
 *   }
 * 响应体：{ code: 3000, message: 'Success', data: '<base64 音频>' }；code === 3000 表示成功。
 *
 * 不确定 / 已做取舍的字段（写清楚以便后续按实测修正）：
 *   1. 鉴权头格式：官方与社区一致使用 `Authorization: Bearer;<token>`（**分号**，不是空格）。
 *      本实现按此发送；若控制台/文档改版，只需改 requestAudio 里的一行。
 *   2. `request.text_type` 官方示例为 'plain'，本实现**不发送**（服务端默认即 plain），
 *      以保持与本仓库契约定下的请求体形状一致。
 *   3. `audio.sample_rate` 官方支持显式指定，本实现**不发送**：豆包 bigtts/mars 系列默认
 *      输出 24000 Hz，与 TTS_DEFAULTS.volcano.sampleRate 一致，因此返回值仍按 24000 上报。
 *      若后续实测发现 mp3/wav 实际采样率不同，应改为显式发送 sample_rate。
 *   4. `audio.volume_ratio` / `pitch_ratio` / `emotion` 均未实现（capability.emotion = false）。
 *   5. `user.uid` 官方要求「用户唯一标识」，这里固定为 'dsh-chatty'（可用 config.uid 覆盖）。
 *   6. 火山 v1 TTS 没有 model 参数（模型由 cluster + voice 决定），TTS_DEFAULTS.volcano.model
 *      保留空串只是为了与 siliconflow 的配置形状对齐。
 *
 * V1 的「分片流式」说明：
 *   createStream 复用的是**同一个一次性 HTTP 合成调用**，拿到完整 base64 后按 4096 个
 *   base64 字符（= 3072 字节，4 的整数倍以保证解码边界正确）切片逐块解码产出。它带来的是
 *   「解码/播放可以边做边等」的收益，**不是**真正的双向流式（真正的流式需要
 *   wss://openspeech.bytedance.com/api/v1/tts/ws_binary）。真正流式的接入点已在
 *   capability 之外预留：未来只需替换 createStream 的实现，接口形状不变。
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

/** 默认端点（TTS_DEFAULTS.volcano.baseUrl 的兜底）。 */
export const VOLCANO_TTS_URL = 'https://openspeech.bytedance.com/api/v1/tts'

/** 火山 v1 TTS 成功码。 */
export const VOLCANO_SUCCESS_CODE = 3000

/** createStream 的 base64 分片长度，必须是 4 的整数倍。 */
export const VOLCANO_BASE64_CHUNK_CHARS = 4096

/**
 * 创建火山 TTS Provider。
 * @param {object} [options]
 * @param {object} [options.config] 用户配置（voice/cluster/baseUrl/appId/credential/appIdCredential/timeoutMs/uid）
 * @param {object} [options.defaults] 默认配置（由 providers.js 传入 TTS_DEFAULTS.volcano）
 * @param {Array} [options.staticVoices] 静态音色表（由 providers.js 传入 STATIC_VOICES）
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
  const baseUrl = String(config.baseUrl || defaults.baseUrl || VOLCANO_TTS_URL).replace(/\/+$/, '')
  const cluster = String(config.cluster || defaults.cluster || 'volcano_tts')
  const defaultVoice = String(config.voice || defaults.voice || '')
  const defaultSampleRate = normalizeSampleRate(config.sampleRate, Number(defaults.sampleRate) || 24000)
  const credentialName = String(config.credential || defaults.credential || '').trim()
  const appIdCredentialName = String(config.appIdCredential || defaults.appIdCredential || '').trim()
  const uid = String(config.uid || 'dsh-chatty')
  const timeoutMs = Number.isFinite(Number(config.timeoutMs))
    ? Number(config.timeoutMs)
    : TTS_DEFAULT_TIMEOUT_MS

  /**
   * 解析鉴权信息。
   * appid 优先取 config.appId（明文 appid 不算敏感信息），否则经 resolveKey(appIdCredential) 解析；
   * access token 一律从凭据取（config.credential 指向的 credential 名）。
   * 任一项缺失都抛 code='credential' 的 Error。
   */
  async function resolveAuth() {
    const token = await resolveTtsCredential(name, resolveKey, credentialName)
    const inlineAppId = String(config.appId ?? config.appid ?? '').trim()
    const appId = inlineAppId || await resolveTtsCredential(name, resolveKey, appIdCredentialName)
    return { appId, token }
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

  /** 真正的一次性 HTTP 合成，返回 base64 字符串。 */
  async function requestAudio({ text, voice, speed, format, signal }) {
    if (typeof fetchImpl !== 'function') {
      throw new Error('volcano TTS requires a fetch implementation')
    }
    const { appId, token } = await resolveAuth()
    const payload = {
      app: { appid: appId, token, cluster },
      user: { uid },
      audio: { voice_type: voice, encoding: format, speed_ratio: speed },
      request: { reqid: randomUUID(), text, operation: 'query' },
    }
    const res = await fetchImpl(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // 火山 v1 TTS 的鉴权头是 `Bearer;<token>`（分号），不是常见的空格分隔。
        Authorization: `Bearer;${token}`,
      },
      body: JSON.stringify(payload),
      signal,
    })
    if (!res || typeof res !== 'object') {
      throw new Error('volcano TTS: fetch implementation returned an invalid response')
    }
    let raw = ''
    try {
      raw = typeof res.text === 'function' ? await res.text() : ''
    } catch (err) {
      if (!res.ok) throw new Error(`volcano TTS HTTP ${res.status}`)
      throw err
    }
    let parsed = null
    try {
      parsed = raw ? JSON.parse(raw) : null
    } catch {
      parsed = null
    }
    if (!res.ok) {
      const detail = parsed && (parsed.message || parsed.error)
      throw new Error(`volcano TTS HTTP ${res.status}${detail ? ` ${detail}` : raw ? ` ${String(raw).slice(0, 300)}` : ''}`)
    }
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('volcano TTS: response is not valid JSON')
    }
    // v1 的成功码在顶层 code；少数网关实现会放在 header.code，这里一并兼容。
    const code = parsed.code !== undefined ? Number(parsed.code)
      : parsed.header && parsed.header.code !== undefined ? Number(parsed.header.code) : Number.NaN
    if (code !== VOLCANO_SUCCESS_CODE) {
      const message = parsed.message || (parsed.header && parsed.header.message) || 'unknown error'
      throw new Error(`volcano TTS error ${Number.isNaN(code) ? 'unknown' : code}: ${message}`)
    }
    const data = typeof parsed.data === 'string' ? parsed.data : ''
    if (!data.trim()) throw new Error('volcano TTS returned no audio data')
    return data
  }

  /** 把 base64 按 4 的整数倍长度切片，保证每片都能独立解码。 */
  function* splitBase64(base64, size = VOLCANO_BASE64_CHUNK_CHARS) {
    const clean = String(base64 || '').replace(/\s+/g, '')
    for (let i = 0; i < clean.length; i += size) {
      yield clean.slice(i, i + size)
    }
  }

  return {
    name,
    capability,

    /**
     * 火山音色不需要远端查询，直接返回静态音色表的过滤结果。
     * @param {{ signal?: AbortSignal }} [listOptions]
     */
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
        const base64 = await requestAudio({ ...request, signal: scope.signal })
        return {
          audio: decodeBase64Audio(base64),
          format: request.format,
          sampleRate: request.sampleRate,
          channels: request.channels,
        }
      } finally {
        scope.dispose()
      }
    },

    /**
     * 「分片流式」：同一次 HTTP 合成，拿到 base64 后分片解码逐块产出。
     * 返回对象是同步的；真正的网络请求在首次迭代 chunks 时才发起（因此凭据错误
     * 也会在迭代时抛出，而不是在 createStream() 调用时）。
     * @param {{ text: string, voice?: string, speed?: number, format?: string, signal?: AbortSignal }} params
     * @returns {{ chunks: AsyncIterable<Uint8Array>, format: string, sampleRate: number, channels: number, cancel: () => void }}
     */
    createStream(params = {}) {
      const request = buildRequest(params)
      const scope = createAbortScope(params.signal, timeoutMs)
      async function* generate() {
        try {
          const base64 = await requestAudio({ ...request, signal: scope.signal })
          for (const piece of splitBase64(base64)) {
            if (scope.aborted) return
            yield decodeBase64Audio(piece)
          }
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
