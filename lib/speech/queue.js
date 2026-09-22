/**
 * Speech Queue —— 待朗读文本的排队、取消与打断。
 *
 * 设计意图（需求 §18 / §20）：
 * - 播放器只从 `next()` 取活；`next()` 把条目从 `queued` 置为 `playing`，避免重复取。
 * - `clear()` / `interrupt()` 不只是删条目：它们**递增 `generation`**，让已经送去合成
 *   但还没播完的音频被消费者丢弃（否则打断后旧音频会「诈尸」）。
 *   - `clear()`：清掉还没开始播的条目（正在播的那条交给播放器停），用于「新回复替换旧队列」。
 *   - `interrupt()`：连正在播的一起作废，用于用户说话打断 / 点击停止。
 * - 条目一旦 `done` / `failed` / `cancelled` 就不再计入 `size()`，队列不会被历史条目撑大。
 * - `subscribe(listener)` 是给 pipeline 广播 SSE 事件用的：`enqueue` / `next` / `done` /
 *   `failed` / `clear` / `interrupt` / `generation`，每次带一份条目快照。
 *
 * 本文件无外部依赖，纯内存状态机。
 */

/** 合法状态。 */
export const QUEUE_STATUSES = Object.freeze(['queued', 'playing', 'done', 'failed', 'cancelled'])

/** 终态：不再参与 `size()` / `next()`。 */
const FINAL_STATUSES = new Set(['done', 'failed', 'cancelled'])

/**
 * 创建一个语音队列。
 *
 * @param {object} [options]
 * @param {string} [options.idPrefix='speech'] 条目 id 前缀
 * @param {(item: object) => void} [options.onChange] 与 subscribe 等价的便捷回调
 * @param {boolean} [options.keepFinished=true] `items()` 是否保留已结束条目（默认保留，便于排查）
 */
export function createSpeechQueue(options = {}) {
  const opts = options && typeof options === 'object' ? options : {}
  const idPrefix = typeof opts.idPrefix === 'string' && opts.idPrefix ? opts.idPrefix : 'speech'
  const keepFinished = opts.keepFinished !== false

  /** @type {Array<{id: string, seq: number, text: string, kind: string, status: string, meta: object, error?: string}>} */
  let list = []
  const listeners = new Set()
  let seq = 0
  let gen = 0
  let counter = 0

  if (typeof opts.onChange === 'function') listeners.add(opts.onChange)

  /** 通知订阅者。快照是深拷贝，避免监听器改坏内部状态。 */
  function notify(event) {
    if (!listeners.size) return
    const snapshot = {
      ...event,
      generation: gen,
      size: size(),
      items: list.map((item) => ({ ...item, meta: { ...item.meta } })),
    }
    for (const listener of [...listeners]) {
      try {
        listener(snapshot)
      } catch {
        // 单个监听器抛错不能影响队列本身
      }
    }
  }

  /** 未完成条目数：queued + playing。 */
  function size() {
    let count = 0
    for (const item of list) if (!FINAL_STATUSES.has(item.status)) count += 1
    return count
  }

  /** 找到第一个 queued 条目。 */
  function findQueued() {
    return list.find((item) => item.status === 'queued') || null
  }

  /** 按 id 找条目。 */
  function findById(id) {
    return list.find((item) => item.id === id) || null
  }

  /** 把一批条目置为终态，返回受影响数量。 */
  function cancelMatching(predicate, status, reason) {
    let count = 0
    for (const item of list) {
      if (!predicate(item)) continue
      item.status = status
      item.meta = { ...item.meta, cancelReason: reason }
      count += 1
    }
    return count
  }

  return {
    /**
     * 入队一段待朗读文本。
     * @param {string} text
     * @param {object} [meta] 例如 `{ sessionId, kind, index }`
     * @returns {{id: string, seq: number, text: string, kind: string, status: string, meta: object}}
     */
    push(text, meta = {}) {
      const value = typeof text === 'string' ? text : text == null ? '' : String(text)
      const info = meta && typeof meta === 'object' ? meta : {}
      const item = {
        id: `${idPrefix}-${++counter}`,
        seq: ++seq,
        text: value,
        kind: typeof info.kind === 'string' && info.kind ? info.kind : 'segment',
        status: 'queued',
        meta: { ...info },
      }
      list.push(item)
      notify({ type: 'enqueue', item: { ...item } })
      return item
    },

    /**
     * 取出下一个 queued 条目并置为 playing。
     * @returns {object|null}
     */
    next() {
      const item = findQueued()
      if (!item) return null
      item.status = 'playing'
      item.startedAt = Date.now()
      notify({ type: 'next', item: { ...item } })
      return item
    },

    /** 查看下一个 queued 条目（不改状态）。 */
    peek() {
      const item = findQueued()
      return item ? { ...item, meta: { ...item.meta } } : null
    },

    /** 未完成条目数。 */
    size,

    /** 是否没有未完成条目。 */
    isEmpty() {
      return size() === 0
    },

    /** 条目快照（默认包含已结束条目）。 */
    items() {
      return list
        .filter((item) => keepFinished || !FINAL_STATUSES.has(item.status))
        .map((item) => ({ ...item, meta: { ...item.meta } }))
    },

    /** 标记完成。 */
    markDone(id) {
      const item = findById(id)
      if (!item || FINAL_STATUSES.has(item.status)) return null
      item.status = 'done'
      item.finishedAt = Date.now()
      notify({ type: 'done', item: { ...item } })
      return item
    },

    /** 标记失败。 */
    markFailed(id, error) {
      const item = findById(id)
      if (!item || FINAL_STATUSES.has(item.status)) return null
      item.status = 'failed'
      item.error = error == null ? 'unknown error' : String(error && error.message ? error.message : error)
      item.finishedAt = Date.now()
      notify({ type: 'failed', item: { ...item } })
      return item
    },

    /**
     * 清空未开始播放的条目（新回复替换旧队列）。
     * @returns {number} 被取消的条目数
     */
    clear(reason = 'cleared') {
      const count = cancelMatching((item) => item.status === 'queued', 'cancelled', reason)
      gen += 1
      notify({ type: 'clear', reason, count })
      notify({ type: 'generation', reason, count })
      return count
    },

    /**
     * 打断：连正在播放的条目一起作废。
     * @returns {number} 被取消的条目数（queued + playing）
     */
    interrupt(reason = 'interrupted') {
      const count = cancelMatching(
        (item) => item.status === 'queued' || item.status === 'playing',
        'cancelled',
        reason,
      )
      gen += 1
      notify({ type: 'interrupt', reason, count })
      notify({ type: 'generation', reason, count })
      return count
    },

    /** 当前 generation；每次 clear / interrupt 递增，消费者据此丢弃过期音频。 */
    generation() {
      return gen
    },

    /**
     * 订阅队列事件。
     * @param {(event: object) => void} listener
     * @returns {() => void} unsubscribe
     */
    subscribe(listener) {
      if (typeof listener !== 'function') return () => {}
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
