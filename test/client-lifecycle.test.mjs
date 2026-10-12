import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createSpeechSummarizer } from '../lib/polish.js'
import { createCommandParser, DEFAULT_COMMANDS } from '../lib/command-parser.js'
const fragment = (name) =>
  fs.readFileSync(new URL('../lib/client-src/' + name, import.meta.url), 'utf8')
const tick = () => new Promise((r) => setImmediate(r))
test('开麦配置请求未返回时重复点击只启动一次，取消不能被迟到配置重新开麦', async () => {
  let resolve,
    starts = 0,
    calls = 0
  const cfg = {
    compatibility: { matched: true },
    stt: { vad: { min_speech_ms: 200 } },
    limits: { maxAudioBytes: 4194304, maxDurationSeconds: 30 }
  }
  const box = {
    chatty: { sessionId: 's', ledger: {}, notify() {} },
    refreshChattySettings: () => {
      calls++
      return new Promise((r) => (resolve = r))
    },
    audioEngine: {
      async start() {
        starts++
      },
      stop() {}
    },
    showNotice() {},
    setSttPhase(p) {
      box.phase = p
    },
    setTimeout,
    clearTimeout
  }
  vm.createContext(box)
  vm.runInContext(fragment('45-stt.js'), box)
  const a = box.startListening()
  await box.startListening()
  assert.equal(calls, 1)
  box.cancelListening()
  resolve(cfg)
  await a
  assert.equal(starts, 0)
  const b = box.startListening()
  resolve(cfg)
  await b
  assert.equal(starts, 1)
  assert.equal(box.phase, 'LISTENING')
  box.cancelListening()
})
test('手改或普通发送使旧语音锚点失效，迟到的发送口令不能提交新正文', async () => {
  let sends = 0
  const box = {
    chatty: {
      ledger: { rebase: () => null },
      inputActions: {
        submit() {
          sends++
        }
      },
      pendingResults: [],
      notify() {}
    },
    createCommandParser,
    DEFAULT_COMMANDS,
    showNotice() {}
  }
  vm.createContext(box)
  vm.runInContext(fragment('50-draft.js'), box)
  const task = {
    id: 'old',
    anchor: { epoch: 0 },
    cfg: {
      voice_control: {
        enabled: true,
        commands: DEFAULT_COMMANDS,
        command_mode: 'exact',
        wake_prefix: 'DSH',
        wake_words: []
      }
    }
  }
  const result = await box.handleRecognizedText('发送', task)
  assert.equal(sends, 0)
  assert.equal(result.conflict, true)
  assert.equal(box.chatty.pendingResults[0].text, '发送')
})
test('采集帧在句长上限内切分，剩余 PCM 不丢，48k 降采样跨帧不漂移', () => {
  const cfg = { limits: { maxAudioBytes: 32044, maxDurationSeconds: 1 } },
    ended = []
  const box = {
    chatty: { settings: cfg, levels: [] },
    sttClient: { active: true, current: null },
    setSttPhase() {},
    t: (k) => k,
    Uint8Array,
    Float32Array,
    DataView,
    Math
  }
  vm.createContext(box)
  vm.runInContext(
    fragment('40-audio.js') + ';globalThis.engine=audioEngine',
    box
  )
  const engine = box.engine
  engine.running = true
  engine.vad = { enabled: false, min_speech_ms: 0 }
  engine.callbacks = {
    onSpeechStart() {
      box.sttClient.current = { cfg }
    },
    onSpeechEnd(pcm) {
      ended.push(pcm)
    }
  }
  for (let i = 0; i < 10; i++)
    engine.handleFrame({
      inputBuffer: { getChannelData: () => new Float32Array(2048).fill(0.3) }
    })
  engine.finishUtterance('manual')
  assert.equal(ended[0].length, 32000)
  assert.equal(
    ended.reduce((n, p) => n + p.length, 0),
    40960
  )
  engine.sampleRate = 48000
  engine.resampleTail = new Float32Array(0)
  engine.resamplePosition = 0
  const frame = new Float32Array(2048).fill(0.2)
  let bytes = 0
  for (let i = 0; i < 3; i++) bytes += engine.toPcm16(frame).length
  assert.equal(bytes, 4096)
})
test('润色返回时会话或账本已替换，即使 epoch 一样也不写入新输入框', async () => {
  let resolve,
    replaced = 0
  const old = {
    epoch: () => 0,
    records: () => [{ start: 0, end: 3, rev: 1, text: '旧语音' }],
    capture: () => ({ draftRev: 1 }),
    replace() {
      replaced++
      return true
    }
  }
  const box = {
    chatty: { ledger: old, sessionId: 'old', pendingResults: [], notify() {} },
    chattySetting: (p, f) => f,
    AbortController,
    postJson: () => new Promise((r) => (resolve = r)),
    showNotice() {},
    window: {},
    createCommandParser() {},
    DEFAULT_COMMANDS: {}
  }
  vm.createContext(box)
  vm.runInContext(fragment('50-draft.js'), box)
  const pending = box.polishComposer()
  box.chatty.ledger = { ...old }
  box.chatty.sessionId = 'new'
  resolve({ draft: { text: '旧润色结果' } })
  await pending
  assert.equal(replaced, 0)
  assert.equal(box.chatty.pendingResults.length, 0)
})
test('PCM 播放保留停止状态直到最后音源结束，中止确实停止已排程音源', async () => {
  const sources = []
  class Context {
    constructor() {
      this.state = 'running'
      this.currentTime = 0
      this.destination = {}
    }
    resume() {
      return Promise.resolve()
    }
    createGain() {
      return { gain: { value: 1 }, connect() {} }
    }
    createBuffer(c, n, rate) {
      return { duration: n / rate, getChannelData: () => new Float32Array(n) }
    }
    createBufferSource() {
      const s = {
        connect() {},
        start() {},
        stop() {
          s.stopped = true
        }
      }
      sources.push(s)
      return s
    }
  }
  const box = {
    AudioContext: Context,
    chatty: { sessionId: 's', notify() {} },
    chattySetting: (p, f) => f,
    setTtsPhase: (p) => (box.chatty.ttsPhase = p),
    AbortController,
    Uint8Array,
    DataView,
    Float32Array,
    URL,
    postJson() {
      return Promise.resolve({})
    },
    showNotice() {},
    t: (k) => k,
    sttClient: { active: false }
  }
  vm.createContext(box)
  vm.runInContext(fragment('55-tts.js') + ';globalThis.player=speech', box)
  let count = 0,
    settled = false
  const res = {
    body: {
      getReader: () => ({
        read: async () =>
          ++count === 1
            ? { done: false, value: new Uint8Array(32000) }
            : { done: true }
      })
    }
  }
  const controller = new AbortController()
  const playing = box
    .playPcmStream(res, 16000, 0, controller)
    .then(() => (settled = true))
  await tick()
  assert.equal(box.chatty.ttsPhase, 'PLAYING')
  assert.equal(settled, false)
  box.chattySetting = (p, f) => (p === 'tts.volume' ? 0 : f)
  box.ensureSpeechAudio()
  assert.equal(box.player.gain.gain.value, 0)
  controller.abort()
  await playing
  assert.equal(sources[0].stopped, true)
  assert.equal(box.player.sources.size, 0)
})
test('真实流式以 200ms 聚合 ScriptProcessor 帧，末块只发送一次', async () => {
  const sent = []
  const box = {
    Uint8Array,
    AbortController,
    concatPcm: (parts) => {
      const n = parts.reduce((n, p) => n + p.length, 0),
        out = new Uint8Array(n)
      let i = 0
      for (const p of parts) {
        out.set(p, i)
        i += p.length
      }
      return out
    },
    bytesToBase64: (p) => Buffer.from(p).toString('base64'),
    postJson: async (url, p) => {
      sent.push(p)
      return {}
    },
    setTimeout,
    clearTimeout
  }
  vm.createContext(box)
  vm.runInContext(fragment('45-stt.js'), box)
  const task = {
    open: Promise.resolve(),
    push: Promise.resolve(),
    streamId: 'test',
    sequence: 0,
    controller: new AbortController()
  }
  box.queueStreamAudio(task, new Uint8Array(4096))
  box.queueStreamAudio(task, new Uint8Array(4096))
  box.queueStreamAudio(task, new Uint8Array(0), true)
  await task.push
  assert.deepEqual(
    sent.map((p) => Buffer.from(p.audioBase64, 'base64').length),
    [6400, 1792]
  )
  assert.deepEqual(
    sent.map((p) => p.sequence),
    [1, 2]
  )
  assert.equal(task.uploadBuffer.length, 0)
})
test('编码音频静音值生效，取消后迟到的 play Promise 不恢复播放状态', async () => {
  let resolvePlay, element
  class Audio {
    constructor() {
      element = this
    }
    play() {
      return new Promise((r) => (resolvePlay = r))
    }
    pause() {
      this.paused = true
    }
  }
  const box = {
    Audio,
    chatty: {},
    chattySetting: (p, f) => (p === 'tts.volume' ? 0 : f),
    setTtsPhase: (p) => (box.chatty.ttsPhase = p),
    AbortController,
    URL: { createObjectURL: () => 'blob:fixture', revokeObjectURL() {} },
    postJson: async () => ({}),
    showNotice() {},
    t: (k) => k,
    sttClient: { active: false }
  }
  vm.createContext(box)
  vm.runInContext(fragment('55-tts.js'), box)
  const controller = new AbortController(),
    pending = box.playEncodedBlob({ blob: async () => ({}) }, 0, controller)
  await tick()
  assert.equal(element.volume, 0)
  controller.abort()
  await pending
  resolvePlay()
  await tick()
  assert.equal(element.paused, true)
  assert.notEqual(box.chatty.ttsPhase, 'PLAYING')
})
test('润色开关不禁用另行启用的模型摘要', async () => {
  let calls = 0
  const summarize = createSpeechSummarizer({
    getConfig: () => ({
      polish: { enabled: false },
      tts: { llm_summary: true }
    }),
    getAgentDefaultModel: () => ({ provider: 'fixture', model: 'test' }),
    createUserMessage: (x) => x,
    llm: {
      async *stream() {
        calls++
        yield { type: 'text-delta', text: '模型摘要' }
      }
    }
  })
  assert.equal(await summarize('table', '测试'.repeat(50)), '模型摘要')
  assert.equal(calls, 1)
})
