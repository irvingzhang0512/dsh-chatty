// 听写直写逻辑单测：追加 / 撤销 / 清空语音段落（composer 即草稿）。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { appendSegment, recordInsert, revertLastInsert, revertAllInserts } from '../lib/composer-text.js'

test('追加：空输入框直接写入', () => {
  const result = appendSegment('', '今天讨论语音插件。')
  assert.equal(result.text, '今天讨论语音插件。')
  assert.equal(result.insertStart, 0)
  assert.equal(result.insertEnd, '今天讨论语音插件。'.length)
})

test('追加：已有内容用换行衔接，并去掉尾部空白', () => {
  const result = appendSegment('第一段。  ', '第二段。')
  assert.equal(result.text, '第一段。\n第二段。')
  // 插入区间包含衔接换行：撤销时连它一起删除。
  assert.equal(result.insertStart, '第一段。'.length)
  assert.equal(result.insertEnd, result.text.length)
})

test('追加：空段不改变文本且区间为零（不产生撤销条目）', () => {
  const result = appendSegment('已有', '   ')
  assert.equal(result.text, '已有')
  assert.equal(recordInsert('已有', result), null)
})

test('撤销：按区间回退最近一段（连衔接符一起删除）', () => {
  const history = []
  const first = appendSegment('', '第一段')
  history.push(recordInsert('', first))
  const second = appendSegment(first.text, '第二段')
  history.push(recordInsert(first.text, second))

  const reverted = revertLastInsert(second.text, history)
  assert.equal(reverted.removed, '\n第二段')
  assert.equal(reverted.text, '第一段')

  const reverted2 = revertLastInsert(reverted.text, history)
  assert.equal(reverted2.removed, '第一段')
  assert.equal(reverted2.text, '')
})

test('撤销：用户已手改目标区间时放弃回退（不吞用户输入）', () => {
  const history = []
  const first = appendSegment('', '语音内容')
  history.push(recordInsert('', first))
  // 插入区间内部被改写：slice(start,end) 不再等于当初插入的内容 → 放弃回退。
  const edited = '语音内内容被改'
  const reverted = revertLastInsert(edited, history)
  assert.equal(reverted.removed, null)
  assert.equal(reverted.text, edited)
})

test('撤销：历史为空时原样返回', () => {
  const reverted = revertLastInsert('任意内容', [])
  assert.equal(reverted.removed, null)
  assert.equal(reverted.text, '任意内容')
})

test('清空：逐段回退全部语音段落，遇到手改段即停', () => {
  const history = []
  let text = '用户手打的。'
  const voiceParts = ['语音一', '语音二', '语音三']
  for (const part of voiceParts) {
    const result = appendSegment(text, part)
    history.push(recordInsert(text, result))
    text = result.text
  }
  assert.equal(text, '用户手打的。\n语音一\n语音二\n语音三')

  const cleared = revertAllInserts(text, history)
  assert.equal(cleared.removed, 3)
  assert.equal(cleared.text, '用户手打的。')
})
