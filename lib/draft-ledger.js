// 原生编辑器是唯一正文；此账本只记录可靠的语音区间和 CAS 锚点。
export function createDraftLedger({ actions, state, limit = 200 }) {
  let current = state
  let epoch = 0
  let edits = []
  let records = []
  let floor = state?.draftRev || 0
  function detect(s) {
    let text = String(s?.draft || '')
    for (const o of [...(s?.occurrences || [])].sort(
      (a, b) => b.offset - a.offset
    ))
      text =
        text.slice(0, o.offset) + '\ufffc' + text.slice(o.offset + o.length)
    return text
  }
  function receive(s) {
    if (!s) return
    if (current && s.draftRev < current.draftRev) return
    if (
      current &&
      (s.draftRev !== current.draftRev || detect(s) !== detect(current))
    ) {
      epoch++
      edits = []
      records = []
      floor = s.draftRev
    }
    current = s
  }
  function capture() {
    const span = actions().captureInsertion()
    return { ...span, start: span.end, epoch }
  }
  function rebase(span) {
    if (
      !current ||
      span.epoch !== epoch ||
      span.draftRev < floor ||
      span.draftRev > current.draftRev
    )
      return null
    let start = span.start,
      end = span.end
    for (const e of edits) {
      if (e.rev <= span.draftRev) continue
      if (e.end <= start) {
        start += e.delta
        end += e.delta
      } else if (e.start < end) return null
    }
    return { start, end, draftRev: current.draftRev }
  }
  function apply(text, span) {
    const rebased = rebase(span)
    if (!rebased || (current.phase && current.phase !== 'plain')) return false
    const { start, end } = rebased
    const adjusted = { start, end, draftRev: current.draftRev }
    const before = detect(current)
    if (!actions().insertText(text, adjusted)) return false
    const clean = String(text).replace(/\ufffc/g, '')
    const after = before.slice(0, start) + clean + before.slice(end)
    const nextRev = current.draftRev + 1
    const delta = clean.length - (end - start)
    records = records.flatMap((r) =>
      r.end <= start
        ? [r]
        : r.start >= end
          ? [{ ...r, start: r.start + delta, end: r.end + delta }]
          : []
    )
    edits.push({ rev: nextRev, start, end, delta })
    if (edits.length > limit * 2) floor = edits.shift().rev
    current = { ...current, draft: after, occurrences: [], draftRev: nextRev }
    return {
      start,
      end: start + clean.length,
      text: clean,
      rev: nextRev,
      epoch
    }
  }
  function insert(text, anchor, separator = '\n') {
    const previous = records.at(-1)
    const adjusted = rebase(anchor)
    if (!adjusted) return false
    const prefix =
      previous && previous.end === adjusted.start && previous.epoch === epoch
        ? separator
        : ''
    const record = apply(prefix + text, anchor)
    if (record) {
      records.push(record)
      if (records.length > limit) records.shift()
    }
    return !!record
  }
  function replace(text, span) {
    const record = apply(text, span)
    if (!record) return false
    records.push(record)
    records.sort((a, b) => a.start - b.start)
    return true
  }
  function remove(record) {
    if (!record || record.epoch !== epoch) return false
    const result = apply('', {
      start: record.start,
      end: record.end,
      draftRev: current.draftRev,
      epoch
    })
    if (!result) return false
    records = records.filter((r) => r !== record)
    return true
  }
  return {
    receive,
    capture,
    insert,
    apply,
    replace,
    rebase,
    undo: () => remove(records.at(-1)),
    clear: () => {
      while (records.length) if (!remove(records.at(-1))) return false
      return true
    },
    records: () => records.slice(),
    text: () => records.map((r) => r.text).join(''),
    epoch: () => epoch,
    reset() {
      epoch++
      records = []
      edits = []
      floor = current?.draftRev || 0
    }
  }
}
