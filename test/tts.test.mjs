/**
 * dsh-chatty — TTS Provider 单元测试。
 *
 * 全部离线：不访问网络、不读取真实 API Key。所有外部调用都通过注入的假 fetchImpl 完成，
 * 凭据通过注入的 resolveKey 提供。
 *
 * 覆盖范围（对应任务要求）：
 *   - capability 形状与未知 Provider 抛错；
 *   - 缺凭据抛 code === 'credential'；
 *   - 火山请求体字段、鉴权头、base64 解码；
 *   - 火山 pcm / mp3 / wav encoding 映射；
 *   - 硅基流动请求体与二进制响应；
 *   - createStream 分块产出顺序 + 内容拼接等于 synthesize 结果；
 *   - speed 映射（火山 speed_ratio / 硅基流动 speed）；
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

/** 假火山成功响应：把字节按 base64 放进 data 字段。 */
function volcanoResponse(bytes, { code = 3000, message = 'Success', ok = true, status = 200 } = {}) {
  return jsonResponse(
    { code, message, data: Buffer.from(bytes).toString('base64') },
    { ok, status },
  )
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

/** 构造火山 Provider（默认注入 appId + token）。 */
function volcanoProvider({ config = {}, resolveKey, fetchImpl, calls = [] } = {}) {
  return createTtsProvider('volcano', {
    config: { appId: 'app-12345', ...config },
    resolveKey: resolveKey || (async (name) => (name === 'VOLCANO_SPEECH' ? 'token-abc' : undefined)),
    fetchImpl: fetchImpl || (async (url, init) => {
      calls.push({ url, init })
      return volcanoResponse(new Uint8Array([1, 2, 3, 4]))
    }),
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
  assert.deepEqual(TTS_DEFAULTS.volcano, {
    credential: 'VOLCANO_SPEECH',
    appIdCredential: 'VOLCANO_SPEECH_APPID',
    model: '',
    voice: 'zh_female_shuangkuaisisi_moon_bigtts',
    cluster: 'volcano_tts',
    baseUrl: 'https://openspeech.bytedance.com/api/v1/tts',
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
  const neverFetch = async () => { throw new Error('不应该发起网络请求') }

  const volcano = createTtsProvider('volcano', {
    config: { appId: 'app-1' },
    resolveKey: async () => undefined,
    fetchImpl: neverFetch,
  })
  await assert.rejects(
    volcano.synthesize({ text: '你好' }),
    (err) => err instanceof Error && err.code === 'credential' && err.provider === 'volcano',
  )

  const siliconflow = createTtsProvider('siliconflow', {
    resolveKey: async () => '',
    fetchImpl: neverFetch,
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

test('火山：缺 appid 时抛 credential（token 已提供）', async () => {
  const provider = createTtsProvider('volcano', {
    config: { appId: '' },
    resolveKey: async (name) => (name === 'VOLCANO_SPEECH' ? 'token-abc' : undefined),
    fetchImpl: async () => { throw new Error('不应该发起网络请求') },
  })
  await assert.rejects(
    provider.synthesize({ text: '你好' }),
    (err) => err.code === 'credential' && err.credential === 'VOLCANO_SPEECH_APPID',
  )
})

test('火山：synthesize 请求体字段、鉴权头与 base64 解码', async () => {
  const calls = []
  const provider = volcanoProvider({ calls })
  const result = await provider.synthesize({
    text: '你好，世界',
    voice: 'zh_female_cancan_mars_bigtts',
    speed: 1.25,
    format: 'pcm',
  })

  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://openspeech.bytedance.com/api/v1/tts')
  assert.equal(calls[0].init.method, 'POST')
  assert.equal(calls[0].init.headers['Content-Type'], 'application/json')
  // 火山 v1 TTS 的鉴权头是 Bearer;token（分号）
  assert.equal(calls[0].init.headers.Authorization, 'Bearer;token-abc')

  const body = JSON.parse(calls[0].init.body)
  assert.deepEqual(body.app, { appid: 'app-12345', token: 'token-abc', cluster: 'volcano_tts' })
  assert.deepEqual(body.user, { uid: 'dsh-chatty' })
  assert.deepEqual(body.audio, {
    voice_type: 'zh_female_cancan_mars_bigtts',
    encoding: 'pcm',
    speed_ratio: 1.25,
  })
  assert.equal(body.request.text, '你好，世界')
  assert.equal(body.request.operation, 'query')
  assert.match(body.request.reqid, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)

  assert.deepEqual(result.audio, new Uint8Array([1, 2, 3, 4]))
  assert.deepEqual(result, {
    audio: new Uint8Array([1, 2, 3, 4]),
    format: 'pcm',
    sampleRate: 24000,
    channels: 1,
  })
})

test('火山：appid 可来自 resolveKey(appIdCredential)', async () => {
  const calls = []
  const provider = createTtsProvider('volcano', {
    config: { appId: undefined },
    resolveKey: async (name) => {
      if (name === 'VOLCANO_SPEECH') return 'token-abc'
      if (name === 'VOLCANO_SPEECH_APPID') return 'app-from-credential'
      return undefined
    },
    fetchImpl: async (url, init) => {
      calls.push({ url, init })
      return volcanoResponse(new Uint8Array([9]))
    },
  })
  await provider.synthesize({ text: '你好' })
  assert.equal(JSON.parse(calls[0].init.body).app.appid, 'app-from-credential')
})

test('火山：pcm / mp3 / wav 三种 encoding 映射', async () => {
  for (const format of ['pcm', 'mp3', 'wav']) {
    const calls = []
    const provider = volcanoProvider({ calls })
    const result = await provider.synthesize({ text: '测试', format })
    assert.equal(JSON.parse(calls[0].init.body).audio.encoding, format)
    assert.equal(result.format, format)
  }
})

test('火山：未指定 format 时默认 pcm', async () => {
  const calls = []
  const provider = volcanoProvider({ calls })
  const result = await provider.synthesize({ text: '测试' })
  assert.equal(JSON.parse(calls[0].init.body).audio.encoding, 'pcm')
  assert.equal(result.format, 'pcm')
})

test('火山：speed 映射到 speed_ratio，缺省为 1', async () => {
  const fast = []
  await volcanoProvider({ calls: fast }).synthesize({ text: '测试', speed: 2 })
  assert.equal(JSON.parse(fast[0].init.body).audio.speed_ratio, 2)

  const slow = []
  await volcanoProvider({ calls: slow }).synthesize({ text: '测试', speed: '0.5' })
  assert.equal(JSON.parse(slow[0].init.body).audio.speed_ratio, 0.5)

  const normal = []
  await volcanoProvider({ calls: normal }).synthesize({ text: '测试' })
  assert.equal(JSON.parse(normal[0].init.body).audio.speed_ratio, 1)
})

test('火山：上游业务错误码与 HTTP 错误都会抛错', async () => {
  const business = volcanoProvider({
    fetchImpl: async () => volcanoResponse(new Uint8Array(0), { code: 3001, message: 'invalid appid' }),
  })
  await assert.rejects(business.synthesize({ text: '你好' }), /volcano TTS error 3001: invalid appid/)

  const http = volcanoProvider({
    fetchImpl: async () => jsonResponse({ code: 3003, message: 'quota exceeded' }, { ok: false, status: 429 }),
  })
  await assert.rejects(http.synthesize({ text: '你好' }), /volcano TTS HTTP 429 quota exceeded/)

  const noData = volcanoProvider({
    fetchImpl: async () => jsonResponse({ code: 3000, message: 'Success' }),
  })
  await assert.rejects(noData.synthesize({ text: '你好' }), /no audio data/)
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

test('火山：createStream 分块产出，拼接结果等于 synthesize', async () => {
  const bytes = new Uint8Array(8000)
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = (i * 7) % 256

  let calls = 0
  const fetchImpl = async () => {
    calls += 1
    return volcanoResponse(bytes)
  }
  const provider = volcanoProvider({ fetchImpl })

  const synthesized = await provider.synthesize({ text: '一段较长的文本' })
  const stream = provider.createStream({ text: '一段较长的文本' })

  assert.equal(stream.format, 'pcm')
  assert.equal(stream.sampleRate, 24000)
  assert.equal(stream.channels, 1)
  assert.equal(typeof stream.cancel, 'function')

  const chunks = []
  for await (const chunk of stream.chunks) chunks.push(chunk)

  assert.equal(calls, 2)
  assert.ok(chunks.length >= 2, '应产出多个分片')
  assert.equal(chunks[0].length, 3072) // 4096 个 base64 字符 = 3072 字节
  assert.deepEqual(joinBytes(chunks), synthesized.audio)
  assert.deepEqual(joinBytes(chunks), bytes)
})

test('火山：createStream 在消费时才解析凭据并抛 credential', async () => {
  const provider = createTtsProvider('volcano', {
    config: { appId: 'app-1' },
    resolveKey: async () => undefined,
    fetchImpl: async () => { throw new Error('不应该发起网络请求') },
  })
  const stream = provider.createStream({ text: '你好' })
  await assert.rejects(
    (async () => { for await (const chunk of stream.chunks) void chunk })(),
    (err) => err.code === 'credential',
  )
})

test('火山：cancel() 后停止产出', async () => {
  const bytes = new Uint8Array(9000).fill(7)
  const provider = volcanoProvider({ fetchImpl: async () => volcanoResponse(bytes) })
  const stream = provider.createStream({ text: '你好' })
  const iterator = stream.chunks[Symbol.asyncIterator]()

  const first = await iterator.next()
  assert.equal(first.done, false)
  assert.equal(first.value.length, 3072)

  stream.cancel()
  const second = await iterator.next()
  assert.equal(second.done, true)
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

test('两个 Provider 的 synthesize 都会把外部 signal 接入 fetch', async () => {
  const seen = []
  // 在 fetch 内部中止外部 signal，验证内部取消作用域会同步跟随
  const record = (controller, responseFactory) => async (url, init) => {
    seen.push({ url, signal: init.signal })
    assert.ok(init.signal instanceof AbortSignal)
    assert.equal(init.signal.aborted, false)
    controller.abort()
    assert.equal(init.signal.aborted, true)
    return responseFactory()
  }

  const volcanoController = new AbortController()
  const volcano = volcanoProvider({
    fetchImpl: record(volcanoController, () => volcanoResponse(new Uint8Array([1]))),
  })
  await volcano.synthesize({ text: '你好', signal: volcanoController.signal })

  const siliconFlowController = new AbortController()
  const siliconflow = siliconFlowProvider({
    fetchImpl: record(siliconFlowController, () => audioResponse(new Uint8Array([1]))),
  })
  await siliconflow.synthesize({ text: '你好', signal: siliconFlowController.signal })

  assert.equal(seen.length, 2)
  assert.match(seen[0].url, /openspeech\.bytedance\.com/)
  assert.match(seen[1].url, /api\.siliconflow\.cn/)
})
