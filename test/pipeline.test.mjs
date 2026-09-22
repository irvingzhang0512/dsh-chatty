// 语音流水线单测：Speech Buffer → Speech Renderer → Speech Queue 的串联行为。
// 对应需求 §15~§18：完整块优先、代码不朗读、打断清空队列。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSpeechPipeline } from '../lib/pipeline.js'
import { createSpeechQueue } from '../lib/speech/queue.js'

function collector() {
  const segments = []
  const ended = []
  const cancelled = []
  const pipeline = createSpeechPipeline({
    onSegment: (segment, sessionId) => segments.push({ ...segment, sessionId }),
    onEnd: (sessionId) => ended.push(sessionId),
    onCancel: (sessionId, reason) => cancelled.push({ sessionId, reason }),
  })
  return { pipeline, segments, ended, cancelled }
}

test('流水线：完整句子进入队列并触发 onSegment', () => {
  const { pipeline, segments } = collector()
  pipeline.feed('s1', '你好，')
  assert.equal(segments.length, 0)
  pipeline.feed('s1', '这是语音插件的测试。')
  assert.equal(segments.length >= 1, true)
  assert.equal(segments[0].sessionId, 's1')
  assert.equal(segments[0].text.includes('语音插件'), true)
  const queue = pipeline.queueFor('s1')
  assert.equal(queue.items().length >= 1, true)
})

test('流水线：未闭合的代码围栏不吐内容，闭合后按策略跳过并给出提示', () => {
  const { pipeline, segments } = collector()
  pipeline.feed('s1', '先看代码：\n\n```python\ndef start():\n')
  assert.equal(segments.filter((item) => item.kind === 'code_block' && item.source !== 'hint').length, 0)
  pipeline.feed('s1', '    pass\n```\n')
  const codeSegments = segments.filter((item) => item.kind === 'code_block')
  assert.equal(codeSegments.length, 1)
  assert.equal(codeSegments[0].source, 'hint')
  assert.equal(codeSegments[0].text.includes('代码'), true)
})

test('流水线：finish 会把剩余内容 flush 出来并触发 onEnd', () => {
  const { pipeline, segments, ended } = collector()
  pipeline.feed('s1', '这是一句没有结束标点的话')
  const before = segments.length
  pipeline.finish('s1')
  assert.equal(segments.length > before, true)
  assert.deepEqual(ended, ['s1'])
  // 重复 finish 不应重复触发。
  pipeline.finish('s1')
  assert.deepEqual(ended, ['s1'])
})

test('流水线：cancel 清空队列、递增 generation 并通知 onCancel', () => {
  const { pipeline, cancelled } = collector()
  pipeline.feed('s1', '第一句话。第二句话。')
  const queue = pipeline.queueFor('s1')
  assert.equal(queue.size() > 0, true)
  const generationBefore = queue.generation()
  const removed = pipeline.cancel('s1')
  assert.equal(removed > 0, true)
  assert.equal(queue.generation(), generationBefore + 1)
  assert.equal(queue.size(), 0)
  assert.deepEqual(cancelled, [{ sessionId: 's1', reason: 'cancelled' }])
})

test('流水线：手动朗读整段 Markdown，入队并可被单独会话隔离', async () => {
  const { pipeline, segments } = collector()
  const rendered = await pipeline.render('s2', '# 标题\n\n正文一句。\n\n| 模型 | 延迟 |\n| A | 500 ms |\n| B | 200 ms |\n')
  assert.equal(rendered.length >= 2, true)
  assert.equal(segments.every((item) => item.sessionId === 's2'), true)
  const texts = rendered.map((item) => item.text).join(' ')
  assert.equal(texts.includes('标题'), true)
  // 表格默认摘要：不能逐格朗读出竖线。
  assert.equal(texts.includes('|'), false)
  assert.equal(pipeline.queueFor('s2').size() >= 2, true)
  assert.deepEqual(pipeline.sessions(), ['s2'])
  pipeline.reset('s2')
  assert.deepEqual(pipeline.sessions(), [])
})

test('流水线：不同会话各自独立，互不干扰', () => {
  const { pipeline, segments } = collector()
  pipeline.feed('a', '会话 A 的第一句。')
  pipeline.feed('b', '会话 B 的第一句。')
  assert.equal(segments.some((item) => item.sessionId === 'a'), true)
  assert.equal(segments.some((item) => item.sessionId === 'b'), true)
  pipeline.cancel('a')
  assert.equal(pipeline.queueFor('a').size(), 0)
  assert.equal(pipeline.queueFor('b').size() > 0, true)
})

test('Speech Queue：next 只取 queued 并置 playing，clear 让未播条目作废', () => {
  const queue = createSpeechQueue()
  let notified = 0
  const off = queue.subscribe(() => { notified += 1 })
  const first = queue.push('第一段', { kind: 'paragraph' })
  queue.push('第二段', { kind: 'paragraph' })
  queue.push('第三段', { kind: 'paragraph' })
  assert.equal(queue.size(), 3)
  const playing = queue.next()
  assert.equal(playing.id, first.id)
  assert.equal(playing.status, 'playing')
  assert.equal(queue.peek().status, 'queued')
  queue.markDone(playing.id)
  assert.equal(queue.items().find((item) => item.id === playing.id).status, 'done')
  const generation = queue.generation()
  // clear 只作废「还没开始播」的条目；正在播的条目要由 interrupt 处理。
  const removed = queue.clear('new-reply')
  assert.equal(removed, 2)
  assert.equal(queue.generation(), generation + 1)
  assert.equal(queue.isEmpty(), true)
  assert.equal(notified > 0, true)
  off()
})

test('Speech Queue：interrupt 把未完成条目全部置为 cancelled', () => {
  const queue = createSpeechQueue()
  queue.push('甲')
  queue.push('乙')
  const removed = queue.interrupt('barge-in')
  assert.equal(removed, 2)
  assert.equal(queue.items().every((item) => item.status === 'cancelled'), true)
  assert.equal(queue.isEmpty(), true)
})

test('Speech Queue：失败条目会被记录且不计入待播', () => {
  const queue = createSpeechQueue()
  const item = queue.push('会失败的一段')
  const playing = queue.next()
  queue.markFailed(playing.id, new Error('synthesis failed'))
  const stored = queue.items().find((entry) => entry.id === item.id)
  assert.equal(stored.status, 'failed')
  assert.equal(String(stored.error).includes('synthesis failed'), true)
  assert.equal(queue.isEmpty(), true)
})
