// 火山引擎（Volcengine）STT Provider：Agent Plan 流式识别（sauc 协议）。
//
// 协议来源（只借鉴协议细节，未复制参考实现的业务逻辑）：
// - Agent Plan 鉴权：一把方舟 API Key（凭据引用 VOLCENGINE_AGENT_PLAN_API_KEY），
//   同时充当 `X-Api-App-Key` 与 `X-Api-Access-Key`（实测 400 缺头 / 401 grant 未开通
//   的错误体证明了头格式正确，授权状态在账号侧）。
// - 流式：`WebSocket {streamUrl}`（默认 /api/v3/plan/sauc/bigmodel_nostream）二进制协议：
//   4 字节头 + 可选 4 字节 sequence + 4 字节 payload 长度 + payload（默认 gzip）。
//   message type 0b0001 full client request / 0b0010 audio only request /
//   0b1001 full server response / 0b1011 server ack / 0b1111 server error。
//   注意 error 帧与其余帧不同：header 之后直接是 error_code(4) + error_size(4) +
//   error_message，没有 payload 长度前缀（与参考实现一致）。
//
// 已知限制 / 不确定处：
// 1. 浏览器原生 WebSocket 不支持自定义 Header，认证头只能经注入的 ws 类实现传递；
//    退化路径（构造器拒绝第二参数）会丢头并记 logger.warn，宿主侧应注入 ws。
// 2. 整段识别没有批量 HTTP 端点：transcribe 内部把完整音频塞进一个流式会话等 final；
//    火山 bigmodel 不接受 webm/opus，调用方应上传 wav/pcm（本模块不做转码）。
// 3. 流式 partial 直接透传服务端累积文本，本模块不做增量拼接。
// 4. 本模块不 import 任何 npm 包，网络与 WebSocket 全部通过参数注入。

import { randomUUID } from 'node:crypto'
import { gzipSync, gunzipSync } from 'node:zlib'

/** 火山 STT 能力声明。 */
export const VOLCANO_STT_CAPABILITY = {
  streaming: true,
  batch: true,
  timestamps: true,
  languages: ['zh-CN', 'en-US', 'auto'],
  partialResult: true,
}

/** 协议 message type。 */
export const VOLCANO_MESSAGE_TYPE = {
  FULL_CLIENT_REQUEST: 0x1,
  AUDIO_ONLY_REQUEST: 0x2,
  FULL_SERVER_RESPONSE: 0x9,
  SERVER_ACK: 0xb,
  SERVER_ERROR: 0xf,
}

/** 协议 flags：0x1 带 sequence，0x2 最后一包。 */
export const VOLCANO_FRAME_FLAG = {
  NONE: 0x0,
  SEQUENCE: 0x1,
  LAST: 0x2,
  SEQUENCE_LAST: 0x3,
}

/** 协议 serialization：0 裸数据，1 JSON。 */
export const VOLCANO_SERIALIZATION = { RAW: 0x0, JSON: 0x1 }

/** 协议 compression：0 不压缩，1 gzip。 */
export const VOLCANO_COMPRESSION = { NONE: 0x0, GZIP: 0x1 }

/** 批量/流式默认 uid。 */
export const VOLCANO_DEFAULT_UID = 'dsh-chatty'

/** 流式建议的音频帧大小（200ms @16kHz 单声道 PCM16），仅作为参考常量导出。 */
export const VOLCANO_AUDIO_CHUNK_BYTES = 6400

/** 火山成功状态码（响应头 x-api-status-code）。 */
const VOLCANO_SUCCESS_STATUS = '20000000'

// 火山只在非中文场景要求显式 language；中文（含 zh-*）走服务端默认值。
const LANGUAGE_REGIONS = {
  en: 'en-US', 'en-us': 'en-US', 'en-gb': 'en-GB',
  ja: 'ja-JP', 'ja-jp': 'ja-JP', ko: 'ko-KR', 'ko-kr': 'ko-KR',
  es: 'es-MX', 'es-mx': 'es-MX', fr: 'fr-FR', 'fr-fr': 'fr-FR',
  de: 'de-DE', 'de-de': 'de-DE', pt: 'pt-BR', 'pt-br': 'pt-BR',
  id: 'id-ID', 'id-id': 'id-ID', ru: 'ru-RU', 'ru-ru': 'ru-RU',
  it: 'it-IT', 'it-it': 'it-IT', ms: 'ms-MY', 'ms-my': 'ms-MY',
}

/**
 * 归一化火山需要的 language 值：中文/自动 → 空串（不传字段），其它映射到区域码。
 * @param {string} [language]
 * @returns {string}
 */
export function volcanoLanguage(language) {
  const value = String(language || '').trim().toLowerCase()
  if (!value || value === 'auto' || value === 'zh' || value.startsWith('zh-')) return ''
  return LANGUAGE_REGIONS[value] || ''
}

function int32(value) {
  const out = Buffer.allocUnsafe(4)
  out.writeInt32BE(value | 0)
  return out
}

function uint32(value) {
  const out = Buffer.allocUnsafe(4)
  out.writeUInt32BE(value >>> 0)
  return out
}

/**
 * 构造一个火山 v3 二进制协议帧。
 * @param {{ type: number, flags?: number, serialization?: number, compression?: number, sequence?: number, payload?: Uint8Array }} spec
 * @returns {Buffer}
 */
export function buildVolcanoFrame(spec) {
  const type = spec.type & 0xf
  const flags = (spec.flags ?? VOLCANO_FRAME_FLAG.NONE) & 0xf
  const serialization = (spec.serialization ?? VOLCANO_SERIALIZATION.RAW) & 0xf
  const compression = (spec.compression ?? VOLCANO_COMPRESSION.NONE) & 0xf
  const body = Buffer.from(spec.payload || Buffer.alloc(0))
  const parts = [Buffer.from([0x11, (type << 4) | flags, (serialization << 4) | compression, 0x00])]
  if (flags & VOLCANO_FRAME_FLAG.SEQUENCE) parts.push(int32(spec.sequence || 0))
  parts.push(uint32(body.length), body)
  return Buffer.concat(parts)
}

/**
 * 构造 full client request（type 0b0001，JSON + gzip，sequence = 1）。
 * @param {{ language?: string, sampleRate?: number, model?: string, uid?: string, showUtterances?: boolean }} [options]
 * @returns {Buffer}
 */
export function buildFullClientRequest(options = {}) {
  const sampleRate = Number(options.sampleRate) > 0 ? Number(options.sampleRate) : 16000
  const audio = { format: 'pcm', codec: 'raw', rate: sampleRate, bits: 16, channel: 1 }
  const region = volcanoLanguage(options.language)
  if (region) audio.language = region
  const payload = gzipSync(Buffer.from(JSON.stringify({
    user: { uid: options.uid || VOLCANO_DEFAULT_UID },
    audio,
    request: {
      model_name: options.model || '',
      enable_itn: true,
      enable_punc: true,
      show_utterances: options.showUtterances !== false,
    },
  })))
  return buildVolcanoFrame({
    type: VOLCANO_MESSAGE_TYPE.FULL_CLIENT_REQUEST,
    flags: VOLCANO_FRAME_FLAG.SEQUENCE,
    serialization: VOLCANO_SERIALIZATION.JSON,
    compression: VOLCANO_COMPRESSION.GZIP,
    sequence: 1,
    payload,
  })
}

/**
 * 构造 audio only request（type 0b0010，gzip 裸音频；最后一包用负 sequence + LAST 标志）。
 * @param {Uint8Array} pcm
 * @param {number} sequence 正数序号；last=true 时自动取负
 * @param {boolean} [last]
 * @returns {Buffer}
 */
export function buildAudioOnlyRequest(pcm, sequence, last = false) {
  const body = Buffer.from(pcm || Buffer.alloc(0))
  return buildVolcanoFrame({
    type: VOLCANO_MESSAGE_TYPE.AUDIO_ONLY_REQUEST,
    flags: last ? VOLCANO_FRAME_FLAG.SEQUENCE_LAST : VOLCANO_FRAME_FLAG.SEQUENCE,
    serialization: VOLCANO_SERIALIZATION.RAW,
    compression: VOLCANO_COMPRESSION.GZIP,
    sequence: last ? -Math.abs(sequence) : Math.abs(sequence),
    payload: gzipSync(body),
  })
}

/**
 * 解析服务端帧。
 * @param {Uint8Array|ArrayBuffer} input
 * @returns {{ type: number, flags: number, sequence: number|null, serialization: number, compression: number, body: any, final: boolean, ack?: boolean, error?: { code: number, message: string } }}
 */
export function parseServerResponse(input) {
  const data = Buffer.from(input)
  if (data.length < 4) throw new Error('火山 STT 返回了不完整的协议帧')
  const headerBytes = Math.max(4, (data[0] & 0x0f) * 4)
  const type = data[1] >> 4
  const flags = data[1] & 0x0f
  const serialization = data[2] >> 4
  const compression = data[2] & 0x0f
  let offset = headerBytes
  let sequence = null
  if (flags & VOLCANO_FRAME_FLAG.SEQUENCE) {
    if (offset + 4 > data.length) throw new Error('火山 STT 返回了不完整的协议帧')
    sequence = data.readInt32BE(offset)
    offset += 4
  }

  if (type === VOLCANO_MESSAGE_TYPE.SERVER_ERROR) {
    if (offset + 8 > data.length) throw new Error('火山 STT 返回了不完整的错误帧')
    const code = data.readUInt32BE(offset)
    offset += 4
    const size = data.readUInt32BE(offset)
    offset += 4
    let detail = data.subarray(offset, Math.min(offset + size, data.length))
    if (compression === VOLCANO_COMPRESSION.GZIP && detail.length) detail = gunzipSync(detail)
    const message = detail.toString('utf8').trim()
    return {
      type, flags, sequence, serialization, compression,
      body: null, final: true,
      error: { code, message: message || `火山 STT 错误码 ${code}` },
    }
  }

  if (type === VOLCANO_MESSAGE_TYPE.SERVER_ACK) {
    // ack 帧没有 payload 长度前缀，只带序号。
    if (sequence === null && offset + 4 <= data.length) sequence = data.readInt32BE(offset)
    return { type, flags, sequence, serialization, compression, body: null, final: false, ack: true }
  }

  if (offset + 4 > data.length) throw new Error('火山 STT 返回了不完整的协议帧')
  const size = data.readUInt32BE(offset)
  offset += 4
  let payload = data.subarray(offset, Math.min(offset + size, data.length))
  if (compression === VOLCANO_COMPRESSION.GZIP && payload.length) payload = gunzipSync(payload)
  let body = payload
  if (serialization === VOLCANO_SERIALIZATION.JSON && payload.length) {
    try {
      body = JSON.parse(payload.toString('utf8'))
    } catch {
      throw new Error('火山 STT 返回了无效 JSON')
    }
  }
  const final = !!(flags & VOLCANO_FRAME_FLAG.LAST) || (typeof sequence === 'number' && sequence < 0)
  return { type, flags, sequence, serialization, compression, body, final }
}

/**
 * 从响应体里取识别文本与分句。
 * 兼容 `result.text`、`result.utterances[].text` 与顶层 `text` 三种形状。
 * @param {any} body
 * @returns {{ text: string, segments: Array<{ text: string, startMs: number|null, endMs: number|null }> }}
 */
export function extractVolcanoResult(body) {
  const result = body && typeof body === 'object' && body.result && typeof body.result === 'object'
    ? body.result
    : null
  const direct = typeof result?.text === 'string'
    ? result.text
    : (typeof body?.text === 'string' ? body.text : '')
  const utterances = Array.isArray(result?.utterances) ? result.utterances : []
  const segments = []
  for (const item of utterances) {
    const text = typeof item?.text === 'string' ? item.text : ''
    if (!text) continue
    segments.push({ text, startMs: pickTime(item, 'start'), endMs: pickTime(item, 'end') })
  }
  const joined = segments.map((segment) => segment.text).join('')
  return { text: (direct || joined).trim(), segments }
}

function pickTime(item, prefix) {
  const candidates = [`${prefix}_time`, `${prefix}Time`, `${prefix}_ms`, `${prefix}Ms`]
  for (const key of candidates) {
    const value = item?.[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return null
}

/** 把任意输入规整成 Uint8Array。 */
export function toAudioBytes(input) {
  if (!input) return new Uint8Array(0)
  if (input instanceof Uint8Array) return input
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
  if (input instanceof ArrayBuffer) return new Uint8Array(input)
  if (Array.isArray(input)) return Uint8Array.from(input)
  throw new TypeError('音频数据必须是 Uint8Array / ArrayBuffer')
}

/** 按 MIME 推断火山 audio.format。 */
export function volcanoAudioFormat(mimeType) {
  const mime = String(mimeType || '').toLowerCase()
  if (mime.includes('wav')) return 'wav'
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3'
  if (mime.includes('ogg') || mime.includes('opus')) return 'ogg'
  if (mime.includes('pcm') || mime.includes('raw')) return 'pcm'
  if (mime.includes('webm')) return 'webm' // 火山 bigmodel 不支持，交由服务端报错（见文件头限制 2）
  return 'wav'
}

function resolveFetchImpl(injected) {
  if (typeof injected === 'function') return injected
  const impl = globalThis.fetch
  if (typeof impl !== 'function') throw new Error('当前运行环境没有全局 fetch，请通过 options.fetchImpl 注入')
  return impl
}

function resolveWebSocketImpl(injected) {
  if (typeof injected === 'function') return injected
  const impl = globalThis.WebSocket
  if (typeof impl !== 'function') {
    throw new Error('当前运行环境没有全局 WebSocket，请通过 options.WebSocketImpl 注入（Node 22+ 自带全局 WebSocket）')
  }
  return impl
}

function bindSocket(socket, handlers) {
  if (typeof socket.on === 'function') {
    // ws 风格：socket.on('open' | 'message' | 'error' | 'close', fn)
    for (const [event, handler] of Object.entries(handlers)) socket.on(event, handler)
    return
  }
  // 浏览器/undici 风格：onopen / onmessage / onerror / onclose
  const properties = { open: 'onopen', message: 'onmessage', error: 'onerror', close: 'onclose' }
  for (const [event, handler] of Object.entries(handlers)) {
    const property = properties[event]
    if (property) socket[property] = handler
  }
}

function closeSocket(socket) {
  if (!socket) return
  try {
    socket.close?.()
  } catch {
    /* 已经关闭 */
  }
}

function readFrameData(raw) {
  if (ArrayBuffer.isView(raw) || raw instanceof ArrayBuffer) return raw
  return raw?.data ?? raw
}

/**
 * 创建火山 STT Provider。
 * @param {object} deps
 * @param {object} deps.config 已合并默认值的配置（见 providers.js STT_DEFAULTS.volcano）
 * @param {(name: string) => Promise<string>} deps.resolveKey 凭据解析
 * @param {Function} [deps.fetchImpl]
 * @param {Function} [deps.WebSocketImpl]
 * @param {{ warn?: Function, debug?: Function }} [deps.logger]
 */
export function createVolcanoStt(deps = {}) {
  const config = deps.config || {}
  const resolveKey = typeof deps.resolveKey === 'function' ? deps.resolveKey : async () => ''
  const logger = deps.logger

  async function readKey(name) {
    if (!name) return ''
    const value = await resolveKey(name)
    return typeof value === 'string' ? value.trim() : ''
  }

  /** 对外报告的 provider 名（Agent Plan 实现）。 */
  const providerName = () => 'volcano'

  /** 读取鉴权信息：Agent Plan 一把 API Key，同时充当 X-Api-App-Key 与 X-Api-Access-Key。 */
  async function readCredentials() {
    const accessKey = await readKey(String(config.credential || ''))
    if (!accessKey) {
      const error = new Error(`volcano credential not configured: ${config.credential || '(agent plan api key)'}`)
      error.code = 'credential'
      throw error
    }
    return { appId: accessKey, accessKey }
  }

  /**
   * 整段识别：Agent Plan 没有批量 HTTP 端点，
   * 把完整音频塞进一个流式会话（full request → audio → last），等 final。
   */
  async function transcribe(request = {}) {
    const started = Date.now()
    const bytes = toAudioBytes(request.audio)
    const language = request.language || config.language || ''
    return new Promise((resolve, reject) => {
      let settled = false
      const settle = (fn, value) => { if (!settled) { settled = true; fn(value) } }
      const stream = createStream({
        language,
        sampleRate: Number(config.sampleRate) > 0 ? Number(config.sampleRate) : 16000,
        signal: request.signal,
        onFinal: (text) => settle(resolve, { text: String(text || ''), provider: providerName(), tookMs: Date.now() - started }),
        onError: (error) => settle(reject, error instanceof Error ? error : new Error(String(error))),
      })
      try { stream.pushAudio(bytes) } catch (error) { settle(reject, error); return }
      stream.stop().catch((error) => settle(reject, error))
    })
  }

  function createStream(streamOptions = {}) {
    const language = streamOptions.language || config.language || ''
    const sampleRate = Number(streamOptions.sampleRate) > 0
      ? Number(streamOptions.sampleRate)
      : (Number(config.sampleRate) > 0 ? Number(config.sampleRate) : 16000)
    const signal = streamOptions.signal
    const loggerRef = logger

    let state = 'connecting' // connecting | open | stopping | closed
    let socket = null
    let cancelled = false
    let deliveredFinal = false
    let finalText = ''
    let failure = null
    let nextSequence = 2 // sequence 1 被 full client request 占用
    let timer = null
    let stopPromise = null
    const buffered = []
    const waiters = []

    const emitPartial = (text) => {
      try { streamOptions.onPartial?.(text) } catch { /* 回调异常不应中断音频流 */ }
    }
    const emitFinal = (text) => {
      if (deliveredFinal) return
      deliveredFinal = true
      try { streamOptions.onFinal?.(text) } catch { /* 同上 */ }
    }
    const emitError = (error) => {
      try { streamOptions.onError?.(error) } catch { /* 同上 */ }
    }

    function clearTimer() {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
    }

    function removeAbort() {
      signal?.removeEventListener?.('abort', onAbort)
    }

    function finish(error) {
      if (state === 'closed') return
      state = 'closed'
      failure = error || null
      clearTimer()
      removeAbort()
      const pending = waiters.splice(0, waiters.length)
      closeSocket(socket)
      socket = null
      for (const resolve of pending) resolve()
    }

    function waitClosed() {
      if (state === 'closed') return Promise.resolve()
      return new Promise((resolve) => waiters.push(resolve))
    }

    function sendAudio(chunk, last) {
      if (!socket || state === 'closed') return
      const sequence = last ? -Math.abs(nextSequence) : nextSequence
      if (!last) nextSequence += 1
      socket.send(buildAudioOnlyRequest(chunk, sequence, last))
    }

    function onOpen() {
      if (state === 'closed') return
      state = 'open'
      try {
        socket.send(buildFullClientRequest({
          language,
          sampleRate,
          model: String(config.model || ''),
          uid: String(config.uid || VOLCANO_DEFAULT_UID),
        }))
      } catch (error) {
        const wrapped = error instanceof Error ? error : new Error(String(error))
        emitError(wrapped)
        finish(wrapped)
        return
      }
      while (buffered.length) sendAudio(buffered.shift(), false)
    }

    function onMessage(raw) {
      if (state === 'closed') return
      let frame
      try {
        frame = parseServerResponse(readFrameData(raw))
      } catch (error) {
        const wrapped = error instanceof Error ? error : new Error(String(error))
        emitError(wrapped)
        finish(wrapped)
        return
      }
      if (frame.error) {
        const error = new Error(`火山 STT ${frame.error.code}：${frame.error.message}`)
        error.code = frame.error.code
        emitError(error)
        finish(error)
        return
      }
      if (frame.type === VOLCANO_MESSAGE_TYPE.SERVER_ACK) return
      const { text } = extractVolcanoResult(frame.body)
      if (text) finalText = text
      if (frame.final) {
        emitFinal(finalText)
        finish(null)
        return
      }
      if (text) emitPartial(text)
    }

    function onClose() {
      if (state === 'closed') return
      if (finalText) {
        emitFinal(finalText)
        finish(null)
        return
      }
      const error = new Error('火山 STT 连接在返回最终结果前断开')
      emitError(error)
      finish(error)
    }

    function onAbort() {
      cancel()
    }

    function openSocket(credentials) {
      if (state === 'closed') return
      const WebSocketImpl = resolveWebSocketImpl(deps.WebSocketImpl)
      const headers = {
        'X-Api-App-Key': credentials.appId,
        'X-Api-Access-Key': credentials.accessKey,
        'X-Api-Resource-Id': String(config.resourceId || ''),
        'X-Api-Request-Id': randomUUID(),
        'X-Api-Connect-Id': randomUUID(),
        'X-Api-Sequence': '-1',
      }
      try {
        socket = new WebSocketImpl(String(config.streamUrl || ''), { headers })
      } catch (error) {
        loggerRef?.warn?.(`火山 STT：WebSocketImpl 不接受 headers 参数，认证头已丢弃（${error?.message || error}）`)
        socket = new WebSocketImpl(String(config.streamUrl || ''))
      }
      bindSocket(socket, { open: onOpen, message: onMessage, error: onSocketError, close: onClose })
    }

    function onSocketError(event) {
      const detail = event?.message || event?.error?.message || event || '未知错误'
      const error = new Error(`火山 STT 连接失败：${detail}`)
      emitError(error)
      finish(error)
    }

    const ready = (async () => {
      const credentials = await readCredentials()
      if (state === 'closed') return
      openSocket(credentials)
    })()
    ready.catch((error) => {
      const wrapped = error instanceof Error ? error : new Error(String(error))
      emitError(wrapped)
      finish(wrapped)
    })

    function pushAudio(bytes) {
      if (state !== 'connecting' && state !== 'open') return
      const chunk = toAudioBytes(bytes)
      if (!chunk.length) return
      if (state === 'connecting') {
        buffered.push(chunk)
        return
      }
      sendAudio(chunk, false)
    }

    function stop() {
      if (stopPromise) return stopPromise
      stopPromise = (async () => {
        if (state === 'closed') {
          if (failure && !deliveredFinal) throw failure
          return
        }
        try {
          await ready
        } catch {
          /* 初始化失败已经通过 onError 上报 */
        }
        if (state === 'closed') {
          if (failure && !deliveredFinal) throw failure
          return
        }
        state = 'stopping'
        const timeoutMs = Number(config.streamTimeoutMs)
        if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
          timer = setTimeout(() => {
            const error = new Error('火山 STT 流式识别超时')
            emitError(error)
            finish(error)
          }, timeoutMs)
          timer?.unref?.()
        }
        try {
          sendAudio(new Uint8Array(0), true)
        } catch (error) {
          const wrapped = error instanceof Error ? error : new Error(String(error))
          emitError(wrapped)
          finish(wrapped)
        }
        await waitClosed()
        if (failure && !deliveredFinal) throw failure
      })()
      return stopPromise
    }

    function cancel() {
      if (state === 'closed') return
      cancelled = true
      finalText = ''
      buffered.length = 0
      failure = null
      finish(null)
    }

    if (signal) {
      if (signal.aborted) cancel()
      else signal.addEventListener?.('abort', onAbort, { once: true })
    }

    return {
      pushAudio,
      stop,
      cancel,
      get closed() { return state === 'closed' },
      get state() { return state },
      get cancelled() { return cancelled },
    }
  }

  return {
    name: 'volcano',
    capability: {
      ...VOLCANO_STT_CAPABILITY,
      languages: [...VOLCANO_STT_CAPABILITY.languages],
    },
    transcribe,
    createStream,
  }
}
