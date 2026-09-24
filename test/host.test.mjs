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
    ['VOLCENGINE_AGENT_PLAN_API_KEY', 'volcano-plan-key'],
    ['SILICONFLOW_API_KEY', 'siliconflow-key'],
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

/** 把全局 WebSocket 换成立即失败的假实现：验证「不发起流式/网络」且测试不挂起。 */
function withBrokenWebSocket(run) {
  const original = globalThis.WebSocket
  class BrokenWebSocket {
    constructor() {
      setTimeout(() => { if (this.onerror) this.onerror({ message: 'no network in test' }) }, 0)
    }
    send() { /* no-op */ }
    close() { /* no-op */ }
  }
  globalThis.WebSocket = BrokenWebSocket
  return Promise.resolve()
    .then(run)
    .finally(() => { globalThis.WebSocket = original })
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
  assert.equal(body.stt.capability.streaming, true, 'volcano 走 plan 流式识别')
  assert.equal(body.tts.capability.streaming, true)
  assert.equal(body.voice_control.command_mode, 'exact')
  assert.equal(body.voice_control.commands.send.includes('发送'), true)
  assert.equal(body.ui.show_voice_bar, true)
  assert.equal(body.draft.auto_send, false)
})

test('宿主：/config-info 报告两个 Provider、模型下拉数据与凭据状态', { skip }, async () => {
  const harness = createHarness({ stt: { credential: 'volcano-speech' } })
  const { res } = await call(harness, '/dsh-chatty/config-info')
  const body = res.json()
  assert.equal(body.ok, true)
  // 经典凭据名的归一化仍然有效。
  const speech = body.stt.credentials.find((item) => item.requested === 'volcano-speech')
  assert.equal(speech.name, 'VOLCANO_SPEECH')
  assert.equal(speech.configured, true)
  // 两个 Provider + 每家的下拉模型与默认凭据名。
  assert.equal(body.stt.providers.map((item) => item.key).join(','), 'volcano,siliconflow')
  const plan = body.stt.providers.find((item) => item.key === 'volcano')
  assert.equal(plan.authMode, 'plan')
  assert.equal(plan.defaultCredential, 'VOLCENGINE_AGENT_PLAN_API_KEY')
  assert.equal(plan.models[0].id, 'doubao-seed-asr-2.0')
  // TTS 默认 siliconflow（用户已有 SILICONFLOW_API_KEY）。
  assert.equal(body.tts.providers[0].key, 'volcano')
  assert.equal(body.tts.voices.length > 0, true)
  assert.deepEqual(body.models, [{ provider: 'test-provider', model: 'test-model' }])
})

test('宿主：/credentials/state 汇报凭据文件与每把 Key 的状态', { skip }, async () => {
  const { mkdtemp } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const path = await import('node:path')
  const dir = await mkdtemp(path.join(tmpdir(), 'dsh-chatty-cred-'))
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = dir
  try {
    const harness = createHarness({
      stt: { credential: 'VOLCENGINE_AGENT_PLAN_API_KEY' },
      tts: { credential: 'CHATTY_MISSING_KEY' },
    })
    const { res } = await call(harness, '/dsh-chatty/credentials/state')
    const body = res.json()
    assert.equal(body.ok, true)
    assert.equal(body.path, path.join(dir, '.credentials.yaml'))
    assert.equal(body.exists, false)
    // STT 的 Agent Plan Key 已配置。
    const stt = body.credentials.find((item) => item.role.includes('STT'))
    assert.equal(stt.name, 'VOLCENGINE_AGENT_PLAN_API_KEY')
    assert.equal(stt.configured, true)
    // TTS 的 Key 未配置，且两条同名凭据会被去重。
    const tts = body.credentials.find((item) => item.role.includes('TTS'))
    assert.equal(tts.name, 'CHATTY_MISSING_KEY')
    assert.equal(tts.configured, false)
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
    await (await import('node:fs/promises')).rm(dir, { recursive: true, force: true })
  }
})

test('宿主：/credentials/open 首次创建凭据骨架文件（不真的唤起编辑器）', { skip }, async () => {
  const { mkdtemp, readFile, rm } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const path = await import('node:path')
  const dir = await mkdtemp(path.join(tmpdir(), 'dsh-chatty-cred-'))
  const previous = process.env.DSH_HOME
  const previousSkip = process.env.DSH_CHATTY_SKIP_OPEN
  process.env.DSH_HOME = dir
  process.env.DSH_CHATTY_SKIP_OPEN = '1'
  try {
    const harness = createHarness()
    const first = await call(harness, '/dsh-chatty/credentials/open', { method: 'POST', body: {} })
    let body = first.res.json()
    assert.equal(body.ok, true)
    assert.equal(body.created, true)
    assert.equal(body.opened, false)
    const content = await readFile(body.path, 'utf8')
    assert.equal(content.includes('refs: {}'), true)
    assert.equal(content.includes('VOLCENGINE_AGENT_PLAN_API_KEY'), true)

    const second = await call(harness, '/dsh-chatty/credentials/open', { method: 'POST', body: {} })
    assert.equal(second.res.json().created, false)
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
    if (previousSkip === undefined) delete process.env.DSH_CHATTY_SKIP_OPEN
    else process.env.DSH_CHATTY_SKIP_OPEN = previousSkip
    await rm(dir, { recursive: true, force: true })
  }
})

test('宿主：/draft v0.3 听写直写——草稿类 action 已废弃，仅保留 polish', { skip }, async () => {
  const harness = createHarness()
  const post = (body) => call(harness, '/dsh-chatty/draft', { method: 'POST', body })

  // 听写直写模式：识别结果由浏览器直接写入输入框，宿主草稿操作全部退役。
  for (const action of ['add', 'edit', 'undo', 'clear', 'cancel', 'command']) {
    const { res } = await post({ sessionId: 's1', action, text: '任意' })
    assert.equal(res.statusCode, 410, `${action} 应返回 410`)
    assert.equal(res.json().error.code, 'deprecated')
  }

  // GET 仍可读取（兼容旧客户端）。
  const draftRoute = harness.routes.get('/dsh-chatty/draft')
  const getReq = makeReq({ url: '/dsh-chatty/draft?sessionId=s1' })
  const getRes = makeRes()
  await draftRoute.handler(getReq, getRes)
  assert.equal(getRes.json().ok, true)
})

test('宿主：/draft polish 需要可信来源', { skip }, async () => {
  const harness = createHarness()
  const { res } = await call(harness, '/dsh-chatty/draft', {
    method: 'POST',
    remote: '10.1.2.3',
    headers: { origin: 'http://evil.test' },
    body: { action: 'polish', text: '你好' },
  })
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

test('宿主：/stt/transcribe 硅基流动走批量 HTTP（假 fetch）', { skip }, async () => {
  const harness = createHarness({ stt: { provider: 'siliconflow', credential: 'SILICONFLOW_API_KEY' } })
  const calls = []
  const fetchStub = async (url, init) => {
    calls.push({ url: String(url) })
    return {
      ok: true,
      status: 200,
      json: async () => ({ text: '你好，这是识别结果。' }),
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
    assert.equal(body.provider, 'siliconflow')
    assert.equal(calls.length, 1)
    assert.match(calls[0].url, /api\.siliconflow\.cn\/v1\/audio\/transcriptions/)
  })
})

test('宿主：/stt/transcribe 默认 Agent Plan 不走批量 HTTP（plan 无批量端点）', { skip }, async () => {
  const harness = createHarness({ stt: { provider: 'volcano', credential: 'VOLCENGINE_AGENT_PLAN_API_KEY' } })
  const calls = []
  const fetchStub = async (url, init) => { calls.push(String(url)); throw new Error('plan 模式不应发起 HTTP 批量请求') }
  await withFetch(fetchStub, async () => {
    await withBrokenWebSocket(async () => {
      const { res } = await call(harness, '/dsh-chatty/stt/transcribe', {
        method: 'POST',
        body: { dataBase64: Buffer.from('RIFF____WAVE').toString('base64'), mimeType: 'audio/wav' },
      })
      // plan 模式 transcribe 内部走流式协议（这里流式连接被打桩为失败），但绝不能打批量端点。
      assert.equal(calls.length, 0)
      assert.equal(res.json().ok, false)
    })
  })
})

test('宿主：/stt/transcribe 火山 Agent Plan 不走批量 HTTP（plan 无批量端点）', { skip }, async () => {
  const harness = createHarness({ stt: { provider: 'volcano', credential: 'VOLCENGINE_AGENT_PLAN_API_KEY' } })
  const calls = []
  const fetchStub = async (url, init) => { calls.push(String(url)); throw new Error('plan 模式不应发起 HTTP 批量请求') }
  await withFetch(fetchStub, async () => {
    await withBrokenWebSocket(async () => {
      const { res } = await call(harness, '/dsh-chatty/stt/transcribe', {
        method: 'POST',
        body: { dataBase64: Buffer.from('RIFF____WAVE').toString('base64'), mimeType: 'audio/wav' },
      })
      // plan 模式 transcribe 内部走流式协议（这里流式连接被打桩为失败），但绝不能打批量端点。
      assert.equal(calls.length, 0)
      assert.equal(res.json().ok, false)
    })
  })
})

test('宿主：/tts/synthesize 硅基流动输出 PCM 与正确的响应头（假 fetch）', { skip }, async () => {
  const harness = createHarness({ tts: { provider: 'siliconflow', credential: 'SILICONFLOW_API_KEY' } })
  const pcm = Buffer.alloc(64, 3)
  const fetchStub = async (url, init) => {
    const body = JSON.parse(init.body)
    assert.equal(body.model, 'FunAudioLLM/CosyVoice2-0.5B')
    assert.equal(body.response_format, 'pcm')
    return {
      ok: true,
      status: 200,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(pcm)
          controller.close()
        },
      }),
    }
  }
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

  // siliconflow 有批量 HTTP 端点可被 fetch 桩拦截；火山 Agent Plan 走流式协议（另有协议层用例覆盖）。
  const harness = createHarness({ stt: { provider: 'siliconflow', credential: 'SILICONFLOW_API_KEY' } })
  const tool = harness.tools[0]
  const fetchStub = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => ({ text: '文件里的语音内容' }),
  })

  try {
    await withFetch(fetchStub, async () => {
      const value = await tool.execute({ file_path: file }, { signal: new AbortController().signal })
      assert.equal(value.provider, 'siliconflow')
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
