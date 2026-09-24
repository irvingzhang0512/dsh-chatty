// composer 即草稿：语音识别结果直写 Session 输入框的纯文本逻辑。
//
// 设计：
//   - appendSegment：把一段识别结果追加到输入框现有内容之后（空输入框直接写入；
//     已有内容先去掉尾部空白再用换行衔接），并给出本次插入的区间，
//     供「撤销最后一段」按区间回退。
//   - revertLastInsert：按插入历史回退最近一次追加。回退前校验目标区间
//     仍是当初写入的内容——用户已经手改过就放弃回退（保守，不吞用户输入）。
//
// 纯函数、零依赖：宿主单测直接 import；构建脚本把它内联进浏览器 bundle
// （去掉 export 前缀），两端共享同一实现。

/**
 * 追加一段识别结果。
 * @param {string} current 输入框当前文本
 * @param {string} segment 本段识别结果
 * @param {string} [separator] 衔接符（默认换行）
 * @returns {{ text: string, insertStart: number, insertEnd: number }}
 */
export function appendSegment(current, segment, separator = '\n') {
  const base = String(current ?? '')
  const clean = String(segment ?? '').trim()
  if (!clean) return { text: base, insertStart: base.length, insertEnd: base.length }
  if (!base.trim()) return { text: clean, insertStart: 0, insertEnd: clean.length }
  // 插入区间包含衔接符：撤销时连换行一起删，不会残留空行。
  const trimmed = base.replace(/\s+$/, '')
  return {
    text: trimmed + separator + clean,
    insertStart: trimmed.length,
    insertEnd: trimmed.length + separator.length + clean.length,
  }
}

/**
 * 记录一次插入（生成撤销条目）。
 * @returns {{ before: string, added: string, start: number, end: number } | null}
 */
export function recordInsert(before, result) {
  if (!result || result.insertStart === result.insertEnd) return null
  const added = result.text.slice(result.insertStart, result.insertEnd)
  if (!added) return null
  return { before: String(before ?? ''), added, start: result.insertStart, end: result.insertEnd }
}

/**
 * 回退最近一次插入。
 * @param {string} current 输入框当前文本
 * @param {Array<{before: string, added: string, start: number, end: number}>} history 插入历史（可变，回退成功时弹出一条）
 * @returns {{ text: string, removed: string | null }}
 */
export function revertLastInsert(current, history) {
  const last = Array.isArray(history) ? history[history.length - 1] : null
  if (!last) return { text: String(current ?? ''), removed: null }
  const text = String(current ?? '')
  if (text.slice(last.start, last.end) !== last.added) {
    // 目标区间已被用户修改：放弃回退，避免吞掉用户输入。
    return { text, removed: null }
  }
  history.pop()
  return { text: text.slice(0, last.start) + text.slice(last.end), removed: last.added }
}

/**
 * 回退所有由语音插入的段落（「清空」指令）。逐条尝试回退，
 * 遇到被用户改动的段落即停止（保护用户输入）。
 */
export function revertAllInserts(current, history) {
  let text = String(current ?? '')
  let removed = 0
  while (history.length) {
    const result = revertLastInsert(text, history)
    if (!result.removed) break
    text = result.text
    removed += 1
  }
  return { text, removed }
}
