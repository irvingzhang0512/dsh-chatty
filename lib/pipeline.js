// 每会话语音流水线（需求 §15~§18）：
//
//   Assistant 流式文本
//        ↓ feed()
//   Speech Buffer（判断块/句是否完整）
//        ↓
//   Speech Renderer（Markdown → 可朗读内容）
//        ↓
//   Speech Queue（排队 / 取消 / 打断）
//        ↓ onSegment()
//   TTS Provider（由宿主路由合成，浏览器播放）
//
// 关键约束：
//  - 每个会话一份 Buffer 与 Queue，互不干扰；
//  - cancel() 递增该会话队列的 generation，浏览器据此丢弃过期音频；
//  - 原 Assistant Message 永远不被修改，这里只产出「Speech Text」。

import { createSpeechBuffer } from './speech/buffer.js'
import { createSpeechQueue } from './speech/queue.js'
import { renderSpeech } from './speech/renderer.js'

/**
 * @param {object} [options]
 * @param {object} [options.policy] Speech Renderer 策略
 * @param {(segment: object, sessionId: string) => void} [options.onSegment]
 * @param {(sessionId: string) => void} [options.onEnd]
 * @param {(sessionId: string, reason: string) => void} [options.onCancel]
 * @param {Function} [options.summarizeBlock] 异步摘要（可空，仅用于整段渲染）
 */
export function createSpeechPipeline(options = {}) {
  const policy = options.policy || {}
  const sessions = new Map()

  function stateFor(sessionId) {
    const id = String(sessionId || '')
    if (!id) throw new Error('sessionId is required')
    let state = sessions.get(id)
    if (!state) {
      const queue = createSpeechQueue()
      state = {
        id,
        queue,
        buffer: createSpeechBuffer({
          policy,
          codeHint: options.codeHint !== false,
          mode: options.bufferMode || 'block',
        }),
        turnId: null,
        finished: false,
      }
      sessions.set(id, state)
    }
    return state
  }

  function emit(state, segment) {
    if (!segment || !segment.text) return
    const item = state.queue.push(segment.text, { kind: segment.kind, sessionId: state.id, source: segment.source || 'block' })
    if (typeof options.onSegment === 'function') options.onSegment({ ...segment, id: item.id, seq: item.seq }, state.id)
  }

  /** LLM 文本增量 → 完整块 → 队列。 */
  function feed(sessionId, delta) {
    const state = stateFor(sessionId)
    state.finished = false
    const text = String(delta == null ? '' : delta)
    if (!text) return
    for (const segment of state.buffer.push(text)) emit(state, segment)
  }

  /** 一轮回复结束：把 Buffer 里剩下的内容吐干净。 */
  function finish(sessionId) {
    const state = stateFor(sessionId)
    if (state.finished) return
    state.finished = true
    for (const segment of state.buffer.flush()) emit(state, segment)
    if (typeof options.onEnd === 'function') options.onEnd(state.id)
  }

  /** 打断 / 停止朗读：清空队列，浏览器通过 generation 丢弃在途音频。 */
  function cancel(sessionId) {
    const state = stateFor(sessionId)
    state.buffer.reset()
    state.finished = false
    const removed = state.queue.interrupt('cancelled')
    if (typeof options.onCancel === 'function') options.onCancel(state.id, 'cancelled')
    return removed
  }

  /**
   * 手动朗读：整段 Markdown 一次性渲染并入队（需求 §20 手动朗读）。
   * 与 feed() 共用同一条队列，因此手动朗读也能被打断。
   */
  async function render(sessionId, markdown) {
    const state = stateFor(sessionId)
    const result = renderSpeech(markdown, policy, { codeHint: options.codeHint !== false })
    let segments = result.segments
    if (typeof options.summarizeBlock === 'function') {
      const { renderSpeechAsync } = await import('./speech/renderer.js')
      const upgraded = await renderSpeechAsync(markdown, policy, {
        codeHint: options.codeHint !== false,
        summarizeBlock: options.summarizeBlock,
      })
      if (upgraded && upgraded.segments.length) segments = upgraded.segments
    }
    for (const segment of segments) emit(state, segment)
    return segments
  }

  function reset(sessionId) {
    if (sessionId === undefined) {
      sessions.clear()
      return
    }
    sessions.delete(String(sessionId || ''))
  }

  return {
    feed,
    finish,
    cancel,
    render,
    reset,
    queueFor: (sessionId) => stateFor(sessionId).queue,
    stateFor,
    sessions: () => Array.from(sessions.keys()),
  }
}
