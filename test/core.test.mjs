// 宿主核心模块单测：Voice Draft / 语音指令 / 音频工具 / 会话事件适配。
// 全部离线运行，不依赖任何 npm 包。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createVoiceDraft, composeDraftText } from '../lib/draft.js'
import { createCommandParser, normalizeCommandText, DEFAULT_COMMANDS } from '../lib/command-parser.js'
import { sniffAudioFormat, parseWavHeader, pcm16ToWav, pcm16BytesForMs, concatBytes } from '../lib/audio.js'
import { adaptSessionEvent } from '../lib/reply-adapter.js'
import { writeJson, parseJsonBody, isLoopback, isTrustedCaller } from '../lib/http-util.js'

test('Voice Draft：多个 Utterance 组成一次输入，撤销只删最后一段', () => {
  const draft = createVoiceDraft()
  draft.add('今天我们讨论一下语音插件。')
  draft.add('我觉得首先应该解决语音输入。')
  draft.add('然后再解决语音输出。')
  assert.equal(draft.size(), 3)
  assert.equal(
    draft.text(),
    '今天我们讨论一下语音插件。\n我觉得首先应该解决语音输入。\n然后再解决语音输出。',
  )
  const removed = draft.undo()
  assert.equal(removed.text, '然后再解决语音输出。')
  assert.equal(draft.size(), 2)
  assert.equal(draft.clear(), 2)
  assert.equal(draft.isEmpty(), true)
  assert.equal(draft.undo(), null)
})

test('Voice Draft：空文本被忽略，replaceAll 把编辑结果收敛为一段', () => {
  const draft = createVoiceDraft()
  assert.equal(draft.add('   '), null)
  draft.add('第一段')
  draft.add('第二段')
  draft.replaceAll('编辑后的整段内容')
  assert.equal(draft.size(), 1)
  assert.equal(draft.text(), '编辑后的整段内容')
  assert.equal(draft.utterances()[0].source, 'edit')
})

test('Voice Draft：snapshot/restore 与订阅通知', () => {
  const draft = createVoiceDraft()
  let notified = 0
  const off = draft.subscribe(() => { notified += 1 })
  draft.add('一句话')
  const snapshot = draft.snapshot()
  draft.clear()
  draft.restore(snapshot)
  assert.equal(draft.text(), '一句话')
  assert.equal(notified >= 3, true)
  off()
  draft.add('另一句')
  const before = notified
  draft.add('第三句')
  assert.equal(notified, before)
})

test('Voice Draft：超过上限时丢弃最旧的 Utterance', () => {
  const draft = createVoiceDraft({ maxUtterances: 2 })
  draft.add('一')
  draft.add('二')
  draft.add('三')
  assert.equal(draft.size(), 2)
  assert.equal(draft.text(), '二\n三')
})

test('composeDraftText 忽略空白段并支持自定义连接符', () => {
  assert.equal(composeDraftText([{ text: 'a' }, { text: '  ' }, { text: 'b' }], ' '), 'a b')
  assert.equal(composeDraftText(null), '')
})

test('语音指令：整句等于指令词才执行（需求 §5.2 反例）', () => {
  const parser = createCommandParser({ mode: 'exact' })
  assert.equal(parser.parse('发送').command, 'send')
  assert.equal(parser.parse('发送。').command, 'send')
  assert.equal(parser.parse('  撤销  ').command, 'undo')
  assert.equal(parser.parse('这个请求发送以后需要等待服务器响应'), null)
  assert.equal(parser.parse('请帮我发送一下'), null)
  assert.equal(parser.parse('发送消息').command, 'send')
  assert.equal(parser.parse(''), null)
  assert.equal(parser.parse('   '), null)
})

test('语音指令：全角标点与大小写归一化', () => {
  assert.equal(normalizeCommandText('ＤＳＨ，发送！'), 'dsh,发送')
  const parser = createCommandParser({ mode: 'exact' })
  assert.equal(parser.parse('ＳＥＮＤ').command, 'send')
})

test('语音指令：唤醒模式要求前缀，且前缀后不能再有内容', () => {
  const parser = createCommandParser({ mode: 'wake', wakePrefix: 'DSH', wakeWords: ['小D'] })
  assert.equal(parser.parse('DSH，发送').command, 'send')
  assert.equal(parser.parse('dsh send').command, 'send')
  assert.equal(parser.parse('小D 撤销').command, 'undo')
  assert.equal(parser.parse('发送'), null)
  assert.equal(parser.parse('DSH 帮我发送这封邮件'), null)
})

test('语音指令：off 模式与自定义指令表', () => {
  const off = createCommandParser({ mode: 'off' })
  assert.equal(off.parse('发送'), null)
  const custom = createCommandParser({ commands: { send: ['走起'] } })
  assert.equal(custom.parse('走起').command, 'send')
  assert.equal(custom.parse('发送'), null)
  assert.equal(Object.keys(DEFAULT_COMMANDS).includes('polish'), true)
})

test('音频工具：格式探测', () => {
  const wav = pcm16ToWav(new Uint8Array([0, 0, 1, 0]), { sampleRate: 16000 })
  assert.equal(sniffAudioFormat(wav), 'wav')
  assert.equal(sniffAudioFormat(new Uint8Array([0x4f, 0x67, 0x67, 0x53])), 'ogg')
  assert.equal(sniffAudioFormat(new Uint8Array([0x49, 0x44, 0x33, 0x03])), 'mp3')
  assert.equal(sniffAudioFormat(new Uint8Array([0xff, 0xfb, 0x90, 0x00])), 'mp3')
  assert.equal(sniffAudioFormat(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])), 'webm')
  assert.equal(sniffAudioFormat(new Uint8Array([1, 2])), 'unknown')
})

test('音频工具：WAV 封装与解析互逆', () => {
  const pcm = new Uint8Array(320)
  for (let i = 0; i < pcm.length; i += 1) pcm[i] = i % 256
  const wav = pcm16ToWav(pcm, { sampleRate: 16000, channels: 1 })
  assert.equal(wav.length, 44 + pcm.length)
  const header = parseWavHeader(wav)
  assert.equal(header.sampleRate, 16000)
  assert.equal(header.channels, 1)
  assert.equal(header.bitsPerSample, 16)
  assert.equal(header.dataOffset, 44)
  assert.deepEqual(Array.from(wav.slice(44, 48)), [0, 1, 2, 3])
  assert.equal(parseWavHeader(new Uint8Array([1, 2, 3])), null)
})

test('音频工具：字节拼接与毫秒换算', () => {
  const joined = concatBytes([new Uint8Array([1, 2]), new Uint8Array([3])])
  assert.deepEqual(Array.from(joined), [1, 2, 3])
  assert.equal(concatBytes([]).length, 0)
  assert.equal(pcm16BytesForMs(1000, 16000, 1), 32000)
  assert.equal(pcm16BytesForMs(0, 16000, 1), 0)
})

test('会话事件适配：只放行文本增量与轮次结束', () => {
  const session = { id: 's1' }
  const delta = adaptSessionEvent(session, {
    type: 'assistant/chunk', seq: 3, data: { turn: 1, step: 1, chunk: { type: 'text-delta', text: '你好' } },
  })
  assert.equal(delta.type, 'reply.delta')
  assert.equal(delta.conversationId, 's1')
  assert.equal(delta.text, '你好')

  assert.equal(adaptSessionEvent(session, { type: 'assistant/chunk', seq: 4, data: { chunk: { type: 'tool-call' } } }), null)
  assert.equal(adaptSessionEvent(session, { type: 'tool/result', seq: 5, data: {} }), null)
  assert.equal(adaptSessionEvent(session, { type: 'assistant/chunk', data: { chunk: { type: 'text-delta', text: 'x' } } }), null)

  const end = adaptSessionEvent(session, { type: 'turn/end', seq: 6, data: { turn: 1, reason: { kind: 'stop' } } })
  assert.equal(end.type, 'reply.end')
  const cancel = adaptSessionEvent(session, { type: 'turn/end', seq: 7, data: { turn: 1, reason: { kind: 'aborted' } } })
  assert.equal(cancel.type, 'reply.cancel')
  const interrupted = adaptSessionEvent(session, {
    type: 'assistant/message', seq: 8, data: { turn: 1, step: 1, interrupted: true, message: { id: 'm1' } },
  })
  assert.equal(interrupted.type, 'reply.cancel')
})

test('HTTP 工具：来源可信校验与 JSON 解析', () => {
  assert.equal(isLoopback('127.0.0.1'), true)
  assert.equal(isLoopback('::ffff:127.0.0.1'), true)
  assert.equal(isLoopback('10.0.0.5'), false)
  assert.equal(isTrustedCaller({ socket: { remoteAddress: '127.0.0.1' }, headers: {} }), true)
  assert.equal(isTrustedCaller({ socket: { remoteAddress: '10.0.0.5' }, headers: { origin: 'http://evil.test', host: 'local:3080' } }), false)
  assert.equal(isTrustedCaller({ socket: { remoteAddress: '10.0.0.5' }, headers: { origin: 'http://local:3080', host: 'local:3080' } }), true)
  assert.equal(isTrustedCaller(null), false)
  assert.deepEqual(parseJsonBody(Buffer.from('{"a":1}')), { a: 1 })
  assert.deepEqual(parseJsonBody(Buffer.from('not json')), {})
  assert.deepEqual(parseJsonBody(Buffer.from('[1,2]')), {})
})

test('HTTP 工具：writeJson 写入 JSON 且不抛出', () => {
  const calls = []
  const res = { writeHead: (code, headers) => calls.push(['head', code, headers]), end: (body) => calls.push(['end', body]) }
  writeJson(res, 200, { ok: true })
  assert.equal(calls[0][1], 200)
  assert.equal(calls[1][1], '{"ok":true}')
  writeJson({ writeHead() { throw new Error('closed') } }, 200, {})
})
