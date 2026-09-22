// Voice Draft —— 本插件最重要的交互对象（需求 §4）。
//
// 一次连续说话是一个 Utterance；多个 Utterance 组成一份 Voice Draft。
// 核心原则：一次说完不等于一次发送 —— Draft 只是「待确认的输入」，
// 只有用户点击发送或说出「发送」指令才会进入 DSH Session。
//
// 纯领域模型：不碰网络、不碰 DSH API，便于单测与后续持久化。

export function composeDraftText(utterances, separator = '\n') {
  const list = Array.isArray(utterances) ? utterances : []
  return list
    .map((item) => String((item && item.text) || '').trim())
    .filter(Boolean)
    .join(separator)
}

let sequence = 0
function nextId() {
  sequence += 1
  return `u${sequence}-${Date.now().toString(36)}`
}

/**
 * @param {object} [options]
 * @param {number} [options.maxUtterances] 保留的最大 Utterance 数，超出丢弃最旧的
 * @param {string} [options.separator] Utterance 之间的连接符
 */
export function createVoiceDraft(options = {}) {
  const maxUtterances = Math.max(1, Number(options.maxUtterances) || 200)
  const separator = typeof options.separator === 'string' ? options.separator : '\n'
  let utterances = []
  const listeners = new Set()

  function notify() {
    for (const listener of listeners) {
      try { listener() } catch { /* 监听者自己的问题，不影响模型 */ }
    }
  }

  function copy(item) {
    return item ? { ...item } : null
  }

  function add(text, meta = {}) {
    const clean = String(text == null ? '' : text).trim()
    if (!clean) return null
    const utterance = {
      id: typeof meta.id === 'string' && meta.id ? meta.id : nextId(),
      text: clean,
      final: meta.final !== false,
      at: Number.isFinite(Number(meta.at)) ? Number(meta.at) : Date.now(),
      source: meta.source || 'stt',
      provider: meta.provider ? String(meta.provider) : '',
    }
    utterances.push(utterance)
    while (utterances.length > maxUtterances) utterances.shift()
    notify()
    return copy(utterance)
  }

  function updateLast(patch = {}) {
    const last = utterances[utterances.length - 1]
    if (!last) return null
    if (patch.text !== undefined) {
      const clean = String(patch.text == null ? '' : patch.text).trim()
      if (!clean) return null
      last.text = clean
    }
    if (patch.final !== undefined) last.final = patch.final !== false
    if (patch.source) last.source = patch.source
    notify()
    return copy(last)
  }

  /**
   * 编辑整份草稿：把编辑器里的完整文本作为唯一一段写回，
   * 这样「编辑文本」与「撤销最后一段」两个操作不会互相打架。
   */
  function replaceAll(text) {
    const clean = String(text == null ? '' : text).trim()
    if (!clean) {
      utterances = []
      notify()
      return null
    }
    const utterance = {
      id: nextId(),
      text: clean,
      final: true,
      at: Date.now(),
      source: 'edit',
      provider: '',
    }
    utterances = [utterance]
    notify()
    return copy(utterance)
  }

  function undo() {
    const removed = utterances.pop()
    if (removed) notify()
    return copy(removed)
  }

  function clear() {
    const count = utterances.length
    utterances = []
    if (count) notify()
    return count
  }

  function snapshot() {
    return { utterances: utterances.map((item) => ({ ...item })) }
  }

  function restore(value) {
    const list = value && Array.isArray(value.utterances) ? value.utterances : []
    utterances = list
      .map((item) => ({
        id: String((item && item.id) || nextId()),
        text: String((item && item.text) || '').trim(),
        final: !item || item.final !== false,
        at: Number(item && item.at) || Date.now(),
        source: (item && item.source) || 'stt',
        provider: String((item && item.provider) || ''),
      }))
      .filter((item) => item.text)
      .slice(-maxUtterances)
    notify()
  }

  return {
    add,
    updateLast,
    replaceAll,
    undo,
    clear,
    cancel: clear,
    utterances: () => utterances.map((item) => ({ ...item })),
    text: () => composeDraftText(utterances, separator),
    size: () => utterances.length,
    isEmpty: () => utterances.length === 0,
    snapshot,
    restore,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
