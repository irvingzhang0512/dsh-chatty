// 宿主半边集成测试：用假 ctx 驱动 lib/index.js 注册的真实路由与工具。
//
// 需要 peer 依赖（@deepseek-ai/schemastery、dsh-tools、dsh-credentials、dsh-llm）。
// 本仓库没有把它们写进 dependencies：未安装时本文件整体跳过，`npm test` 仍然全绿；
// 装了 peer 依赖（或按 docs/DEVELOPMENT.md 建立本地链接）后即可跑完整路由验证。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { toCredentialRef } from '../lib/credential-name.js'

let apply = null
let loadError = null
try {
  ({ apply } = await import('../lib/index.js'))
} catch (error) {
  loadError = error
}
const skip = loadError ? `缺少 peer 依赖：${loadError.message}` : false

function toBuf(chunk) {
  if (Buffer.isBuffer(chunk)) return chunk
  if (chunk instanceof Uint8Array) return Buffer.from(chunk)
  return Buffer.from(String(chunk), 'utf8')
}

function makeReq({ method = 'GET', url = '/', body = null, headers = {}, remote = '127.0.0.1' } = {}) {
  const emitter = new EventEmitter()
  const req = {
    method,
    url,
    headers: { host: '127.0.0.1:3080', ...headers },
    socket: { remoteAddress: remote },
    connection: { remoteAddress: remote },
    on(event, listener) { emitter.on(event, listener); return req },
    once(event, listener) { emitter.once(event, listener); return req },
    destroy() { /* 测试里不需要真的断开 */ },
  }
  const payload = body === null || body === undefined ? null : Buffer.from(JSON.stringify(body), 'utf8')
  req.emitter = emitter
  setImmediate(() => {
    if (payload) emitter.emit('data', payload)
    emitter.emit('end')
  })
  return req
}

function makeRes() {
  const emitter = new EventEmitter()
  const res = {
    statusCode: 0,
    headers: {},
    chunks: [],
    ended: false,
    destroyed: false,
    headersSent: false,
    writableEnded: false,
    writeHead(code, headers) { res.statusCode = code; res.headers = headers || {}; res.headersSent = true; return res },
    write(chunk) { if (chunk !== undefined) res.chunks.push(toBuf(chunk)); return true },
    end(chunk) {
      if (chunk !== undefined) res.chunks.push(toBuf(chunk))
      res.ended = true
      res.writableEnded = true
      return res
    },
    on(event, listener) { emitter.on(event, listener); return res },
    once(event, listener) { emitter.once(event, listener); return res },
    destroy() { res.destroyed = true; res.ended = true },
  }
  res.text = () => Buffer.concat(res.chunks).toString('utf8')
  res.json = () => JSON.parse(res.text())
  res.emitter = emitter
  return res
}

function createHarness(config = {}) {
  const routes = new Map()
  const tools = []
  const listeners = new Map()
  const warnings = []
  const secrets = new Map([
    ['VOLCANO_SPEECH', 'volcano-access-key'],
    ['VOLCANO_SPEECH_APPID', 'volcano-app-id'],
    ['SILICONFLOW', 'siliconflow-key'],
  ])
  const scope = { get: () => config }
  const ctx = {
    settings: { register: () => scope },
    inject(services, callback) { if (services.includes('settings')) callback(ctx) },
    effect(fn) {
      const dispose = typeof fn === 'function' ? fn() : undefined
      return () => { if (typeof dispose === 'function') dispose() }
    },
    on(event, handler) { listeners.set(event, handler); return () => listeners.delete(event) },
    get() { return null },
    credentials: {
      async resolve(ref) { return secrets.has(ref) ? { value: secrets.get(ref) } : null },
      async describe(ref) { return { configured: secrets.has(ref), source: secrets.has(ref) ? 'test' : '' } },
    },
    llm: {
      listProviders: () => ['test-provider'],
      listModels: async () => ['test-model'],
      async *stream() {
        yield { type: 'text-delta', text: '润色后的文本' }
      },
    },
    tools: { register(tool) { tools.push(tool) } },
    webServer: { register(route) { routes.set(route.path, route); return () => routes.delete(route.path) } },
    logger: { warn: (...args) => warnings.push(args.map(String).join(' ')) },
  }
  apply(ctx, config)
  return { ctx, routes, tools, listeners, secrets, warnings, config }
}

async function call(harness, path, options = {}) {
  const route = harness.routes.get(path)
  assert.ok(route, `路由未注册：${path}`)
  const req = makeReq({ url: path, ...options })
  const res = makeRes()
  await route.handler(req, res)
  if (options.waitEnd !== false) {
    for (let i = 0; i < 200 && !res.ended; i += 1) await new Promise((resolve) => setTimeout(resolve, 5))
  }
  return { res, req }
}

function withFetch(handler, run) {
  const original = globalThis.fetch
  globalThis.fetch = handler
  return Promise.resolve()
    .then(run)
    .finally(() => { globalThis.fetch = original })
}

test('宿主：注册了全部 V1 路由与 transcribe_audio 工具', { skip }, () => {
  const harness = createHarness()
  const expected = [
    '/dsh-chatty/status',
    '/dsh-chatty/config-info',
    '/dsh-chatty/draft',
    '/dsh-chatty/draft/polish',
    '/dsh-chatty/stt/transcribe',
    '/dsh-chatty/stt/stream/start',
    '/dsh-chatty/stt/stream/push',
    '/dsh-chatty/stt/stream/events',
    '/dsh-chatty/stt/stream/stop',
    '/dsh-chatty/tts/synthesize',
    '/dsh-chatty/tts/voices',
    '/dsh-chatty/speech/events',
    '/dsh-chatty/speech/render',
    '/dsh-chatty/speech/stop',
  ]
  for (const path of expected) assert.equal(harness.routes.has(path), true, `缺少路由 ${path}`)
  assert.equal(harness.tools.length, 1)
  assert.equal(harness.tools[0].name, 'transcribe_audio')
  assert.equal(harness.listeners.has('session/event'), true)
})

test('宿主：/status 下发 UI 需要的配置与 capability', { skip }, async () => {
  const harness = createHarness()
  const { res } = await call(harness, '/dsh-chatty/status')
  assert.equal(res.statusCode, 200)
  const body = res.json()
  assert.equal(body.ok, true)
  assert.equal(body.stt.provider, 'volcano')
  assert.equal(body.stt.vad.pre_roll_ms, 400)
  assert.equal(body.stt.capability.streaming, true)
  assert.equal(body.tts.capability.streaming, true)
  assert.equal(body.voice_control.command_mode, 'exact')
  assert.equal(body.voice_control.commands.send.includes('发送'), true)
  assert.equal(body.ui.show_voice_bar, true)
  assert.equal(body.draft.auto_send, false)
})

test('宿主：/config-info 归一化凭据名并报告配置状态', { skip }, async () => {
  const harness = createHarness({ stt: { credential: 'volcano-speech' } })
  const { res } = await call(harness, '/dsh-chatty/config-info')
  const body = res.json()
  assert.equal(body.ok, true)
  const speech = body.stt.credentials.find((item) => item.requested === 'volcano-speech')
  assert.equal(speech.name, 'VOLCANO_SPEECH')
  assert.equal(speech.configured, true)
  assert.equal(body.stt.providers.map((item) => item.key).join(','), 'volcano,siliconflow')
  assert.equal(body.tts.voices.length > 0, true)
  assert.deepEqual(body.models, [{ provider: 'test-provider', model: 'test-model' }])
})

test('宿主：/draft 的 add / edit / undo / clear 与「整句才是指令」', { skip }, async () => {
  const harness = createHarness()
  const post = (body) => call(harness, '/dsh-chatty/draft', { method: 'POST', body })

  let result = await post({ sessionId: 's1', action: 'add', text: '今天我们讨论一下语音插件。' })
  let body = result.res.json()
  assert.equal(body.draft.text, '今天我们讨论一下语音插件。')
  assert.deepEqual(body.effects, ['setDraft'])
  assert.equal(body.command, null)

  // 反例：包含指令词但整句不是指令 → 仍然是正文（需求 §5.2）。
  result = await post({ sessionId: 's1', action: 'add', text: '这个请求发送以后需要等待服务器响应' })
  body = result.res.json()
  assert.equal(body.command, null)
  assert.equal(body.draft.size, 2)

  // 整句「发送」→ 指令，且不进入草稿。
  result = await post({ sessionId: 's1', action: 'add', text: '发送' })
  body = result.res.json()
  assert.equal(body.command.name, 'send')
  assert.deepEqual(body.effects, ['submit'])
  assert.equal(body.draft.size, 2)

  result = await post({ sessionId: 's1', action: 'edit', text: '编辑后的整段' })
  body = result.res.json()
  assert.equal(body.draft.text, '编辑后的整段')

  result = await post({ sessionId: 's1', action: 'undo' })
  body = result.res.json()
  assert.equal(body.removed, 1)
  assert.equal(body.draft.text, '')

  await post({ sessionId: 's1', action: 'add', text: '再写一句。' })
  result = await post({ sessionId: 's1', action: 'clear' })
  body = result.res.json()
  assert.equal(body.draft.text, '')
  assert.equal(body.removed, 1)
})

test('宿主：/draft 拒绝空文本与未知 action，且校验来源', { skip }, async () => {
  const harness = createHarness()
  let { res } = await call(harness, '/dsh-chatty/draft', { method: 'POST', body: { action: 'add', text: '   ' } })
  assert.equal(res.statusCode, 400)
  assert.equal(res.json().error.code, 'empty')

  ;({ res } = await call(harness, '/dsh-chatty/draft', { method: 'POST', body: { action: 'nope' } }))
  assert.equal(res.statusCode, 400)
  assert.equal(res.json().error.code, 'action')

  ;({ res } = await call(harness, '/dsh-chatty/draft', {
    method: 'POST',
    remote: '10.1.2.3',
    headers: { origin: 'http://evil.test' },
    body: { action: 'clear' },
  }))
  assert.equal(res.statusCode, 403)
})

test('宿主：/draft polish 走 DSH LLM，失败时原样返回', { skip }, async () => {
  const harness = createHarness({ polish: { enabled: true, provider: 'test-provider', model_id: 'test-model' } })
  const { res } = await call(harness, '/dsh-chatty/draft', {
    method: 'POST', body: { sessionId: 's1', action: 'polish', text: '嗯那个我们今天讨论一下语音插件' },
  })
  assert.equal(res.json().draft.text, '润色后的文本')

  const noLlm = createHarness({ polish: { enabled: false } })
  const second = await call(noLlm, '/dsh-chatty/draft/polish', { method: 'POST', body: { text: '原样返回' } })
  assert.equal(second.res.json().text, '原样返回')
})

test('宿主：/stt/transcribe 用火山批量接口识别（假 fetch）', { skip }, async () => {
  const harness = createHarness()
  const calls = []
  const fetchStub = async (url, init) => {
    calls.push({ url: String(url), headers: init.headers, body: JSON.parse(init.body) })
    return {
      ok: true,
      status: 200,
      headers: { get: (name) => (name === 'x-api-status-code' ? '20000000' : null) },
      json: async () => ({ result: { text: '你好，这是识别结果。' } }),
    }
  }
  await withFetch(fetchStub, async () => {
    const { res } = await call(harness, '/dsh-chatty/stt/transcribe', {
      method: 'POST',
      body: { dataBase64: Buffer.from('RIFF____WAVE').toString('base64'), mimeType: 'audio/wav' },
    })
    const body = res.json()
    assert.equal(body.ok, true)
    assert.equal(body.text, '你好，这是识别结果。')
    assert.equal(body.provider, 'volcano')
    assert.equal(calls.length, 1)
    assert.equal(calls[0].headers['X-Api-App-Key'], 'volcano-app-id')
    assert.equal(calls[0].headers['X-Api-Access-Key'], 'volcano-access-key')
    assert.equal(calls[0].body.audio.format, 'wav')
    assert.equal(calls[0].body.request.model_name, 'volc.bigasr.auc_turbo')
  })
})

test('宿主：/tts/synthesize 输出 PCM 与正确的响应头（假 fetch）', { skip }, async () => {
  const harness = createHarness()
  const pcm = Buffer.alloc(64, 3)
  const payload = JSON.stringify({ code: 3000, data: pcm.toString('base64') })
  const fetchStub = async () => ({
    ok: true,
    status: 200,
    text: async () => payload,
    json: async () => JSON.parse(payload),
  })
  await withFetch(fetchStub, async () => {
    const { res } = await call(harness, '/dsh-chatty/tts/synthesize', {
      method: 'POST', body: { text: '请朗读这一句。' },
    })
    assert.equal(res.statusCode, 200)
    assert.equal(res.headers['X-Audio-Format'], 'pcm')
    assert.equal(res.headers['X-Audio-Sample-Rate'], '24000')
    assert.equal(res.headers['X-Audio-Channels'], '1')
    assert.equal(Buffer.concat(res.chunks).length, pcm.length)
    assert.deepEqual(Buffer.concat(res.chunks), pcm)
  })
})

test('宿主：/speech/render 跳过代码、摘要表格（不逐格朗读）', { skip }, async () => {
  const harness = createHarness()
  const markdown = [
    '# 结论',
    '',
    '先说结论。',
    '',
    '```python',
    'def start():',
    '    pass',
    '```',
    '',
    '| 模型 | 延迟 |',
    '| A | 500 ms |',
    '| B | 200 ms |',
  ].join('\n')
  const { res } = await call(harness, '/dsh-chatty/speech/render', {
    method: 'POST', body: { sessionId: 's1', markdown },
  })
  const body = res.json()
  assert.equal(body.ok, true)
  const text = body.segments.map((item) => item.text).join(' ')
  assert.equal(text.includes('先说结论'), true)
  assert.equal(text.includes('def start'), false, '代码内容不能被朗读')
  assert.equal(text.includes('|'), false, '表格不能逐格朗读')
  assert.equal(body.segments.some((item) => item.kind === 'table'), true)
})

test('宿主：session/event → SSE speech.segment，stop 打断队列', { skip }, async () => {
  const harness = createHarness({ tts: { auto_read: true } })
  const route = harness.routes.get('/dsh-chatty/speech/events')
  const req = makeReq({ url: '/dsh-chatty/speech/events?sessionId=s1' })
  const res = makeRes()
  await route.handler(req, res)
  assert.equal(res.headersSent, true)

  const onEvent = harness.listeners.get('session/event')
  onEvent({ id: 's1' }, {
    type: 'assistant/chunk', seq: 1,
    data: { turn: 1, step: 1, chunk: { type: 'text-delta', text: '这是第一句回复。' } },
  })
  const streamed = res.text()
  assert.equal(streamed.includes('event: speech.segment'), true)
  assert.equal(streamed.includes('这是第一句回复。'), true)

  // 其它会话的事件不应串台。
  const before = res.text().length
  onEvent({ id: 's2' }, {
    type: 'assistant/chunk', seq: 2,
    data: { turn: 1, step: 1, chunk: { type: 'text-delta', text: '另一个会话的回复。' } },
  })
  assert.equal(res.text().length, before)

  const stop = await call(harness, '/dsh-chatty/speech/stop', { method: 'POST', body: { sessionId: 's1' } })
  assert.equal(stop.res.json().ok, true)
  assert.equal(stop.res.json().generation >= 1, true)
  assert.equal(res.text().includes('event: speech.cancel'), true)
  // 关闭 SSE：否则 keepalive 定时器会让测试进程无法退出。
  req.emitter.emit('close')
})

test('宿主：手动朗读回落到最近一次 Assistant 回复', { skip }, async () => {
  const harness = createHarness()
  const onEvent = harness.listeners.get('session/event')
  onEvent({ id: 's9' }, {
    type: 'assistant/chunk', seq: 1,
    data: { turn: 1, step: 1, chunk: { type: 'text-delta', text: '最近一次回复的内容。' } },
  })
  const { res } = await call(harness, '/dsh-chatty/speech/render', { method: 'POST', body: { sessionId: 's9' } })
  const body = res.json()
  assert.equal(body.segments.length, 1)
  assert.equal(body.segments[0].text.includes('最近一次回复的内容'), true)

  const empty = await call(harness, '/dsh-chatty/speech/render', { method: 'POST', body: { sessionId: 'nobody' } })
  assert.equal(empty.res.json().segments.length, 0)
  assert.equal(empty.res.json().empty, true)
})

test('宿主：流式 STT 会话 start / push / stop（硅基流动伪流式，假 fetch）', { skip }, async () => {
  const harness = createHarness({
    stt: { provider: 'siliconflow', streaming: true, language: 'zh' },
    timeout_ms: 5000,
  })
  const fetchStub = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ text: '流式识别结果' }),
  })
  await withFetch(fetchStub, async () => {
    const start = await call(harness, '/dsh-chatty/stt/stream/start', {
      method: 'POST', body: { sampleRate: 16000 },
    })
    const started = start.res.json()
    assert.equal(started.ok, true)
    assert.equal(typeof started.streamId, 'string')

    const eventsRoute = harness.routes.get('/dsh-chatty/stt/stream/events')
    const sseReq = makeReq({ url: `/dsh-chatty/stt/stream/events?streamId=${started.streamId}` })
    const sseRes = makeRes()
    await eventsRoute.handler(sseReq, sseRes)

    // 16000Hz / 16bit / 单声道 → 1.2 秒 = 38400 字节，正好触发一次分段转录。
    const chunk = Buffer.alloc(38400, 1)
    const push = await call(harness, '/dsh-chatty/stt/stream/push', {
      method: 'POST', body: { streamId: started.streamId, seq: 1, dataBase64: chunk.toString('base64') },
    })
    assert.equal(push.res.json().ok, true)
    for (let i = 0; i < 100 && !sseRes.text().includes('event: partial'); i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    assert.equal(sseRes.text().includes('event: partial'), true)

    const stop = await call(harness, '/dsh-chatty/stt/stream/stop', {
      method: 'POST', body: { streamId: started.streamId },
    })
    assert.equal(stop.res.json().ok, true)

    const unknown = await call(harness, '/dsh-chatty/stt/stream/push', {
      method: 'POST', body: { streamId: 'nope', dataBase64: chunk.toString('base64') },
    })
    assert.equal(unknown.res.statusCode, 404)
    sseReq.emitter.emit('close')
  })
})

test('宿主：凭据名归一化（连字符写法也能解析）', { skip }, () => {
  assert.equal(toCredentialRef('volcano-speech'), 'VOLCANO_SPEECH')
  assert.equal(toCredentialRef('VOLCANO_SPEECH'), 'VOLCANO_SPEECH')
  assert.equal(toCredentialRef('siliconflow'), 'SILICONFLOW')
  assert.equal(toCredentialRef('Volcano Speech'), 'VOLCANO_SPEECH')
  assert.equal(toCredentialRef('  '), '')
})

test('宿主：/status 只接受 GET，POST 返回 405', { skip }, async () => {
  const harness = createHarness()
  const { res } = await call(harness, '/dsh-chatty/status', { method: 'POST' })
  assert.equal(res.statusCode, 405)
})

test('宿主：transcribe_audio 工具读取音频文件并返回转录', { skip }, async () => {
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const path = await import('node:path')
  const dir = await mkdtemp(path.join(tmpdir(), 'dsh-chatty-'))
  const file = path.join(dir, 'sample.wav')
  // 44 字节 WAV 头 + 少量 PCM，避免工具因为「文件太小」而拒绝。
  const wav = Buffer.alloc(44 + 320)
  wav.write('RIFF', 0, 'ascii')
  wav.write('WAVE', 8, 'ascii')
  wav.write('data', 36, 'ascii')
  wav.writeUInt32LE(320, 40)
  await writeFile(file, wav)

  const harness = createHarness()
  const tool = harness.tools[0]
  const fetchStub = async () => ({
    ok: true,
    status: 200,
    headers: { get: (name) => (name === 'x-api-status-code' ? '20000000' : null) },
    json: async () => ({ result: { text: '文件里的语音内容' } }),
  })

  try {
    await withFetch(fetchStub, async () => {
      const value = await tool.execute({ file_path: file }, { signal: new AbortController().signal })
      assert.equal(value.provider, 'volcano')
      assert.equal(value.text, '文件里的语音内容')
      assert.equal(Number.isInteger(value.tookMs), true)
      const rendered = tool.output.render({}, value)
      assert.equal(rendered[0].type, 'text')
      assert.equal(rendered[0].text.includes('文件里的语音内容'), true)
    })

    await assert.rejects(
      () => tool.execute({ file_path: path.join(dir, 'missing.wav') }, { signal: new AbortController().signal }),
      /file not found/,
    )
    await assert.rejects(
      () => tool.execute({}, { signal: new AbortController().signal }),
      /missing required property "file_path"/,
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
