// STT Provider 单元测试（node:test + node:assert/strict）。
//
// 全部离线：网络用假 fetchImpl，WebSocket 用假 WebSocketImpl，凭据用假 resolveKey。
// 覆盖范围：providers 契约形状 / 缺凭据 / 火山 Agent Plan 流式（volcano：流式会话与
// 复用流式会话的 transcribe，没有批量 HTTP）/ 硅基流动 multipart / 伪流式分段与 final
// 与过期丢弃 / 火山二进制帧编解码与流式状态迁移。

import test from 'node:test'
import assert from 'node:assert/strict'
import { gzipSync, gunzipSync } from 'node:zlib'

import { STT_PROVIDER_KEYS, STT_DEFAULTS, STT_KNOWN_MODELS, sttCapability, createSttProvider } from '../lib/stt/providers.js'
import {
  VOLCANO_STT_CAPABILITY,
  VOLCANO_MESSAGE_TYPE,
  VOLCANO_FRAME_FLAG,
  VOLCANO_SERIALIZATION,
  VOLCANO_COMPRESSION,
  VOLCANO_DEFAULT_UID,
  volcanoLanguage,
  buildVolcanoFrame,
  buildFullClientRequest,
  buildAudioOnlyRequest,
  parseServerResponse,
  extractVolcanoResult,
  createVolcanoStt,
} from '../lib/stt/volcano.js'
import { SILICONFLOW_STT_CAPABILITY, createSiliconflowStt } from '../lib/stt/siliconflow.js'
import { createPseudoStream, pcm16ToWav } from '../lib/stt/pseudo-stream.js'

// ---------------------------------------------------------------- 测试工具

const KEYS = {
  'VOLCANO_SPEECH_APPID': 'app-123',
  'VOLCANO_SPEECH': 'access-456',
  'VOLCENGINE_AGENT_PLAN_API_KEY': 'agent-plan-key',
  'SILICONFLOW_API_KEY': 'sf-key',
}

const resolveKey = async (name) => KEYS[name] || ''
const resolveNoKey = async () => ''

/** 等一个宏任务，确保所有已排队的微任务（转录回调等）都已跑完。 */
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

function jsonResponse(body, { ok = true, status = 200, headers = {} } = {}) {
  const lower = {}
  for (const [key, value] of Object.entries(headers)) lower[key.toLowerCase()] = value
  return {
    ok,
    status,
    headers: { get: (name) => lower[String(name).toLowerCase()] ?? null },
    async json() { return body },
    async text() { return JSON.stringify(body) },
  }
}

/** 记录调用的假 fetch。 */
function fakeFetch(handler) {
  const calls = []
  const impl = async (url, init = {}) => {
    const call = { url: String(url), init }
    calls.push(call)
    return handler(call, calls.length)
  }
  impl.calls = calls
  return impl
}

/** 模拟 ws 风格（socket.on(...)）的假 WebSocket。 */
class FakeWebSocket {
  static instances = []

  static reset() {
    FakeWebSocket.instances = []
  }

  static last() {
    return FakeWebSocket.instances[FakeWebSocket.instances.length - 1]
  }

  constructor(url, options) {
    this.url = url
    this.options = options
    this.sent = []
    this.closed = false
    this.handlers = new Map()
    FakeWebSocket.instances.push(this)
  }

  on(event, handler) {
    const list = this.handlers.get(event) || []
    list.push(handler)
    this.handlers.set(event, list)
    return this
  }

  emit(event, payload) {
    for (const handler of this.handlers.get(event) || []) handler(payload)
  }

  send(data) {
    if (this.closed) throw new Error('socket already closed')
    this.sent.push(Buffer.from(data))
  }

  close() {
    if (this.closed) return
    this.closed = true
    this.emit('close')
  }

  terminate() {
    this.close()
  }
}

/** 解码客户端发出的火山帧。 */
function decodeClientFrame(input) {
  const data = Buffer.from(input)
  const headerBytes = (data[0] & 0x0f) * 4
  const type = data[1] >> 4
  const flags = data[1] & 0x0f
  const serialization = data[2] >> 4
  const compression = data[2] & 0x0f
  let offset = headerBytes
  let sequence = null
  if (flags & VOLCANO_FRAME_FLAG.SEQUENCE) {
    sequence = data.readInt32BE(offset)
    offset += 4
  }
  const size = data.readUInt32BE(offset)
  offset += 4
  let payload = data.subarray(offset, offset + size)
  if (compression === VOLCANO_COMPRESSION.GZIP && payload.length) payload = gunzipSync(payload)
  const json = serialization === VOLCANO_SERIALIZATION.JSON && payload.length
    ? JSON.parse(payload.toString('utf8'))
    : null
  return { type, flags, sequence, serialization, compression, payload, json }
}

/** 构造服务端响应帧（JSON + gzip）。 */
function serverResponseFrame(body, { sequence = 2, last = false } = {}) {
  return buildVolcanoFrame({
    type: VOLCANO_MESSAGE_TYPE.FULL_SERVER_RESPONSE,
    flags: last ? VOLCANO_FRAME_FLAG.SEQUENCE_LAST : VOLCANO_FRAME_FLAG.SEQUENCE,
    serialization: VOLCANO_SERIALIZATION.JSON,
    compression: VOLCANO_COMPRESSION.GZIP,
    sequence: last ? -Math.abs(sequence) : sequence,
    payload: gzipSync(Buffer.from(JSON.stringify(body))),
  })
}

function uint32(value) {
  const out = Buffer.allocUnsafe(4)
  out.writeUInt32BE(value >>> 0)
  return out
}

/**
 * 构造服务端 error 帧。注意：error 帧没有 payload 长度前缀，
 * header 之后直接是 error_code + error_size + error_message。
 */
function serverErrorFrame(code, message) {
  const detail = Buffer.from(message, 'utf8')
  return Buffer.concat([
    Buffer.from([0x11, VOLCANO_MESSAGE_TYPE.SERVER_ERROR << 4, 0x00, 0x00]),
    uint32(code),
    uint32(detail.length),
    detail,
  ])
}

// ---------------------------------------------------------------- 契约形状

test('STT_PROVIDER_KEYS 与 STT_DEFAULTS 符合契约 §2.6', () => {
  // volcano-classic 已删除：只有 volcano（Agent Plan）与 siliconflow 两家
  assert.deepEqual(STT_PROVIDER_KEYS, ['volcano', 'siliconflow'])

  // volcano：Agent Plan（一把方舟 API Key 走天下，识别走 plan 流式端点，没有批量 HTTP）
  const volcano = STT_DEFAULTS.volcano
  assert.equal(volcano.authMode, 'plan')
  assert.equal(volcano.credential, 'VOLCENGINE_AGENT_PLAN_API_KEY')
  assert.equal(volcano.model, 'doubao-seed-asr-2.0')
  assert.equal(volcano.baseUrl, '')
  assert.equal(volcano.streamUrl, 'wss://openspeech.bytedance.com/api/v3/plan/sauc/bigmodel_nostream')
  assert.equal(volcano.resourceId, 'volc.seedasr.sauc.duration')
  assert.equal(volcano.language, 'zh-CN')

  const siliconflow = STT_DEFAULTS.siliconflow
  assert.equal(siliconflow.credential, 'SILICONFLOW_API_KEY')
  assert.equal(siliconflow.model, 'FunAudioLLM/SenseVoiceSmall')
  assert.equal(siliconflow.baseUrl, 'https://api.siliconflow.cn/v1')
  assert.equal(siliconflow.language, 'zh')

  // 已知模型表：两家各一条，Agent Plan 默认模型打头
  assert.equal(STT_KNOWN_MODELS.volcano[0].id, 'doubao-seed-asr-2.0')
  assert.equal(STT_KNOWN_MODELS.siliconflow[0].id, 'FunAudioLLM/SenseVoiceSmall')
})

test('sttCapability 返回契约规定的形状', () => {
  const expectedKeys = ['batch', 'languages', 'partialResult', 'streaming', 'timestamps']

  const volcano = sttCapability('volcano')
  assert.deepEqual(Object.keys(volcano).sort(), expectedKeys)
  assert.equal(volcano.streaming, true)
  assert.equal(volcano.batch, true)
  assert.equal(volcano.timestamps, true)
  assert.equal(volcano.partialResult, true)
  assert.ok(Array.isArray(volcano.languages) && volcano.languages.length > 0)

  const siliconflow = sttCapability('siliconflow')
  assert.deepEqual(Object.keys(siliconflow).sort(), expectedKeys)
  assert.equal(siliconflow.streaming, false)
  assert.equal(siliconflow.batch, true)
  assert.equal(siliconflow.timestamps, false)
  assert.equal(siliconflow.partialResult, true)

  // 返回的是副本，改动不会污染内部状态
  volcano.languages.push('xx')
  assert.equal(sttCapability('volcano').languages.includes('xx'), false)

  // 两个 provider key 都有 capability
  assert.deepEqual(sttCapability('volcano'), { ...VOLCANO_STT_CAPABILITY, languages: [...VOLCANO_STT_CAPABILITY.languages] })
  assert.deepEqual(sttCapability('siliconflow'), { ...SILICONFLOW_STT_CAPABILITY, languages: [...SILICONFLOW_STT_CAPABILITY.languages] })
})

test('未知 Provider 抛错', () => {
  assert.throws(() => sttCapability('nope'), (error) => error.code === 'provider' && /未知的 STT Provider/.test(error.message))
  assert.throws(() => createSttProvider('nope'), (error) => error.code === 'provider')
  assert.throws(() => createSttProvider(''), (error) => error.code === 'provider')
  // volcano-classic 已随经典批量 HTTP 一并删除，不再是被支持的 provider
  assert.throws(() => sttCapability('volcano-classic'), (error) => error.code === 'provider')
  assert.throws(() => createSttProvider('volcano-classic'), (error) => error.code === 'provider')
})

test('createSttProvider 返回 provider 契约形状', () => {
  const provider = createSttProvider('volcano', { resolveKey, fetchImpl: fakeFetch(() => jsonResponse({})) })
  assert.equal(provider.name, 'volcano')
  assert.equal(typeof provider.transcribe, 'function')
  assert.equal(typeof provider.createStream, 'function')
  assert.deepEqual(provider.capability, sttCapability('volcano'))

  const sf = createSttProvider('siliconflow', { resolveKey, fetchImpl: fakeFetch(() => jsonResponse({})) })
  assert.equal(sf.name, 'siliconflow')
  assert.deepEqual(sf.capability, sttCapability('siliconflow'))
})

test('直接使用 createVolcanoStt / createSiliconflowStt 时可覆盖 streamUrl / resourceId / model', async () => {
  // volcano（Agent Plan）：覆盖流式端点、resourceId 与模型，经假 WS 验证
  FakeWebSocket.reset()
  const volcano = createVolcanoStt({
    config: {
      credential: 'VOLCENGINE_AGENT_PLAN_API_KEY',
      streamUrl: 'wss://example.test/plan/asr',
      resourceId: 'volc.custom.asr',
      model: 'doubao-seed-asr-custom',
      sampleRate: 8000,
    },
    resolveKey,
    WebSocketImpl: FakeWebSocket,
  })
  assert.equal(volcano.name, 'volcano')
  const stream = volcano.createStream({})
  await tick()
  const socket = FakeWebSocket.last()
  assert.ok(socket, '应注入 WebSocketImpl 并建立连接')
  assert.equal(socket.url, 'wss://example.test/plan/asr')
  assert.equal(socket.options.headers['X-Api-App-Key'], 'agent-plan-key')
  assert.equal(socket.options.headers['X-Api-Access-Key'], 'agent-plan-key')
  assert.equal(socket.options.headers['X-Api-Resource-Id'], 'volc.custom.asr')
  socket.emit('open')
  const full = decodeClientFrame(socket.sent[0])
  assert.equal(full.type, VOLCANO_MESSAGE_TYPE.FULL_CLIENT_REQUEST)
  assert.equal(full.json.request.model_name, 'doubao-seed-asr-custom')
  assert.equal(full.json.audio.rate, 8000)
  stream.cancel()

  const sfFetch = fakeFetch(() => jsonResponse({ text: 'ok' }))
  const siliconflow = createSiliconflowStt({
    config: { credential: 'SILICONFLOW_API_KEY', baseUrl: 'https://example.test/v1/', model: 'custom-asr' },
    resolveKey,
    fetchImpl: sfFetch,
  })
  assert.equal(siliconflow.name, 'siliconflow')
  const result = await siliconflow.transcribe({ audio: new Uint8Array([1]), mimeType: 'audio/wav', language: 'en' })
  assert.equal(sfFetch.calls[0].url, 'https://example.test/v1/audio/transcriptions') // 去掉尾部斜杠
  assert.equal(result.text, 'ok')
})

test('config 支持扁平传入，也支持整个插件配置（取 stt 段）', () => {
  const flat = createSttProvider('siliconflow', { config: { model: 'custom-model', language: 'en' } })
  assert.equal(flat.capability.batch, true)

  const calls = []
  const fetchImpl = fakeFetch((call) => {
    calls.push(call)
    return jsonResponse({ text: 'ok' })
  })
  const nested = createSttProvider('siliconflow', {
    config: { stt: { provider: 'siliconflow', model: 'from-nested', language: 'en' } },
    resolveKey,
    fetchImpl,
  })
  return nested.transcribe({ audio: new Uint8Array([1]), mimeType: 'audio/wav' }).then(() => {
    assert.equal(calls[0].init.body.get('model'), 'from-nested')
    assert.equal(calls[0].init.body.get('language'), 'en')
  })
})

// ---------------------------------------------------------------- 缺凭据

test('火山 plan：缺少 Agent Plan API Key 抛 code=credential', async () => {
  const provider = createSttProvider('volcano', {
    resolveKey: resolveNoKey,
    WebSocketImpl: FakeWebSocket,
    fetchImpl: fakeFetch(() => jsonResponse({ result: { text: '不应被调用' } })),
  })
  await assert.rejects(
    () => provider.transcribe({ audio: new Uint8Array([1, 2]), mimeType: 'audio/wav' }),
    (error) => {
      assert.equal(error.code, 'credential')
      assert.match(error.message, /volcano credential not configured/)
      assert.match(error.message, /VOLCENGINE_AGENT_PLAN_API_KEY/)
      return true
    },
  )
})

test('硅基流动批量：缺少凭据抛 code=credential', async () => {
  const provider = createSttProvider('siliconflow', {
    resolveKey: resolveNoKey,
    fetchImpl: fakeFetch(() => jsonResponse({ text: '不应被调用' })),
  })
  await assert.rejects(
    () => provider.transcribe({ audio: new Uint8Array([1, 2]), mimeType: 'audio/wav' }),
    (error) => error.code === 'credential' && /siliconflow credential not configured/.test(error.message),
  )
})

// ---------------------------------------------------------------- 硅基流动批量

test('硅基流动批量：multipart 请求与 {text} 解析', async () => {
  const audio = new Uint8Array([1, 2, 3, 4, 5])
  const fetchImpl = fakeFetch(() => jsonResponse({ text: ' 你好 ' }))
  const provider = createSttProvider('siliconflow', { resolveKey, fetchImpl })

  const result = await provider.transcribe({ audio, mimeType: 'audio/wav', language: 'zh' })

  const call = fetchImpl.calls[0]
  assert.equal(call.url, 'https://api.siliconflow.cn/v1/audio/transcriptions')
  assert.equal(call.init.method, 'POST')
  assert.equal(call.init.headers.authorization, 'Bearer sf-key')
  assert.ok(call.init.body instanceof FormData)
  assert.equal(call.init.body.get('model'), 'FunAudioLLM/SenseVoiceSmall')
  assert.equal(call.init.body.get('language'), 'zh')
  const file = call.init.body.get('file')
  assert.equal(file.size, audio.length)
  assert.equal(file.type, 'audio/wav')
  assert.equal(file.name, 'audio.wav')

  assert.equal(result.text, '你好')
  assert.equal(result.provider, 'siliconflow')
  assert.equal(typeof result.tookMs, 'number')
})

test('硅基流动批量：language=auto 时不发送 language 字段', async () => {
  const fetchImpl = fakeFetch(() => jsonResponse({ text: 'ok' }))
  const provider = createSttProvider('siliconflow', { resolveKey, fetchImpl })

  await provider.transcribe({ audio: new Uint8Array([1]), mimeType: 'audio/mpeg', language: 'auto' })
  assert.equal(fetchImpl.calls[0].init.body.get('language'), null)
  assert.equal(fetchImpl.calls[0].init.body.get('file').name, 'audio.mp3')

  await provider.transcribe({ audio: new Uint8Array([1]), mimeType: 'audio/wav', language: 'en' })
  assert.equal(fetchImpl.calls[1].init.body.get('language'), 'en')
})

test('硅基流动批量：HTTP 失败抛错并带服务端消息', async () => {
  const fetchImpl = fakeFetch(() => jsonResponse(
    { message: 'model not found' },
    { ok: false, status: 404, headers: { 'x-siliconcloud-trace-id': 'trace-1' } },
  ))
  const provider = createSttProvider('siliconflow', { resolveKey, fetchImpl })
  await assert.rejects(
    () => provider.transcribe({ audio: new Uint8Array([1]), mimeType: 'audio/wav' }),
    (error) => /404/.test(error.message) && /model not found/.test(error.message) && /trace-1/.test(error.message),
  )
})

// ---------------------------------------------------------------- 火山协议帧

test('火山协议：full client request 帧编码（gzip + JSON + sequence=1）', () => {
  const frame = buildFullClientRequest({ language: 'zh-CN', sampleRate: 16000, model: 'doubao-seed-asr-2.0' })
  const decoded = decodeClientFrame(frame)

  assert.equal(decoded.type, VOLCANO_MESSAGE_TYPE.FULL_CLIENT_REQUEST)
  assert.equal(decoded.flags, VOLCANO_FRAME_FLAG.SEQUENCE)
  assert.equal(decoded.serialization, VOLCANO_SERIALIZATION.JSON)
  assert.equal(decoded.compression, VOLCANO_COMPRESSION.GZIP)
  assert.equal(decoded.sequence, 1)
  assert.equal(decoded.json.user.uid, VOLCANO_DEFAULT_UID)
  assert.equal(decoded.json.audio.format, 'pcm')
  assert.equal(decoded.json.audio.rate, 16000)
  assert.equal(decoded.json.audio.bits, 16)
  assert.equal(decoded.json.audio.channel, 1)
  assert.equal(decoded.json.audio.language, undefined) // 中文不传 language
  assert.equal(decoded.json.request.model_name, 'doubao-seed-asr-2.0')
  assert.equal(decoded.json.request.show_utterances, true)

  const english = decodeClientFrame(buildFullClientRequest({ language: 'en-US', sampleRate: 16000 }))
  assert.equal(english.json.audio.language, 'en-US')

  assert.equal(volcanoLanguage('zh'), '')
  assert.equal(volcanoLanguage('zh-CN'), '')
  assert.equal(volcanoLanguage('auto'), '')
  assert.equal(volcanoLanguage('en'), 'en-US')
  assert.equal(volcanoLanguage('ja-JP'), 'ja-JP')
})

test('火山协议：audio only 帧与最后一帧（负序号 + LAST）', () => {
  const pcm = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])

  const audio = decodeClientFrame(buildAudioOnlyRequest(pcm, 2, false))
  assert.equal(audio.type, VOLCANO_MESSAGE_TYPE.AUDIO_ONLY_REQUEST)
  assert.equal(audio.flags, VOLCANO_FRAME_FLAG.SEQUENCE)
  assert.equal(audio.sequence, 2)
  assert.equal(audio.serialization, VOLCANO_SERIALIZATION.RAW)
  assert.deepEqual([...audio.payload], [...pcm])

  const last = decodeClientFrame(buildAudioOnlyRequest(new Uint8Array(0), 5, true))
  assert.equal(last.flags, VOLCANO_FRAME_FLAG.SEQUENCE_LAST)
  assert.equal(last.sequence, -5)
  assert.equal(last.payload.length, 0)
})

test('火山协议：server response 帧解析（含 final 判定与文本提取）', () => {
  const body = {
    result: {
      text: '你好世界',
      utterances: [
        { text: '你好', start_time: 0, end_time: 400 },
        { text: '世界', start_time: 400, end_time: 900 },
      ],
    },
  }

  const partial = parseServerResponse(serverResponseFrame(body, { sequence: 2, last: false }))
  assert.equal(partial.type, VOLCANO_MESSAGE_TYPE.FULL_SERVER_RESPONSE)
  assert.equal(partial.sequence, 2)
  assert.equal(partial.final, false)
  assert.equal(partial.body.result.text, '你好世界')

  const final = parseServerResponse(serverResponseFrame(body, { sequence: 3, last: true }))
  assert.equal(final.final, true)
  assert.equal(final.sequence, -3)
  assert.equal(extractVolcanoResult(final.body).segments.length, 2)

  // 负数序号即使没有 LAST 标志也算 final
  const negative = parseServerResponse(buildVolcanoFrame({
    type: VOLCANO_MESSAGE_TYPE.FULL_SERVER_RESPONSE,
    flags: VOLCANO_FRAME_FLAG.SEQUENCE,
    serialization: VOLCANO_SERIALIZATION.JSON,
    compression: VOLCANO_COMPRESSION.GZIP,
    sequence: -4,
    payload: gzipSync(Buffer.from(JSON.stringify({ result: { text: '结束' } }))),
  }))
  assert.equal(negative.final, true)
})

test('火山协议：server ack 与 server error 帧解析', () => {
  const ack = parseServerResponse(buildVolcanoFrame({
    type: VOLCANO_MESSAGE_TYPE.SERVER_ACK,
    flags: VOLCANO_FRAME_FLAG.SEQUENCE,
    sequence: 3,
  }))
  assert.equal(ack.ack, true)
  assert.equal(ack.sequence, 3)
  assert.equal(ack.final, false)

  const error = parseServerResponse(serverErrorFrame(45000001, '参数错误'))
  assert.equal(error.type, VOLCANO_MESSAGE_TYPE.SERVER_ERROR)
  assert.equal(error.final, true)
  assert.equal(error.error.code, 45000001)
  assert.equal(error.error.message, '参数错误')

  assert.throws(() => parseServerResponse(new Uint8Array([0x11])), /不完整/)
})

test('extractVolcanoResult：result.text 优先，其次 utterances，再次顶层 text', () => {
  assert.equal(extractVolcanoResult({ result: { text: 'A', utterances: [{ text: 'B' }] } }).text, 'A')
  assert.equal(extractVolcanoResult({ result: { utterances: [{ text: 'B' }, { text: 'C' }] } }).text, 'BC')
  assert.equal(extractVolcanoResult({ text: 'D' }).text, 'D')
  assert.deepEqual(extractVolcanoResult(null), { text: '', segments: [] })
})

// ---------------------------------------------------------------- 火山流式（Agent Plan）

test('火山流式：open → pushAudio → stop 收到 partial 与 final', async () => {
  FakeWebSocket.reset()
  const partials = []
  const finals = []
  const errors = []
  const provider = createSttProvider('volcano', {
    resolveKey,
    WebSocketImpl: FakeWebSocket,
    logger: { warn: () => {} },
  })

  const stream = provider.createStream({
    language: 'zh-CN',
    sampleRate: 16000,
    onPartial: (text) => partials.push(text),
    onFinal: (text) => finals.push(text),
    onError: (error) => errors.push(error),
  })
  assert.equal(stream.closed, false)
  assert.equal(stream.state, 'connecting')

  // 连接尚未建立时到达的音频应当先缓存
  stream.pushAudio(new Uint8Array(1000))
  await tick()

  const socket = FakeWebSocket.last()
  assert.ok(socket, '应注入 WebSocketImpl 并建立连接')
  assert.equal(socket.url, STT_DEFAULTS.volcano.streamUrl)
  // Agent Plan：X-Api-App-Key 与 X-Api-Access-Key 都填同一把方舟 API Key。
  assert.equal(socket.options.headers['X-Api-App-Key'], 'agent-plan-key')
  assert.equal(socket.options.headers['X-Api-Access-Key'], 'agent-plan-key')
  assert.equal(socket.options.headers['X-Api-Resource-Id'], STT_DEFAULTS.volcano.resourceId)
  assert.equal(socket.options.headers['X-Api-Sequence'], '-1')
  assert.ok(socket.options.headers['X-Api-Request-Id'])

  socket.emit('open')
  assert.equal(stream.state, 'open')
  assert.equal(socket.sent.length, 2) // full client request + 缓存的音频帧

  const full = decodeClientFrame(socket.sent[0])
  assert.equal(full.type, VOLCANO_MESSAGE_TYPE.FULL_CLIENT_REQUEST)
  assert.equal(full.json.request.model_name, STT_DEFAULTS.volcano.model)
  assert.equal(full.json.audio.rate, 16000)

  const bufferedFrame = decodeClientFrame(socket.sent[1])
  assert.equal(bufferedFrame.type, VOLCANO_MESSAGE_TYPE.AUDIO_ONLY_REQUEST)
  assert.equal(bufferedFrame.sequence, 2)
  assert.equal(bufferedFrame.payload.length, 1000)

  stream.pushAudio(new Uint8Array(500))
  assert.equal(decodeClientFrame(socket.sent[2]).sequence, 3)

  const stopPromise = stream.stop()
  await tick() // stop() 需要先 await 凭据解析，最后一帧在下一个微任务发出
  assert.equal(stream.state, 'stopping')
  const lastFrame = decodeClientFrame(socket.sent[3])
  assert.equal(lastFrame.type, VOLCANO_MESSAGE_TYPE.AUDIO_ONLY_REQUEST)
  assert.equal(lastFrame.flags, VOLCANO_FRAME_FLAG.SEQUENCE_LAST)
  assert.equal(lastFrame.sequence, -4)
  assert.equal(lastFrame.payload.length, 0)
  // stop 期间不再接收音频
  stream.pushAudio(new Uint8Array(10))
  assert.equal(socket.sent.length, 4)

  socket.emit('message', serverResponseFrame({ result: { text: '你好' } }, { sequence: 3, last: false }))
  assert.deepEqual(partials, ['你好'])
  assert.deepEqual(finals, [])

  socket.emit('message', serverResponseFrame({ result: { text: '你好世界' } }, { sequence: 4, last: true }))
  await stopPromise

  assert.deepEqual(finals, ['你好世界'])
  assert.deepEqual(errors, [])
  assert.equal(stream.closed, true)
  assert.equal(stream.state, 'closed')
  assert.equal(socket.closed, true)
})

test('火山流式：cancel 后 closed 且不再发送帧、不回调 final/error', async () => {
  FakeWebSocket.reset()
  const finals = []
  const errors = []
  const provider = createSttProvider('volcano', { resolveKey, WebSocketImpl: FakeWebSocket })

  const stream = provider.createStream({
    onFinal: (text) => finals.push(text),
    onError: (error) => errors.push(error),
  })
  await tick()
  const socket = FakeWebSocket.last()
  socket.emit('open')
  stream.pushAudio(new Uint8Array(100))
  const sentBefore = socket.sent.length

  stream.cancel()
  assert.equal(stream.closed, true)
  assert.equal(stream.cancelled, true)
  assert.equal(socket.closed, true)
  assert.equal(socket.sent.length, sentBefore)

  await stream.stop() // 已取消 → 直接 resolve，不 reject
  assert.deepEqual(finals, [])
  assert.deepEqual(errors, [])

  // 取消后到达的帧不应产生回调
  stream.pushAudio(new Uint8Array(100))
  assert.equal(socket.sent.length, sentBefore)
})

test('火山流式：连接在 final 之前断开视为失败', async () => {
  FakeWebSocket.reset()
  const errors = []
  const provider = createSttProvider('volcano', { resolveKey, WebSocketImpl: FakeWebSocket })
  const stream = provider.createStream({ onError: (error) => errors.push(error) })
  await tick()
  const socket = FakeWebSocket.last()
  socket.emit('open')

  const stopPromise = stream.stop()
  socket.emit('close')

  await assert.rejects(() => stopPromise, /断开/)
  assert.equal(errors.length, 1)
  assert.equal(stream.closed, true)
})

test('火山流式：缺少凭据走 onError，stop 以 credential 拒绝', async () => {
  FakeWebSocket.reset()
  const errors = []
  const provider = createSttProvider('volcano', { resolveKey: resolveNoKey, WebSocketImpl: FakeWebSocket })
  const stream = provider.createStream({ onError: (error) => errors.push(error) })

  await tick()
  assert.equal(FakeWebSocket.instances.length, 0)
  assert.equal(errors.length, 1)
  assert.equal(errors[0].code, 'credential')
  assert.equal(stream.closed, true)

  await assert.rejects(() => stream.stop(), (error) => error.code === 'credential')
})

test('火山流式：服务端 error 帧转成 onError', async () => {
  FakeWebSocket.reset()
  const errors = []
  const provider = createSttProvider('volcano', { resolveKey, WebSocketImpl: FakeWebSocket })
  const stream = provider.createStream({ onError: (error) => errors.push(error) })
  await tick()
  const socket = FakeWebSocket.last()
  socket.emit('open')

  socket.emit('message', serverErrorFrame(45000002, '配额不足'))

  assert.equal(errors.length, 1)
  assert.equal(errors[0].code, 45000002)
  assert.match(errors[0].message, /配额不足/)
  assert.equal(stream.closed, true)
})

test('火山流式：signal 中止等价于 cancel', async () => {
  FakeWebSocket.reset()
  const controller = new AbortController()
  const provider = createSttProvider('volcano', { resolveKey, WebSocketImpl: FakeWebSocket })
  const stream = provider.createStream({ signal: controller.signal })
  await tick()
  FakeWebSocket.last().emit('open')

  controller.abort()
  assert.equal(stream.closed, true)
  await stream.stop()
})

test('火山 plan：transcribe 复用流式会话（不发 HTTP，经假 WS 等 final）', async () => {
  FakeWebSocket.reset()
  const fetchImpl = fakeFetch(() => jsonResponse({ result: { text: '不应走 HTTP' } }))
  const provider = createSttProvider('volcano', { resolveKey, fetchImpl, WebSocketImpl: FakeWebSocket })

  const pending = provider.transcribe({ audio: new Uint8Array([1, 2, 3, 4]), mimeType: 'audio/wav' })
  await tick()

  const socket = FakeWebSocket.last()
  assert.ok(socket, 'plan 模式 transcribe 应经流式 WS 会话完成')
  assert.equal(socket.url, STT_DEFAULTS.volcano.streamUrl)
  socket.emit('open')

  // 应发出 full client request 与（含 LAST 标志的）音频帧，全程不发 HTTP
  const sentFrames = socket.sent.map((frame) => decodeClientFrame(frame))
  assert.ok(sentFrames.some((frame) => frame.type === VOLCANO_MESSAGE_TYPE.FULL_CLIENT_REQUEST))
  assert.ok(sentFrames.some((frame) => frame.flags & VOLCANO_FRAME_FLAG.LAST), 'stop 应补发最后一帧')

  socket.emit('message', serverResponseFrame({ result: { text: '整段识别结果' } }, { sequence: 2, last: true }))
  const result = await pending

  assert.equal(result.text, '整段识别结果')
  assert.equal(result.provider, 'volcano')
  assert.equal(typeof result.tookMs, 'number')
  assert.equal(fetchImpl.calls.length, 0) // Agent Plan 没有批量 HTTP 端点
  assert.equal(socket.closed, true)
})

// ---------------------------------------------------------------- 伪流式

test('createPseudoStream 需要注入 transcribe', () => {
  assert.throws(() => createPseudoStream({}), TypeError)
})

test('pcm16ToWav 生成标准 44 字节头', () => {
  const pcm = new Uint8Array(3200)
  const wav = pcm16ToWav(pcm, { sampleRate: 16000, channels: 1 })
  const view = Buffer.from(wav)
  assert.equal(wav.length, 3200 + 44)
  assert.equal(view.toString('ascii', 0, 4), 'RIFF')
  assert.equal(view.toString('ascii', 8, 12), 'WAVE')
  assert.equal(view.toString('ascii', 12, 16), 'fmt ')
  assert.equal(view.readUInt32LE(24), 16000)
  assert.equal(view.readUInt16LE(22), 1)
  assert.equal(view.readUInt16LE(34), 16)
  assert.equal(view.readUInt32LE(40), 3200)
})

test('伪流式：按 chunkMs 分段触发 partial', async () => {
  const calls = []
  const partials = []
  const finals = []
  // 8000Hz * 2B * 100ms = 1600 字节/段
  const stream = createPseudoStream({
    sampleRate: 8000,
    chunkMs: 100,
    wrapChunk: (bytes) => bytes,
    transcribe: async (request) => {
      calls.push(request)
      return `第${calls.length}段`
    },
    onPartial: (text) => partials.push(text),
    onFinal: (text) => finals.push(text),
  })

  stream.pushAudio(new Uint8Array(1600))
  stream.pushAudio(new Uint8Array(1600))
  await tick()

  assert.equal(calls.length, 2)
  assert.equal(calls[0].audio.length, 1600)
  assert.equal(calls[0].final, false)
  assert.equal(calls[1].final, false)
  assert.deepEqual(partials, ['第1段', '第2段'])
  assert.deepEqual(finals, [])

  await stream.stop()
  assert.equal(stream.closed, true)
  // 没有剩余音频 → final 复用最后一次 partial 文本
  assert.deepEqual(finals, ['第2段'])
})

test('伪流式：不足一段的音频在 stop 时作为 final 转录', async () => {
  const calls = []
  const finals = []
  const stream = createPseudoStream({
    sampleRate: 8000,
    chunkMs: 100,
    wrapChunk: (bytes) => bytes,
    transcribe: async (request) => {
      calls.push(request)
      return '尾巴'
    },
    onFinal: (text) => finals.push(text),
  })

  stream.pushAudio(new Uint8Array(800))
  await tick()
  assert.equal(calls.length, 0)

  await stream.stop()
  assert.equal(calls.length, 1)
  assert.equal(calls[0].final, true)
  assert.equal(calls[0].audio.length, 800)
  assert.deepEqual(finals, ['尾巴'])
})

test('伪流式：默认把每段 PCM 包成 WAV 再送转录', async () => {
  const captured = []
  const stream = createPseudoStream({
    sampleRate: 16000,
    chunkMs: 100, // 16000 * 2 * 0.1 = 3200 字节
    transcribe: async (request) => {
      captured.push(request)
      return 'x'
    },
  })

  stream.pushAudio(new Uint8Array(3200))
  await tick()

  assert.equal(captured.length, 1)
  assert.equal(captured[0].mimeType, 'audio/wav')
  assert.equal(captured[0].audio.length, 3200 + 44)
  const view = Buffer.from(captured[0].audio)
  assert.equal(view.toString('ascii', 0, 4), 'RIFF')
  assert.equal(view.readUInt32LE(24), 16000)
  assert.equal(view.readUInt32LE(40), 3200)
})

test('伪流式：重叠转录时丢弃过期结果', async () => {
  const pending = []
  const partials = []
  const stream = createPseudoStream({
    sampleRate: 8000,
    chunkMs: 100,
    wrapChunk: (bytes) => bytes,
    transcribe: () => new Promise((resolve) => pending.push(resolve)),
    onPartial: (text) => partials.push(text),
  })

  stream.pushAudio(new Uint8Array(1600))
  stream.pushAudio(new Uint8Array(1600))
  await tick()
  assert.equal(pending.length, 2)

  // 第 2 段先返回 → 交付
  pending[1]('第二段')
  await tick()
  assert.deepEqual(partials, ['第二段'])

  // 第 1 段后返回 → 过期丢弃
  pending[0]('第一段')
  await tick()
  assert.deepEqual(partials, ['第二段'])
})

test('伪流式：cancel 后不再回调 partial/final', async () => {
  const pending = []
  const partials = []
  const finals = []
  const stream = createPseudoStream({
    sampleRate: 8000,
    chunkMs: 100,
    wrapChunk: (bytes) => bytes,
    transcribe: () => new Promise((resolve) => pending.push(resolve)),
    onPartial: (text) => partials.push(text),
    onFinal: (text) => finals.push(text),
  })

  stream.pushAudio(new Uint8Array(1600))
  await tick()
  stream.cancel()
  assert.equal(stream.closed, true)

  pending[0]('过期结果')
  await tick()
  assert.deepEqual(partials, [])

  await stream.stop()
  assert.deepEqual(finals, [])
})

test('伪流式：signal 中止后不再回调', async () => {
  const controller = new AbortController()
  const finals = []
  const stream = createPseudoStream({
    signal: controller.signal,
    transcribe: async () => '文本',
    onFinal: (text) => finals.push(text),
  })
  controller.abort()
  assert.equal(stream.closed, true)
  await stream.stop()
  assert.deepEqual(finals, [])
})

test('硅基流动：createStream 走伪流式，partial/final 来自批量转录', async () => {
  const fetchImpl = fakeFetch((call) => jsonResponse({ text: `片段${fetchImpl.calls.length}` }))
  const provider = createSttProvider('siliconflow', { resolveKey, fetchImpl })
  const partials = []
  const finals = []

  const stream = provider.createStream({
    sampleRate: 8000,
    language: 'zh',
    onPartial: (text) => partials.push(text),
    onFinal: (text) => finals.push(text),
  })
  assert.equal(stream.closed, false)

  // 默认 chunkMs = 1200 → 8000 * 2 * 1.2 = 19200 字节/段
  stream.pushAudio(new Uint8Array(19200))
  await tick()
  assert.equal(fetchImpl.calls.length, 1)
  assert.equal(fetchImpl.calls[0].url, 'https://api.siliconflow.cn/v1/audio/transcriptions')
  assert.equal(fetchImpl.calls[0].init.body.get('language'), 'zh')
  assert.equal(fetchImpl.calls[0].init.body.get('file').type, 'audio/wav')
  assert.deepEqual(partials, ['片段1'])

  await stream.stop()
  assert.deepEqual(finals, ['片段1'])
  assert.equal(stream.closed, true)
})
