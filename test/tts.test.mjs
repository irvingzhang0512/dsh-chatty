/**
 * dsh-chatty — TTS Provider 单元测试。
 *
 * 全部离线：不访问网络、不读取真实 API Key。火山 Agent Plan（单向流式 WS 合成）通过
 * 注入的假 WebSocket 驱动；硅基流动仍走注入的假 fetchImpl；凭据通过注入的 resolveKey 提供。
 *
 * 覆盖范围（对应任务要求）：
 *   - capability 形状与未知 Provider 抛错；
 *   - 缺凭据抛 code === 'credential'（synthesize 直接抛 / createStream 在迭代时抛）；
 *   - 火山 plan 协议：WS 鉴权头（X-Api-App-Key / X-Api-Access-Key 同一把 Key）、
 *     请求 JSON（user.uid / req_params.text / speaker / audio_params.format|sample_rate|speech_rate）、
 *     sequence 数据块逐块产出、sequence=-100 与 done:true 结束；
 *   - 火山 synthesize 与 createStream 拼接一致、cancel / signal 中止、错误路径；
 *   - 硅基流动请求体与二进制响应；
 *   - createStream 分块产出顺序 + 内容拼接等于 synthesize 结果；
 *   - speed 映射（火山 speech_rate / 硅基流动 speed）；
 *   - 音色列表（火山静态过滤、硅基流动远端 + 失败回落）。
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  STATIC_VOICES,
  TTS_DEFAULTS,
  TTS_PROVIDER_KEYS,
  createTtsProvider,
  ttsCapability,
} from '../lib/tts/providers.js'

/* ------------------------------- 测试工具 ------------------------------- */

/** 等一个宏任务，确保异步链（凭据解析 → WebSocket 建立）已跑完。 */
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

/** 最小的 Headers 替身（只实现 get）。 */
function makeHeaders(map = {}) {
  const store = new Map()
  for (const [key, value] of Object.entries(map)) {
    store.set(String(key).toLowerCase(), String(value))
  }
  return {
    get(key) {
      const lower = String(key).toLowerCase()
      return store.has(lower) ? store.get(lower) : null
    },
  }
}

/** 假 JSON 响应。 */
function jsonResponse(payload, { ok = true, status = 200 } = {}) {
  const text = JSON.stringify(payload)
  return {
    ok,
    status,
    headers: makeHeaders({ 'content-type': 'application/json' }),
    async text() { return text },
    async json() { return JSON.parse(text) },
  }
}

/** 假纯文本响应（用于非 JSON 的错误体）。 */
function textResponse(body, { ok = false, status = 500 } = {}) {
  return {
    ok,
    status,
    headers: makeHeaders({ 'content-type': 'text/plain' }),
    async text() { return body },
  }
}

/**
 * 假音频响应：同时提供 arrayBuffer()（synthesize 用）与 body.getReader()（createStream 用），
 * chunkSizes 控制 reader 的分块边界。
 */
function audioResponse(bytes, chunkSizes = []) {
  const chunks = []
  let offset = 0
  for (const size of chunkSizes) {
    if (offset >= bytes.length) break
    chunks.push(bytes.subarray(offset, Math.min(offset + size, bytes.length)))
    offset += size
  }
  if (offset < bytes.length) chunks.push(bytes.subarray(offset))
  let index = 0
  return {
    ok: true,
    status: 200,
    headers: makeHeaders({ 'content-type': 'application/octet-stream' }),
    async arrayBuffer() {
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    },
    async text() { return '' },
    body: {
      getReader() {
        return {
          async read() {
            if (index >= chunks.length) return { done: true, value: undefined }
            const value = chunks[index]
            index += 1
            return { done: false, value }
          },
          releaseLock() {},
          async cancel() {},
        }
      },
    },
  }
}

/** 测试用拼接（独立实现，避免与实现共享同一份逻辑）。 */
function joinBytes(chunks) {
  let total = 0
  for (const chunk of chunks) total += chunk.length
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

/** 火山 Agent Plan 凭据夹具：resolveKey 只认这一把 Key。 */
const resolveKey = async (name) => (name === 'VOLCENGINE_AGENT_PLAN_API_KEY' ? 'agent-plan-key' : undefined)

/**
 * 火山 plan 合成走 HTTP POST（JSON 行流响应）。
 * fetch 桩：记录每次调用（url/headers/body），按队列返回 JSON 行流响应。
 */
function textStream(text) {
  return new ReadableStream({
    start(controller) { controller.enqueue(Buffer.from(text, 'utf8')); controller.close() },
  })
}
function jsonLinesResponse(lines) {
  const text = lines.map((line) => JSON.stringify(line)).join('\n') + '\n'
  return {
    ok: true, status: 200,
    headers: { get: (name) => (name === 'content-type' ? 'application/json' : null) },
    body: textStream(text),
  }
}
const audioBase64 = (bytes) => Buffer.from(bytes).toString('base64')

function createVolcanoFetchStub(responses) {
  const calls = []
  const queue = responses.slice()
  const fetchImpl = async (url, init) => {
    const response = queue.shift()
    if (!response) throw new Error('no stubbed volcano TTS response')
    calls.push({ url: String(url), headers: init.headers, body: JSON.parse(init.body) })
    return response
  }
  return { fetchImpl, calls }
}

/** 构造火山 Provider（默认注入 Agent Plan API Key 与 HTTP 桩）。 */
function volcanoProvider({ config = {}, resolveKey, fetchImpl } = {}) {
  const defaultStub = createVolcanoFetchStub([jsonLinesResponse([
    { header: { reqid: 'test', code: 0 }, data: audioBase64([1]) },
  ])])
  return createTtsProvider('volcano', {
    config,
    resolveKey: resolveKey || (async (name) => (name === 'VOLCENGINE_AGENT_PLAN_API_KEY' ? 'agent-plan-key' : undefined)),
    fetchImpl: fetchImpl || defaultStub.fetchImpl,
  })
}

/** 构造硅基流动 Provider（默认注入 API Key）。 */
function siliconFlowProvider({ config = {}, resolveKey, fetchImpl } = {}) {
  return createTtsProvider('siliconflow', {
    config,
    resolveKey: resolveKey || (async (name) => (name === 'SILICONFLOW_API_KEY' ? 'sk-test-key' : undefined)),
    fetchImpl,
  })
}

/* --------------------------------- 用例 --------------------------------- */

test('TTS_PROVIDER_KEYS / TTS_DEFAULTS 形状符合契约', () => {
  assert.deepEqual(TTS_PROVIDER_KEYS, ['volcano', 'siliconflow'])
  assert.deepEqual(Object.keys(TTS_DEFAULTS).sort(), [...TTS_PROVIDER_KEYS].sort())
  // 火山：Agent Plan 单向流式合成（与 STT 同一把方舟 API Key；没有 cluster / appIdCredential / baseUrl）
  assert.deepEqual(TTS_DEFAULTS.volcano, {
    credential: 'VOLCENGINE_AGENT_PLAN_API_KEY',
    model: '',
    voice: 'zh_female_shuangkuaisisi_moon_bigtts',
    baseUrl: 'https://openspeech.bytedance.com/api/v3/tts/unidirectional',
    resourceId: 'volc.bigtts',
    sampleRate: 24000,
    format: 'pcm',
  })
  assert.deepEqual(TTS_DEFAULTS.siliconflow, {
    credential: 'SILICONFLOW_API_KEY',
    model: 'FunAudioLLM/CosyVoice2-0.5B',
    voice: 'FunAudioLLM/CosyVoice2-0.5B:alex',
    baseUrl: 'https://api.siliconflow.cn/v1',
    sampleRate: 24000,
    format: 'pcm',
  })
})

test('STATIC_VOICES 条目形状正确且覆盖两个 Provider', () => {
  assert.ok(STATIC_VOICES.length >= 4)
  for (const voice of STATIC_VOICES) {
    assert.deepEqual(Object.keys(voice).sort(), ['id', 'label', 'provider'])
    assert.ok(TTS_PROVIDER_KEYS.includes(voice.provider))
    assert.ok(voice.id.length > 0)
    assert.ok(voice.label.length > 0)
  }
  const providers = new Set(STATIC_VOICES.map((voice) => voice.provider))
  assert.ok(providers.has('volcano'))
  assert.ok(providers.has('siliconflow'))
})

test('ttsCapability 返回契约字段', () => {
  for (const name of TTS_PROVIDER_KEYS) {
    const capability = ttsCapability(name)
    assert.deepEqual(
      Object.keys(capability).sort(),
      ['emotion', 'formats', 'sampleRate', 'speed', 'streaming', 'voices'],
    )
    assert.equal(typeof capability.streaming, 'boolean')
    assert.equal(typeof capability.voices, 'boolean')
    assert.equal(typeof capability.speed, 'boolean')
    assert.equal(capability.emotion, false)
    assert.deepEqual(capability.formats, ['pcm', 'mp3', 'wav'])
    assert.equal(capability.sampleRate, 24000)
  }
})

test('ttsCapability 对未知 Provider 抛错', () => {
  assert.throws(() => ttsCapability('openai'), /unknown TTS provider: openai/)
  assert.throws(() => ttsCapability(''), /unknown TTS provider/)
  assert.throws(() => ttsCapability(undefined), /unknown TTS provider/)
})

test('createTtsProvider 对未知 Provider 抛错', () => {
  assert.throws(() => createTtsProvider('azure'), /unknown TTS provider: azure/)
})

test('createTtsProvider 返回的 Provider 形状符合契约', () => {
  const provider = volcanoProvider()
  assert.deepEqual(
    Object.keys(provider).sort(),
    ['capability', 'createStream', 'listVoices', 'name', 'synthesize'],
  )
  assert.equal(provider.name, 'volcano')
  assert.equal(typeof provider.listVoices, 'function')
  assert.equal(typeof provider.synthesize, 'function')
  assert.equal(typeof provider.createStream, 'function')
  assert.deepEqual(provider.capability, ttsCapability('volcano'))
})

test('缺少凭据时 synthesize 抛 code === "credential"', async () => {
  // 火山：凭据缺失在发起 HTTP 请求前就抛，不会真的建连
  const volcano = createTtsProvider('volcano', {
    resolveKey: async () => undefined,
    fetchImpl: async () => { throw new Error('不应该发起网络请求') },
  })
  await assert.rejects(
    volcano.synthesize({ text: '你好' }),
    (err) => err instanceof Error && err.code === 'credential' && err.provider === 'volcano',
  )

  const siliconflow = createTtsProvider('siliconflow', {
    resolveKey: async () => '',
    fetchImpl: async () => { throw new Error('不应该发起网络请求') },
  })
  await assert.rejects(
    siliconflow.synthesize({ text: '你好' }),
    (err) => err instanceof Error && err.code === 'credential' && err.provider === 'siliconflow',
  )
})

test('缺少 resolveKey 或 resolveKey 抛错时同样抛 credential', async () => {
  const noResolver = createTtsProvider('siliconflow', { fetchImpl: async () => { throw new Error('no') } })
  await assert.rejects(noResolver.synthesize({ text: '你好' }), (err) => err.code === 'credential')

  const throwing = createTtsProvider('siliconflow', {
    resolveKey: async () => { throw new Error('credentials store offline') },
    fetchImpl: async () => { throw new Error('no') },
  })
  await assert.rejects(throwing.synthesize({ text: '你好' }), (err) => err.code === 'credential')
})

test('火山 plan：缺 API Key 时 synthesize 抛 credential 且不发起请求', async () => {
  const { fetchImpl, calls } = createVolcanoFetchStub([])
  const provider = createTtsProvider('volcano', { resolveKey: async () => undefined, fetchImpl })
  await assert.rejects(
    provider.synthesize({ text: '你好' }),
    (err) => err.code === 'credential'
      && err.provider === 'volcano'
      && err.credential === 'VOLCENGINE_AGENT_PLAN_API_KEY',
  )
  assert.equal(calls.length, 0)
})

test('火山 plan：createStream 在迭代时才解析凭据并抛 credential', async () => {
  const { fetchImpl, calls } = createVolcanoFetchStub([])
  const provider = createTtsProvider('volcano', {
    resolveKey: async () => '',
    fetchImpl,
  })
  const stream = provider.createStream({ text: '你好' })
  await assert.rejects(
    (async () => { for await (const chunk of stream.chunks) void chunk })(),
    (err) => err.code === 'credential',
  )
  assert.equal(calls.length, 0)
})

test('火山 plan：synthesize 请求体、鉴权头与音频拼接', async () => {
  const blocks = [Uint8Array.from([1, 2, 3, 4]), Uint8Array.from([5, 6, 7, 8])]
  const { fetchImpl, calls } = createVolcanoFetchStub([jsonLinesResponse([
    { header: { reqid: 'test', code: 0 }, data: audioBase64(blocks[0]) },
    { header: { reqid: 'test', code: 0 }, data: audioBase64(blocks[1]) },
    { header: { reqid: 'test', code: 0 } },
  ])])
  const provider = createTtsProvider('volcano', { resolveKey, fetchImpl })
  const result = await provider.synthesize({
    text: '你好，世界',
    voice: 'zh_female_cancan_mars_bigtts',
    speed: 1.25,
    format: 'pcm',
  })

  // HTTP POST：默认端点，Agent Plan 鉴权头两把都是同一把方舟 API Key
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, TTS_DEFAULTS.volcano.baseUrl)
  assert.equal(calls[0].headers['X-Api-App-Key'], 'agent-plan-key')
  assert.equal(calls[0].headers['X-Api-Access-Key'], 'agent-plan-key')
  assert.equal(calls[0].headers['X-Api-Resource-Id'], TTS_DEFAULTS.volcano.resourceId)
  assert.match(calls[0].headers['X-Api-Request-Id'], /^[0-9a-f-]{36}$/)

  // 请求 JSON 体
  assert.deepEqual(calls[0].body.user, { uid: 'dsh-chatty' })
  assert.equal(calls[0].body.req_params.text, '你好，世界')
  assert.equal(calls[0].body.req_params.speaker, 'zh_female_cancan_mars_bigtts')
  assert.deepEqual(calls[0].body.req_params.audio_params, { format: 'pcm', sample_rate: 24000, speech_rate: 1.25 })

  // 两个 data 块按顺序 base64 解码后拼接
  assert.deepEqual(result.audio, Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]))
  assert.deepEqual(result, {
    audio: Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]),
    format: 'pcm',
    sampleRate: 24000,
    channels: 1,
  })
})

test('火山 plan：config 可覆盖 voice / uid / endpoint / resourceId / sampleRate', async () => {
  const blocks = [Uint8Array.from([9])]
  const { fetchImpl, calls } = createVolcanoFetchStub([jsonLinesResponse([
    { header: { reqid: 'test', code: 0 }, data: audioBase64(blocks[0]) },
  ])])
  const provider = createTtsProvider('volcano', {
    config: {
      voice: 'zh_male_wennuanahu_moon_bigtts',
      uid: 'custom-uid',
      baseUrl: 'https://tts.example.test/unidirectional',
      resourceId: 'volc.custom.tts',
      sampleRate: 16000,
    },
    resolveKey: async (name) => (name === 'VOLCENGINE_AGENT_PLAN_API_KEY' ? 'agent-plan-key' : undefined),
    fetchImpl,
  })
  const result = await provider.synthesize({ text: '测试' })

  assert.equal(calls[0].url, 'https://tts.example.test/unidirectional')
  assert.equal(calls[0].headers['X-Api-Resource-Id'], 'volc.custom.tts')
  assert.equal(calls[0].body.user.uid, 'custom-uid')
  assert.equal(calls[0].body.req_params.speaker, 'zh_male_wennuanahu_moon_bigtts')
  assert.equal(calls[0].body.req_params.audio_params.sample_rate, 16000)
  assert.equal(result.sampleRate, 16000)
})

test('火山 plan：pcm / mp3 / wav 三种 format 映射到 audio_params.format', async () => {
  for (const format of ['pcm', 'mp3', 'wav']) {
    const { fetchImpl, calls } = createVolcanoFetchStub([jsonLinesResponse([
      { header: { reqid: 'test', code: 0 }, data: audioBase64([1]) },
    ])])
    const provider = createTtsProvider('volcano', { resolveKey, fetchImpl })
    const result = await provider.synthesize({ text: '测试', format })
    assert.equal(calls[0].body.req_params.audio_params.format, format)
    assert.equal(result.format, format)
  }
})

test('火山 plan：未指定 format 时默认 pcm', async () => {
  const { fetchImpl, calls } = createVolcanoFetchStub([jsonLinesResponse([
    { header: { reqid: 'test', code: 0 }, data: audioBase64([1]) },
  ])])
  const provider = createTtsProvider('volcano', { resolveKey, fetchImpl })
  const result = await provider.synthesize({ text: '测试' })
  assert.equal(calls[0].body.req_params.audio_params.format, 'pcm')
  assert.equal(result.format, 'pcm')
})

test('火山 plan：speed 映射到 audio_params.speech_rate，缺省为 1', async () => {
  const run = async (speed) => {
    const { fetchImpl, calls } = createVolcanoFetchStub([jsonLinesResponse([
      { header: { reqid: 'test', code: 0 }, data: audioBase64([1]) },
    ])])
    const provider = createTtsProvider('volcano', { resolveKey, fetchImpl })
    const result = await provider.synthesize({ text: '测试', speed })
    assert.equal(calls[0].body.req_params.audio_params.speech_rate, Number(speed ?? 1))
    return result
  }
  await run(2)
  await run('0.5')
  await run(undefined)
})

test('火山 plan：服务端错误 header（非 0 code）转成拒绝', async () => {
  const { fetchImpl } = createVolcanoFetchStub([jsonLinesResponse([
    { header: { reqid: 'test', code: 45000010, message: 'load grant: requested grant not found in SaaS storage' } },
  ])])
  const provider = createTtsProvider('volcano', { resolveKey, fetchImpl })
  await assert.rejects(
    provider.synthesize({ text: '你好' }),
    /volcano TTS error 45000010: load grant/,
  )
})

test('火山 plan：连接失败（fetch 抛错）转成拒绝', async () => {
  const provider = createTtsProvider('volcano', {
    resolveKey,
    fetchImpl: async () => { throw new Error('HTTP 401 Unauthorized') },
  })
  await assert.rejects(provider.synthesize({ text: '你好' }), /HTTP 401 Unauthorized/)
})

test('火山 plan：只有结束行没有音频数据时抛 no audio data', async () => {
  const { fetchImpl } = createVolcanoFetchStub([jsonLinesResponse([
    { header: { reqid: 'test', code: 0 } },
  ])])
  const provider = createTtsProvider('volcano', { resolveKey, fetchImpl })
  await assert.rejects(provider.synthesize({ text: '你好' }), /no audio data/)
})

test('火山 plan：响应流关闭即收尾（无需显式结束行）', async () => {
  const { fetchImpl } = createVolcanoFetchStub([jsonLinesResponse([
    { header: { reqid: 'test', code: 0 }, data: audioBase64([7, 7]) },
  ])])
  const provider = createTtsProvider('volcano', { resolveKey, fetchImpl })
  const result = await provider.synthesize({ text: '你好' })
  assert.deepEqual(result.audio, Uint8Array.from([7, 7]))
})

test('火山：非法 format / speed / 空文本会被拒绝', async () => {
  const provider = volcanoProvider()
  await assert.rejects(provider.synthesize({ text: '你好', format: 'ogg' }), /unsupported TTS format/)
  await assert.rejects(provider.synthesize({ text: '你好', speed: 0 }), /invalid TTS speed/)
  await assert.rejects(provider.synthesize({ text: '   ' }), /text is empty/)
  assert.throws(() => provider.createStream({ text: '你好', format: 'flac' }), /unsupported TTS format/)
})

test('火山：listVoices 返回静态音色表的过滤结果', async () => {
  const provider = volcanoProvider()
  const voices = await provider.listVoices({})
  const expected = STATIC_VOICES
    .filter((voice) => voice.provider === 'volcano')
    .map((voice) => ({ provider: 'volcano', id: voice.id, label: voice.label }))
  assert.deepEqual(voices, expected)
  assert.ok(voices.every((voice) => voice.provider === 'volcano'))
})

test('火山 plan：createStream 分块产出顺序，拼接结果等于 synthesize', async () => {
  const chunkA = Uint8Array.from([1, 2, 3, 4])
  const chunkB = Uint8Array.from([5, 6, 7, 8, 9, 10, 11, 12])
  const lines = [
    { header: { reqid: 'test', code: 0 }, data: audioBase64(chunkA) },
    { header: { reqid: 'test', code: 0 }, data: audioBase64(chunkB) },
    { header: { reqid: 'test', code: 0 } },
  ]

  // 先跑一次 synthesize 作为拼接基准
  const synthStub = createVolcanoFetchStub([jsonLinesResponse(lines)])
  const provider = createTtsProvider('volcano', { resolveKey, fetchImpl: synthStub.fetchImpl })
  const synthesized = await provider.synthesize({ text: '一段较长的文本' })

  // 再跑一次 createStream，逐块产出顺序与内容都应一致
  const streamStub = createVolcanoFetchStub([jsonLinesResponse(lines)])
  const streaming = createTtsProvider('volcano', { resolveKey, fetchImpl: streamStub.fetchImpl })
  const stream = streaming.createStream({ text: '一段较长的文本' })
  assert.equal(stream.format, 'pcm')
  assert.equal(stream.sampleRate, 24000)
  assert.equal(stream.channels, 1)
  assert.equal(typeof stream.cancel, 'function')

  const chunks = []
  for await (const chunk of stream.chunks) chunks.push(chunk)

  assert.deepEqual(chunks, [chunkA, chunkB])
  assert.deepEqual(joinBytes(chunks), synthesized.audio)
  assert.deepEqual(joinBytes(chunks), joinBytes([chunkA, chunkB]))
})

test('火山 plan：cancel() 后停止产出', async () => {
  const { fetchImpl, calls } = createVolcanoFetchStub([jsonLinesResponse([
    { header: { reqid: 'test', code: 0 }, data: audioBase64([1, 2, 3]) },
    { header: { reqid: 'test', code: 0 }, data: audioBase64([9, 9]) },
    { header: { reqid: 'test', code: 0 } },
  ])])
  const provider = createTtsProvider('volcano', { resolveKey, fetchImpl })
  const stream = provider.createStream({ text: '你好' })
  const iterator = stream.chunks[Symbol.asyncIterator]()

  const first = await iterator.next()
  assert.equal(first.done, false)
  assert.deepEqual([...first.value], [1, 2, 3])

  stream.cancel()
  const second = await iterator.next()
  assert.equal(second.done, true)
})

test('火山 plan：外部 signal 中止后停止产出', async () => {
  const controller = new AbortController()
  const { fetchImpl, calls } = createVolcanoFetchStub([jsonLinesResponse([
    { header: { reqid: 'test', code: 0 }, data: audioBase64([4, 5, 6]) },
    { header: { reqid: 'test', code: 0 }, data: audioBase64([9, 9]) },
  ])])
  const provider = createTtsProvider('volcano', { resolveKey, fetchImpl })
  const stream = provider.createStream({ text: '你好', signal: controller.signal })
  const iterator = stream.chunks[Symbol.asyncIterator]()

  const first = await iterator.next()
  assert.equal(first.done, false)
  assert.deepEqual([...first.value], [4, 5, 6])

  controller.abort()
  const second = await iterator.next()
  assert.equal(second.done, true)
  assert.equal(calls.length, 1)
})

test('硅基流动：synthesize 请求体与二进制响应', async () => {
  const calls = []
  const bytes = new Uint8Array([10, 20, 30, 40, 50])
  const provider = siliconFlowProvider({
    fetchImpl: async (url, init) => {
      calls.push({ url, init })
      return audioResponse(bytes)
    },
  })

  const result = await provider.synthesize({ text: '你好，世界', speed: 1.5, format: 'pcm' })

  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://api.siliconflow.cn/v1/audio/speech')
  assert.equal(calls[0].init.method, 'POST')
  assert.equal(calls[0].init.headers.Authorization, 'Bearer sk-test-key')
  assert.equal(calls[0].init.headers['Content-Type'], 'application/json')

  const body = JSON.parse(calls[0].init.body)
  assert.equal(body.model, 'FunAudioLLM/CosyVoice2-0.5B')
  assert.equal(body.input, '你好，世界')
  assert.equal(body.voice, 'FunAudioLLM/CosyVoice2-0.5B:alex')
  assert.equal(body.response_format, 'pcm')
  assert.equal(body.speed, 1.5)
  assert.equal(body.sample_rate, 24000)

  assert.deepEqual(result, {
    audio: bytes,
    format: 'pcm',
    sampleRate: 24000,
    channels: 1,
  })
})

test('硅基流动：response_format 与 sample_rate 按格式夹取', async () => {
  const bodies = []
  const provider = siliconFlowProvider({
    fetchImpl: async (url, init) => {
      bodies.push(JSON.parse(init.body))
      return audioResponse(new Uint8Array([1]))
    },
  })

  await provider.synthesize({ text: '测试', format: 'mp3' })
  assert.equal(bodies[0].response_format, 'mp3')
  // mp3 只支持 32000/44100，24000 会被夹到 44100
  assert.equal(bodies[0].sample_rate, 44100)

  await provider.synthesize({ text: '测试', format: 'wav' })
  assert.equal(bodies[1].response_format, 'wav')
  assert.equal(bodies[1].sample_rate, 24000)

  await provider.synthesize({ text: '测试' })
  assert.equal(bodies[2].response_format, 'pcm')
})

test('硅基流动：speed 映射到 speed 字段，缺省为 1', async () => {
  const bodies = []
  const provider = siliconFlowProvider({
    fetchImpl: async (url, init) => {
      bodies.push(JSON.parse(init.body))
      return audioResponse(new Uint8Array([1]))
    },
  })
  await provider.synthesize({ text: '测试', speed: 0.25 })
  await provider.synthesize({ text: '测试' })
  assert.equal(bodies[0].speed, 0.25)
  assert.equal(bodies[1].speed, 1)
})

test('硅基流动：非 2xx 响应抛出带状态码与详情的错误', async () => {
  const provider = siliconFlowProvider({
    fetchImpl: async () => textResponse('TPM limit reached', { ok: false, status: 429 }),
  })
  await assert.rejects(provider.synthesize({ text: '你好' }), /siliconflow TTS HTTP 429 TPM limit reached/)
})

test('硅基流动：createStream 逐块产出，拼接结果等于 synthesize', async () => {
  const bytes = new Uint8Array(1000)
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = (i * 3) % 256
  const provider = siliconFlowProvider({
    fetchImpl: async () => audioResponse(bytes, [128, 256]),
  })

  const synthesized = await provider.synthesize({ text: '一段文本' })
  const stream = provider.createStream({ text: '一段文本' })
  assert.equal(stream.format, 'pcm')
  assert.equal(stream.sampleRate, 24000)
  assert.equal(stream.channels, 1)

  const chunks = []
  for await (const chunk of stream.chunks) chunks.push(chunk)

  assert.deepEqual(chunks.map((chunk) => chunk.length), [128, 256, 616])
  assert.deepEqual(joinBytes(chunks), synthesized.audio)
  assert.deepEqual(joinBytes(chunks), bytes)
})

test('硅基流动：createStream 的 HTTP 错误在迭代时抛出', async () => {
  const provider = siliconFlowProvider({
    fetchImpl: async () => textResponse('{"message":"model not found"}', { ok: false, status: 404 }),
  })
  const stream = provider.createStream({ text: '你好' })
  await assert.rejects(
    (async () => { for await (const chunk of stream.chunks) void chunk })(),
    /siliconflow TTS HTTP 404 model not found/,
  )
})

test('硅基流动：cancel() 后停止产出', async () => {
  const bytes = new Uint8Array(600)
  const provider = siliconFlowProvider({
    fetchImpl: async () => audioResponse(bytes, [100, 100, 100]),
  })
  const stream = provider.createStream({ text: '你好' })
  const iterator = stream.chunks[Symbol.asyncIterator]()

  const first = await iterator.next()
  assert.equal(first.done, false)
  assert.equal(first.value.length, 100)

  stream.cancel()
  const second = await iterator.next()
  assert.equal(second.done, true)
})

test('硅基流动：listVoices 成功时使用远端音色', async () => {
  const calls = []
  const provider = siliconFlowProvider({
    fetchImpl: async (url, init) => {
      calls.push({ url, init })
      return jsonResponse({
        results: [
          { model: 'fishaudio/fish-speech-1.4', customName: '我的音色', uri: 'speech:mine:abc' },
          { model: 'FunAudioLLM/CosyVoice2-0.5B', uri: 'speech:other:def' },
        ],
      })
    },
  })
  const voices = await provider.listVoices({})
  assert.equal(calls[0].url, 'https://api.siliconflow.cn/v1/audio/voice/list')
  assert.equal(calls[0].init.method, 'GET')
  assert.equal(calls[0].init.headers.Authorization, 'Bearer sk-test-key')
  assert.deepEqual(voices, [
    { provider: 'siliconflow', id: 'speech:mine:abc', label: '我的音色' },
    { provider: 'siliconflow', id: 'speech:other:def', label: 'speech:other:def' },
  ])
})

test('硅基流动：listVoices 失败时回落静态列表', async () => {
  const expected = STATIC_VOICES
    .filter((voice) => voice.provider === 'siliconflow')
    .map((voice) => ({ provider: 'siliconflow', id: voice.id, label: voice.label }))

  const http500 = siliconFlowProvider({
    fetchImpl: async () => textResponse('boom', { ok: false, status: 500 }),
  })
  assert.deepEqual(await http500.listVoices({}), expected)

  const networkDown = siliconFlowProvider({
    fetchImpl: async () => { throw new Error('ECONNREFUSED') },
  })
  assert.deepEqual(await networkDown.listVoices({}), expected)

  const emptyResult = siliconFlowProvider({
    fetchImpl: async () => jsonResponse({ results: [] }),
  })
  assert.deepEqual(await emptyResult.listVoices({}), expected)
})

test('硅基流动：listVoices 缺凭据时不回落，直接抛 credential', async () => {
  const provider = createTtsProvider('siliconflow', {
    resolveKey: async () => undefined,
    fetchImpl: async () => { throw new Error('不应该发起网络请求') },
  })
  await assert.rejects(provider.listVoices({}), (err) => err.code === 'credential')
})

test('硅基流动：synthesize 把外部 signal 接入 fetch', async () => {
  const seen = []
  const controller = new AbortController()
  const provider = siliconFlowProvider({
    fetchImpl: async (url, init) => {
      seen.push({ url, signal: init.signal })
      assert.ok(init.signal instanceof AbortSignal)
      assert.equal(init.signal.aborted, false)
      controller.abort()
      assert.equal(init.signal.aborted, true)
      return audioResponse(new Uint8Array([1]))
    },
  })
  await provider.synthesize({ text: '你好', signal: controller.signal })

  assert.equal(seen.length, 1)
  assert.match(seen[0].url, /api\.siliconflow\.cn/)
})
