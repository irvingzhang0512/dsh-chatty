import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import { apply, Config } from '../lib/index.js'
import {
  fieldsOf,
  unpack,
  token,
  createSettingsBridge,
  migrationOf,
  validateCommands
} from '../lib/native-settings.js'
import { createDraftLedger } from '../lib/draft-ledger.js'
import { createStreamSessions } from '../lib/stream-session.js'
import { isTrustedCaller } from '../lib/http-util.js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

function harness() {
  const cfg = Config({})
  const routes = new Map(),
    cleanups = [],
    registered = new Map()
  const names = [
    '@irvingzhang0512/dsh-chatty',
    ...Object.keys(
      JSON.parse(
        fs.readFileSync(new URL('../compatibility.json', import.meta.url))
      ).speechPackages
    )
  ]
  const rows = names.map((name, i) => ({
    options: {
      name,
      id: i === 0 ? 'dsh-chatty' : name.split('/').at(-1),
      config: i === 0 ? {} : {}
    },
    parent: { tree: { ctx: { baseUrl: 'file:///fixture/' } } },
    fiber: {
      config: i === 0 ? cfg : {},
      runtime: { Config: i === 0 ? Config : undefined }
    },
    async update(p) {
      Object.assign(this.options, p)
    }
  }))
  const listeners = new Map()
  const speech = {
    listProviders:()=>[{id:'sensevoice-local',languages:['auto','zh']},...[...registered.values()].map(p=>p.info)],
    snapshot: () => ({
      selection: { providerId: 'sensevoice-local', language: 'auto' },
      providers: [
        {
          id: 'sensevoice-local',
          location: 'host-local',
          languages: ['auto', 'zh'],
          preparation: { phase: 'ready' }
        }
      ]
    }),
    register: (p) => {
      registered.set(p.info.id, p)
      return async () => registered.delete(p.info.id)
    },
    resolve: (p) => p
  }
  const remote = {
    catalog: () => ({
      ...speech.snapshot(),
      maxAudioBytes: 4194304,
      maxDurationSeconds: 120
    }),
    transcribe: async (p) => {
      assert.equal(p.providerId, 'sensevoice-local')
      assert.ok(p.audioBase64)
      return { text: '官方识别结果', audioSeconds: 1, inferenceSeconds: 0.1 }
    },
    prepare() {},
    async cancelPreparation() {}
  }
  const anchor = fileURLToPath(
    new URL(
      './fixtures/desktop-0212.package.json',
      import.meta.url
    )
  )
  const services = {
    speechToText: speech,
    speechController: remote,
    sessions: { get: (id) => (id === 's1' ? { id } : undefined) },
    profileContext: { installAnchor: anchor },
    pluginPackages: { packageOf: () => ({ version: JSON.parse(fs.readFileSync(new URL('../compatibility.json', import.meta.url))).dshVersion }) },
    configEditor: {
      entries: () => rows,
      configuration: () =>
        rows.map((entry) => ({
          entry,
          inherited: {},
          override: entry.options.config
        })),
      async edit(entry, fn) {
        entry.options.config = fn(entry.options.config, {})
      }
    },
    settings: {},
    llm: { async *stream() {} }
  }
  const ctx = {
    ...services,
    tools: { register() {} },
    credentials: {
      async resolve() {
        return { value: '' }
      }
    },
    webServer: {
      register: (r) => {
        if (routes.has(r.path)) throw Error('重复路由')
        routes.set(r.path, r)
        return () => routes.delete(r.path)
      }
    },
    get: (n) => services[n],
    effect: (f) => {
      const off = f()
      if (typeof off === 'function') cleanups.push(off)
    },
    on: (name, f) => {
      listeners.set(name, f)
      return () => listeners.delete(name)
    }
  }
  apply(ctx, cfg)
  return {
    cfg,
    ctx,
    routes,
    registered,
    services,
    rows,
    async close() {
      for (const f of cleanups.reverse()) await f()
    }
  }
}
async function call(h, route, body, method = body ? 'POST' : 'GET') {
  const req = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : [])
  req.method = method
  req.url = '/dsh-chatty/' + route
  req.headers = { host: '127.0.0.1:3000', origin: 'dsh-app://app' }
  req.socket = { remoteAddress: '127.0.0.1' }
  const res = new EventEmitter()
  res.parts = []
  res.writeHead = (code, headers) => {
    res.statusCode = code
    res.headersSent = true
    res.headers = headers
  }
  res.setHeader = () => {}
  res.write = (x) => {
    res.parts.push(String(x))
    return true
  }
  res.end = (x) => {
    if (x) res.parts.push(String(x))
    res.ended = true
  }
  await h.routes.get(req.url.split('?')[0]).handler(req, res)
  return { res, body: res.ended ? JSON.parse(res.parts.join('')) : null }
}
test('目标 Host 必须加载真实 peers，注册具名服务并停用自动对话', async () => {
  const h = harness()
  try {
    assert.deepEqual(
      [...h.registered.keys()],
      ['chatty-volcano', 'chatty-siliconflow']
    )
    const r = await call(h, 'status')
    assert.equal(r.body.compatibility.matched, true)
    assert.equal(r.body.stt.provider, 'sensevoice-local')
    assert.equal(r.body.stt.capability.streaming, false)
    assert.equal(r.body.tts.llm_summary, false)
    assert.equal(r.body.draft.auto_send, undefined)
    const old = await call(h, 'voice-chat', { enabled: true })
    assert.equal(old.res.statusCode, 410)
    assert.equal(old.body.error.code, 'feature_deferred')
  } finally {
    await h.close()
  }
})
test('服务的上下文代理变化不误判重载，注册表缺增强 Provider 时拒绝',async()=>{const h=harness();try{h.services.speechToText=new Proxy(h.services.speechToText,{});assert.equal((await call(h,'status')).body.compatibility.matched,true);h.registered.delete('chatty-volcano');assert.equal((await call(h,'status')).body.compatibility.matched,false);const blocked=await call(h,'stt/capture/start',{sessionId:'s1'});assert.equal(blocked.body.error.code,'compatibility')}finally{await h.close()}})
test('完整录音兼容路径只调用官方 Remote，无跨供应商回退', async () => {
  const h = harness()
  try {
    const r = await call(h, 'stt/transcribe', {
      sessionId: 's1',
      audioBase64: Buffer.from('wave').toString('base64')
    })
    assert.equal(r.body.text, '官方识别结果')
    const missing = await call(h, 'stt/transcribe', {
      sessionId: 'other',
      audioBase64: 'AA=='
    })
    assert.equal(missing.res.statusCode, 400)
  } finally {
    await h.close()
  }
})
test('Settings 展开序列化 schema，全部增强字段有实际路径', () => {
  const fields = fieldsOf(Config.toJSON())
  assert.equal(fields.length, 74)
  assert.ok(fields.some((f) => f.path === 'tts.renderer.table'))
  assert.ok(fields.some((f) => f.path === 'stt.providers.volcano.stream_url'))
  assert.ok(!fields.some((f) => f.path === 'draft.auto_send'))
  validateCommands(unpack(Config({})))
  assert.throws(
    () =>
      validateCommands({
        voice_control: { commands: { send: ['发送'], clear: ['发送。'] } }
      }),
    /重复/
  )
})
test('迁移保留未知值、独立朗读，退役键不会复活', () => {
  const old = {
    unknown: { keep: 7 },
    stt: { provider: 'volcano', language: 'zh-CN', credential: 'MY_KEY' },
    draft: { auto_send: true },
    tts: { auto_read: true },
    ui: { show_partial: false, visualizer: 'wave' }
  }
  const p = migrationOf(old, { defaultProvider: 'sensevoice-local' })
  assert.deepEqual(p.next.unknown, { keep: 7 })
  assert.equal(p.next.tts.auto_read, true)
  assert.equal(p.next.draft.auto_send, undefined)
  assert.equal(p.next.stt.provider, undefined)
  assert.equal(p.next.stt.providers.volcano.credential, 'MY_KEY')
  assert.equal(p.next.stt.partial_preview, false)
  assert.ok(p.conflicts.length)
  assert.equal(migrationOf(p.next).changes.length, 0)
})
test('配置 CAS 拒绝 stale 保存，不覆盖并发改动', async () => {
  const h = harness()
  try {
    const bridge = createSettingsBridge({
      ctx: h.ctx,
      schema: Config,
      home: path.resolve('../.local/test-home'),
      live: () => h.cfg,
      active: () => false
    })
    const view = bridge.describe().find((o) => o.owner === 'chatty')
    h.rows[0].options.config = { ui: { panel_width: 900 } }
    await assert.rejects(
      bridge.save({
        owner: 'chatty',
        entryId: view.entryId,
        expectedRevisionToken: view.revisionToken,
        operations: [{ op: 'set', path: 'ui.panel_width', value: 800 }]
      }),
      /配置已/
    )
    assert.equal(h.rows[0].options.config.ui.panel_width, 900)
  } finally {
    await h.close()
  }
})
test('来源校验不因回环地址接受恶意 Origin', () => {
  const req = {
    socket: { remoteAddress: '127.0.0.1' },
    headers: { host: '127.0.0.1:3000', origin: 'https://evil.example' }
  }
  assert.equal(isTrustedCaller(req), false)
  req.headers.origin = 'dsh-app://app'
  assert.equal(isTrustedCaller(req), true)
  req.headers.origin = 'null'
  assert.equal(isTrustedCaller(req), false)
})
test('原生草稿累计、普通发送与手改冲突不会恢复旧文字', () => {
  let state = { draft: '手写：', draftRev: 1, occurrences: [], phase: 'plain' }
  const actions = {
    captureInsertion: () => ({
      start: state.draft.length,
      end: state.draft.length,
      draftRev: state.draftRev
    }),
    insertText: (text, span) => {
      if (span.draftRev !== state.draftRev) return false
      state = {
        ...state,
        draft:
          state.draft.slice(0, span.start) + text + state.draft.slice(span.end),
        draftRev: state.draftRev + 1
      }
      return true
    }
  }
  const ledger = createDraftLedger({ actions: () => actions, state })
  const a = ledger.capture()
  assert.equal(ledger.insert('第一句', a), true)
  ledger.receive(state)
  assert.equal(ledger.insert('第二句', ledger.capture()), true)
  ledger.receive(state)
  assert.ok(state.draft.startsWith('手写：'))
  state = { ...state, draft: '', draftRev: state.draftRev + 1 }
  ledger.receive(state)
  assert.equal(ledger.text(), '')
  const anchor = ledger.capture()
  state = { ...state, draft: '新手写', draftRev: state.draftRev + 1 }
  ledger.receive(state)
  assert.equal(ledger.insert('迟到识别', anchor), false)
  assert.equal(state.draft, '新手写')
})
test('流式分片重放不重送，partial 不能提升 final，取消释放', async () => {
  let callbacks,
    pushes = 0
  const streams = createStreamSessions({
    sessionExists: (id) => id === 's1',
    limits: () => ({
      maxPending: 4,
      maxAudioBytes: 1024,
      maxDurationSeconds: 10,
      timeoutMs: 10000
    }),
    open: (p, cb) => {
      callbacks = cb
      return {
        pushAudio() {
          pushes++
        },
        async stop() {},
        cancel() {}
      }
    }
  })
  const p = {
    sessionId: 's1',
    recordingGeneration: 1,
    utteranceId: 'u1',
    utteranceSeq: 1,
    sampleRate: 16000
  }
  const { streamId } = streams.start(p)
  const events = []
  streams.subscribe(streamId, (e) => events.push(e))
  const frame = { streamId, sequence: 1, audioBase64: 'AAA=' }
  streams.push(frame)
  streams.push(frame)
  assert.equal(pushes, 1)
  assert.throws(() => streams.push({ ...frame, audioBase64: 'AQE=' }), /重复/)
  callbacks.onPartial('发送')
  await assert.rejects(streams.stop({ streamId, lastSequence: 1 }), /正式最终/)
  assert.equal(events.filter((e) => e?.kind === 'final').length, 0)
  assert.equal(streams.active(), false)
  streams.dispose()
})
