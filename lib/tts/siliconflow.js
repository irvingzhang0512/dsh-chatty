/**
 * dsh-chatty — 硅基流动（SiliconFlow）TTS Provider。
 *
 * API 来源（OpenAI 兼容）：
 *   - 创建文本转语音：https://docs.siliconflow.com/cn/api-reference/audio/create-speech
 *     端点：POST {baseUrl}/audio/speech（默认 baseUrl = https://api.siliconflow.cn/v1）
 *     请求体：{ model, input, voice, response_format, speed, sample_rate }
 *     响应体：**音频二进制**（不是 JSON），需自行消费 response.body / arrayBuffer。
 *   - 参考音频（音色）列表：https://docs.siliconflow.com/cn/api-reference/audio/voice-list
 *     端点：GET {baseUrl}/audio/voice/list → { results: [{ model, customName, text, uri }] }
 *   - 鉴权：Header `Authorization: Bearer <API Key>`。
 *
 * 不确定 / 已做取舍的字段（写清楚以便后续按实测修正）：
 *   1. `sample_rate`：官方文档明确列出该参数（wav/pcm 支持 8000/16000/24000/32000/44100，
 *      mp3 只支持 32000/44100），且**默认值是 44100 而不是 24000**。若按本仓库
 *      TTS_DEFAULTS.siliconflow.sampleRate = 24000 直接上报，浏览器按 24000 播放 44100 的
 *      PCM 会导致音调偏低。因此本实现**额外发送 `sample_rate`**（超出任务描述里给出的四个
 *      字段，属于文档核实后的补充），并保证发送值一定落在该格式的合法集合内；返回的
 *      sampleRate 是「实际生效值」：pcm/wav 用 24000，mp3 用 44100。
 *   2. `stream`：官方文档有 `stream: boolean` 字段但未说明语义（分块音频 or SSE）。V1
 *      **不发送**该字段，避免误解析；createStream 只做「逐块读取 response.body」的客户端转发。
 *   3. `gain`（音量增益，-10~10）与 `references`（双音色）未实现。
 *   4. 音色 id 形如 `FunAudioLLM/CosyVoice2-0.5B:alex`；用户克隆音色是 `speech:<name>:<...>`
 *      （见 voice/list 的 uri 字段）。两者都原样透传，不做校验。
 *   5. voice/list 只返回**用户自定义音色**，系统预置音色不在其中；因此远端列表为空时
 *      回落到 STATIC_VOICES（否则 UI 会一个音色都选不到）。
 *
 * V1 的「分片流式」说明：
 *   createStream 发起的仍是一次普通 POST，只是把响应体按 body reader 的到达节奏逐块
 *   产出（`synthesize` 则等整段读完）。这是客户端分块转发，不是双向流式。
 *
 * 约束：纯 ESM；只 import 本地文件与 Node 内置模块；fetch 通过参数注入。
 */

import {
  createAbortScope,
  iterateResponseBody,
  normalizeSampleRate,
  normalizeTtsFormat,
  normalizeTtsSpeed,
  readAllBytes,
  readJsonBody,
  readTtsErrorDetail,
  resolveTtsCredential,
  ttsCapability,
  TTS_DEFAULT_TIMEOUT_MS,
} from './providers.js'

/** 默认 API 根（TTS_DEFAULTS.siliconflow.baseUrl 的兜底）。 */
export const SILICONFLOW_BASE_URL = 'https://api.siliconflow.cn/v1'

/**
 * 各输出格式允许的采样率（官方文档：wav/pcm 支持 8000~44100，mp3 仅 32000/44100）。
 * 发送非法组合会被服务端拒绝，所以这里先夹到合法值。
 */
export const SILICONFLOW_SAMPLE_RATES = {
  pcm: [8000, 16000, 24000, 32000, 44100],
  wav: [8000, 16000, 24000, 32000, 44100],
  mp3: [32000, 44100],
}

/** 官方语速范围。 */
export const SILICONFLOW_SPEED_RANGE = { min: 0.25, max: 4 }

/**
 * 计算实际生效的采样率：请求值合法就用请求值，否则回落到该格式的默认值
 * （pcm/wav 用 24000，mp3 用 44100 —— 后者是官方默认值，也是唯一稳妥的选择）。
 * @param {'pcm'|'mp3'|'wav'} format
 * @param {number} requested
 * @returns {number}
 */
export function resolveSiliconFlowSampleRate(format, requested) {
  const allowed = SILICONFLOW_SAMPLE_RATES[format] || SILICONFLOW_SAMPLE_RATES.pcm
  const value = Number(requested)
  if (Number.isFinite(value) && allowed.includes(Math.round(value))) return Math.round(value)
  return format === 'mp3' ? 44100 : 24000
}

/**
 * 创建硅基流动 TTS Provider。
 * @param {object} [options]
 * @param {object} [options.config] 用户配置（model/voice/baseUrl/credential/sampleRate/timeoutMs）
 * @param {object} [options.defaults] 默认配置（由 providers.js 传入 TTS_DEFAULTS.siliconflow）
 * @param {Array} [options.staticVoices] 静态音色表（由 providers.js 传入 STATIC_VOICES）
 * @param {(name: string) => Promise<string|undefined>} [options.resolveKey]
 * @param {typeof fetch} [options.fetchImpl]
 * @param {object} [options.logger]
 */
export function createSiliconFlowTtsProvider(options = {}) {
  const {
    config = {},
    defaults = {},
    staticVoices = [],
    resolveKey,
    fetchImpl = globalThis.fetch,
    logger,
  } = options

  const name = 'siliconflow'
  const capability = ttsCapability(name)
  const baseUrl = String(config.baseUrl || defaults.baseUrl || SILICONFLOW_BASE_URL).replace(/\/+$/, '')
  const defaultModel = String(config.model || defaults.model || '')
  const defaultVoice = String(config.voice || defaults.voice || '')
  const requestedSampleRate = normalizeSampleRate(config.sampleRate, Number(defaults.sampleRate) || 24000)
  const credentialName = String(config.credential || defaults.credential || '').trim()
  const timeoutMs = Number.isFinite(Number(config.timeoutMs))
    ? Number(config.timeoutMs)
    : TTS_DEFAULT_TIMEOUT_MS

  /** 解析 API Key；缺失/解析失败抛 code='credential' 的 Error。 */
  function resolveAuth() {
    return resolveTtsCredential(name, resolveKey, credentialName)
  }

  /** 归一化一次合成请求（纯函数，不触网）。 */
  function buildRequest(params = {}) {
    const text = String(params.text ?? '')
    if (!text.trim()) throw new Error('siliconflow TTS text is empty')
    const voice = String(params.voice || defaultVoice)
    if (!voice) throw new Error('siliconflow TTS voice is empty')
    const model = String(params.model || defaultModel)
    if (!model) throw new Error('siliconflow TTS model is empty')
    const format = normalizeTtsFormat(params.format, defaults.format || 'pcm')
    return {
      text,
      voice,
      model,
      format,
      speed: normalizeTtsSpeed(params.speed),
      sampleRate: resolveSiliconFlowSampleRate(format, requestedSampleRate),
      channels: 1,
    }
  }

  /** 组装 POST /audio/speech 的请求参数。 */
  function buildFetchInit(request, apiKey, signal) {
    return {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/octet-stream',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: request.model,
        input: request.text,
        voice: request.voice,
        response_format: request.format,
        speed: request.speed,
        // 官方默认 44100，必须显式指定才能与上报给播放器的 sampleRate 一致。
        sample_rate: request.sampleRate,
      }),
      signal,
    }
  }

  /** 静态音色兜底列表。 */
  function staticVoiceList() {
    return staticVoices
      .filter((voice) => voice && voice.provider === name && voice.id)
      .map((voice) => ({
        provider: name,
        id: String(voice.id),
        label: String(voice.label || voice.id),
      }))
  }

  /** 从远端 voice/list 响应里取出音色数组（兼容多种包裹字段）。 */
  function pickVoiceArray(body) {
    if (Array.isArray(body)) return body
    if (!body || typeof body !== 'object') return []
    for (const key of ['results', 'data', 'voices', 'list']) {
      if (Array.isArray(body[key])) return body[key]
    }
    return []
  }

  /** 把远端条目归一化成 { provider, id, label }。 */
  function toVoice(item) {
    if (typeof item === 'string') {
      const id = item.trim()
      return id ? { provider: name, id, label: id } : null
    }
    if (!item || typeof item !== 'object') return null
    const id = String(item.uri || item.id || item.voice || item.name || '').trim()
    if (!id) return null
    return { provider: name, id, label: String(item.customName || item.name || item.label || id) }
  }

  return {
    name,
    capability,

    /**
     * 查询音色：远端 voice/list 失败（网络/HTTP/结构异常）时回落静态列表；
     * 但**凭据缺失是硬错误**，会直接抛出 code='credential'，不做静默回落。
     * @param {{ signal?: AbortSignal }} [listOptions]
     */
    async listVoices(listOptions = {}) {
      const apiKey = await resolveAuth()
      const fallback = staticVoiceList()
      const scope = createAbortScope(listOptions.signal, timeoutMs)
      try {
        const res = await fetchImpl(`${baseUrl}/audio/voice/list`, {
          method: 'GET',
          headers: { Accept: 'application/json', Authorization: `Bearer ${apiKey}` },
          signal: scope.signal,
        })
        if (!res || !res.ok) {
          throw new Error(await readTtsErrorDetail(res, 'siliconflow TTS voice list'))
        }
        const body = await readJsonBody(res)
        const voices = pickVoiceArray(body).map(toVoice).filter(Boolean)
        return voices.length ? voices : fallback
      } catch (err) {
        if (scope.aborted) throw err
        logger?.warn?.(`[${name}] 音色列表查询失败，回落静态列表：${err && err.message ? err.message : err}`)
        return fallback
      } finally {
        scope.dispose()
      }
    },

    /**
     * 一次性合成：POST /audio/speech，响应体是二进制音频。
     * @param {{ text: string, voice?: string, speed?: number, format?: string, signal?: AbortSignal }} params
     * @returns {Promise<{ audio: Uint8Array, format: string, sampleRate: number, channels: number }>}
     */
    async synthesize(params = {}) {
      const request = buildRequest(params)
      const apiKey = await resolveAuth()
      const scope = createAbortScope(params.signal, timeoutMs)
      try {
        const res = await fetchImpl(
          `${baseUrl}/audio/speech`,
          buildFetchInit(request, apiKey, scope.signal),
        )
        if (!res || !res.ok) {
          throw new Error(await readTtsErrorDetail(res, 'siliconflow TTS'))
        }
        const audio = await readAllBytes(res)
        if (!audio.length) throw new Error('siliconflow TTS returned empty audio')
        return {
          audio,
          format: request.format,
          sampleRate: request.sampleRate,
          channels: request.channels,
        }
      } finally {
        scope.dispose()
      }
    },

    /**
     * 「分片流式」：同一次 POST，逐块读取 response.body 的 reader 并产出。
     * 返回对象是同步的；网络请求与凭据解析都在首次迭代 chunks 时才发生。
     * @param {{ text: string, voice?: string, speed?: number, format?: string, signal?: AbortSignal }} params
     * @returns {{ chunks: AsyncIterable<Uint8Array>, format: string, sampleRate: number, channels: number, cancel: () => void }}
     */
    createStream(params = {}) {
      const request = buildRequest(params)
      const scope = createAbortScope(params.signal, timeoutMs)
      async function* generate() {
        try {
          const apiKey = await resolveAuth()
          const res = await fetchImpl(
            `${baseUrl}/audio/speech`,
            buildFetchInit(request, apiKey, scope.signal),
          )
          if (!res || !res.ok) {
            throw new Error(await readTtsErrorDetail(res, 'siliconflow TTS'))
          }
          for await (const chunk of iterateResponseBody(res)) {
            if (scope.aborted) return
            yield chunk
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
          scope.abort(new Error('siliconflow TTS stream cancelled'))
          logger?.info?.(`[${name}] TTS 流已取消`)
        },
      }
    },
  }
}
