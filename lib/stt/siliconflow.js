// 硅基流动（SiliconFlow）STT Provider。
//
// 协议来源：OpenAI 兼容的 `POST {baseUrl}/audio/transcriptions`，`multipart/form-data`
// 只带 `file` / `model` / 可选 `language` 三个字段，响应为 `{ text }`。
// 参考 dsh-voice-hub/lib/providers.js 的 siliconflow 分支（只借鉴协议细节，
// 未复制其链路/重试/超时业务逻辑）。
//
// 已知限制 / 不确定处：
// 1. 该接口没有原生流式；`createStream()` 复用 pseudo-stream.js 的分段批量伪流式，
//    partial 是「每段独立识别」，段与段之间没有上下文。
// 2. 接口不返回分句/时间戳，故 `capability.timestamps = false`。
// 3. `response_format` / `prompt` 等 OpenAI 扩展字段是否被硅基流动接受未核实，
//    因此只发送 file / model / language（language 为 auto 时整段省略）。
// 4. 音频必须是容器格式（wav / mp3 等）；裸 PCM 由 pseudo-stream.js 包成 WAV 后再发。
// 5. `capability.languages` 是按 SenseVoiceSmall 的公开支持范围列出的候选值，
//    并非从接口动态探测，可能与实际可用集合有偏差。
// 6. 本模块不 import 任何 npm 包；fetch / FormData / Blob 均来自运行时全局或注入。

import { createPseudoStream } from './pseudo-stream.js'

/** 硅基流动 STT 能力声明。 */
export const SILICONFLOW_STT_CAPABILITY = {
  streaming: false, // 无原生流式；createStream 走伪流式
  batch: true,
  timestamps: false,
  languages: ['zh', 'en', 'ja', 'ko', 'yue', 'auto'],
  partialResult: true, // 伪流式能产出 partial
}

function resolveFetchImpl(injected) {
  if (typeof injected === 'function') return injected
  const impl = globalThis.fetch
  if (typeof impl !== 'function') throw new Error('当前运行环境没有全局 fetch，请通过 options.fetchImpl 注入')
  return impl
}

function toAudioBytes(input) {
  if (!input) return new Uint8Array(0)
  if (input instanceof Uint8Array) return input
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
  if (input instanceof ArrayBuffer) return new Uint8Array(input)
  if (Array.isArray(input)) return Uint8Array.from(input)
  throw new TypeError('音频数据必须是 Uint8Array / ArrayBuffer')
}

function audioFileName(mimeType) {
  const mime = String(mimeType || '').toLowerCase()
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'audio.mp3'
  if (mime.includes('ogg') || mime.includes('opus')) return 'audio.ogg'
  if (mime.includes('webm')) return 'audio.webm'
  if (mime.includes('m4a') || mime.includes('mp4')) return 'audio.m4a'
  return 'audio.wav'
}

/** 'auto' / 空值 → 空串（不发送 language 字段）。 */
function normalizeLanguage(language) {
  const value = String(language || '').trim()
  if (!value || value.toLowerCase() === 'auto') return ''
  return value
}

async function readErrorDetail(response, label) {
  let detail = `HTTP ${response?.status ?? '?'}`
  try {
    const body = await response.json()
    const message = body?.message || body?.error?.message || body?.code
    if (message) detail = `${detail}: ${message}`
  } catch {
    /* 响应体不是 JSON */
  }
  const traceId = response?.headers?.get?.('x-siliconcloud-trace-id')
  return `${label} ${detail}${traceId ? `（trace ${traceId}）` : ''}`
}

/**
 * 创建硅基流动 STT Provider。
 * @param {object} deps
 * @param {object} deps.config 已合并默认值的配置（见 providers.js STT_DEFAULTS.siliconflow）
 * @param {(name: string) => Promise<string>} deps.resolveKey 凭据解析
 * @param {Function} [deps.fetchImpl]
 * @param {{ warn?: Function, debug?: Function }} [deps.logger]
 */
export function createSiliconflowStt(deps = {}) {
  const config = deps.config || {}
  const resolveKey = typeof deps.resolveKey === 'function' ? deps.resolveKey : async () => ''

  async function readApiKey() {
    const credential = String(config.credential || '')
    const value = credential ? await resolveKey(credential) : ''
    const key = typeof value === 'string' ? value.trim() : ''
    if (!key) {
      const error = new Error(`siliconflow credential not configured: ${credential || '(credential)'}`)
      error.code = 'credential'
      throw error
    }
    return key
  }

  function baseUrl() {
    return String(config.baseUrl || '').replace(/\/+$/, '')
  }

  async function transcribe(request = {}) {
    const started = Date.now()
    const bytes = toAudioBytes(request.audio)
    const key = await readApiKey()
    const fetchImpl = resolveFetchImpl(deps.fetchImpl)
    const mimeType = typeof request.mimeType === 'string' && request.mimeType ? request.mimeType : 'audio/wav'
    const language = normalizeLanguage(request.language ?? config.language)

    const form = new FormData()
    form.append('file', new Blob([bytes], { type: mimeType }), audioFileName(mimeType))
    form.append('model', String(config.model || ''))
    if (language) form.append('language', language)

    const response = await fetchImpl(`${baseUrl()}/audio/transcriptions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}` },
      body: form,
      signal: request.signal,
    })
    if (!response?.ok) throw new Error(await readErrorDetail(response, '硅基流动 STT'))
    let data
    try {
      data = await response.json()
    } catch {
      throw new Error('硅基流动 STT 返回了无效 JSON')
    }
    const text = typeof data?.text === 'string' ? data.text.trim() : ''
    return { text, provider: 'siliconflow', tookMs: Date.now() - started }
  }

  function createStream(streamOptions = {}) {
    const language = normalizeLanguage(streamOptions.language ?? config.language)
    const sampleRate = Number(streamOptions.sampleRate) > 0
      ? Number(streamOptions.sampleRate)
      : (Number(config.sampleRate) > 0 ? Number(config.sampleRate) : 16000)
    return createPseudoStream({
      // pseudo-stream 会把裸 PCM 包成 WAV，所以这里固定按 audio/wav 上传。
      transcribe: async (request) => (await transcribe({ ...request, mimeType: 'audio/wav' })).text,
      sampleRate,
      chunkMs: Number(config.chunkMs) > 0 ? Number(config.chunkMs) : 1200,
      language,
      mimeType: 'audio/wav',
      signal: streamOptions.signal,
      onPartial: streamOptions.onPartial,
      onFinal: streamOptions.onFinal,
      onError: streamOptions.onError,
      logger: deps.logger,
    })
  }

  return {
    name: 'siliconflow',
    capability: {
      ...SILICONFLOW_STT_CAPABILITY,
      languages: [...SILICONFLOW_STT_CAPABILITY.languages],
    },
    transcribe,
    createStream,
  }
}
