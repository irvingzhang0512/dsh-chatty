/**
 * Speech Buffer —— 流式 LLM 增量 → 完整可朗读段。
 *
 * 设计意图（需求 §16 / §17）：
 * - LLM 是逐 Token 输出的，但 TTS 的最小单位**不能**是 Token：表格、代码块、列表
 *   在没输出完之前朗读一定是错的。所以这里做「增量 → 完整块/完整句」的收敛。
 * - 优先级严格遵循契约：完整 Markdown Block > 完整句子 > Token。
 * - 两个硬性安全线：
 *   1. ``` 围栏未闭合 → 一个字符都不吐；
 *   2. 表格行没遇到空行（或下一个块边界）→ 不吐。
 * - 内部复用 `renderer.parseBlocks` / `renderer.renderSpeech`，保证与整段渲染完全一致；
 *   这里只负责「什么时候可以吐」，不重复实现策略逻辑。
 *
 * 本文件不持有任何全局状态：`createSpeechBuffer` 每次返回独立实例。
 */
import { parseBlocks, renderSpeech, __internals } from './renderer.js'

const {
  squash,
  endsWithSentence,
  isIncompleteMarker,
  policyFor,
  SENTENCE_END_CHARS,
  SOFT_BREAK_RE,
} = __internals

/**
 * 创建一个流式语音缓冲。
 *
 * @param {object} [options]
 * @param {object} [options.policy] 渲染策略（透传给 renderSpeech）
 * @param {number} [options.minChars=4] 低于该长度的句子碎片继续攒着（代码提示等 hint 不受限）
 * @param {number} [options.maxBlockChars=400] 单段上限；超限时在逗号/空格处强制切分
 * @param {'block'|'sentence'} [options.mode='block'] 块优先 / 句优先
 * @param {boolean} [options.codeHint] 代码块是否补提示（透传给 renderSpeech）
 */
export function createSpeechBuffer(options = {}) {
  const opts = options && typeof options === 'object' ? options : {}
  const policy = opts.policy && typeof opts.policy === 'object' ? opts.policy : {}
  const minChars = Number.isFinite(opts.minChars) && opts.minChars >= 0 ? Math.floor(opts.minChars) : 4
  const maxBlockChars =
    Number.isFinite(opts.maxBlockChars) && opts.maxBlockChars > 0 ? Math.floor(opts.maxBlockChars) : 400
  const mode = opts.mode === 'sentence' ? 'sentence' : 'block'
  const renderOptions = {}
  if (opts.codeHint !== undefined) renderOptions.codeHint = opts.codeHint
  if (opts.codeHintText !== undefined) renderOptions.codeHintText = opts.codeHintText
  if (opts.listSummaryThreshold !== undefined) renderOptions.listSummaryThreshold = opts.listSummaryThreshold

  let pendingText = ''

  /** 当前 pending 是否以「空行」结束（块真正收尾的信号）。 */
  function endsWithBlankLine() {
    return /\n[ \t]*\n[ \t]*$/.test(pendingText)
  }

  /**
   * 判断块是否「已经完整」。
   * 只有完整的块才允许离开 buffer —— 这是 §16 的核心安全线。
   */
  function isBlockComplete(block, index, blocks) {
    const raw = String(block.raw || '')
    switch (block.kind) {
      case 'code_block':
      case 'mermaid': {
        // 围栏块必须读到闭合围栏（只看开围栏之后的部分）
        const m = raw.match(/^ {0,3}(`{3,}|~{3,})/)
        if (!m) return true
        const marker = m[1]
        const body = raw.slice(raw.indexOf('\n') + 1)
        const closeRe = new RegExp(`^ {0,3}${marker[0]}{${marker.length},}\\s*$`, 'm')
        return closeRe.test(body)
      }
      case 'math_block':
        return /\$\$\s*$/.test(raw)
      case 'table':
        // 表格：只有「后面确实还有内容」（已遇到空行 / 下一个块）才算结束。
        // 注意不能用「以换行结尾」判断：表格最后一行的换行并不代表表格结束。
        return index < blocks.length - 1 || endsWithBlankLine()
      case 'paragraph':
      case 'blockquote':
        // 段落：句末标点即视为可安全朗读的完整单元。
        // 另一种「已完整」的信号是后面确实还跟着别的块（说明流已经翻页了），
        // 此时以冒号/破折号收尾的引导句（「下面是一段示例：」）也可以吐出去。
        if (endsWithSentence(raw)) return true
        return index < blocks.length - 1 && /[：:—-]$/.test(raw.trim())
      case 'list':
        // 列表：后面还有块、或已用空行收尾时，条目才算完整
        return index < blocks.length - 1 || endsWithBlankLine()
      default:
        // heading / url / image / tool_log / inline_code：单行即可判定
        return true
    }
  }

  /**
   * 从块内部切出「已完整的句子」，返回 { text, consumed }。
   * `consumed` 是本次消费的原始字符数，用于精确推进 pendingText。
   */
  function takeSentences(raw, minLength) {
    let cursor = 0
    let out = ''
    while (cursor < raw.length) {
      let end = -1
      for (let i = cursor; i < raw.length; i += 1) {
        if (SENTENCE_END_CHARS.includes(raw[i])) {
          let stop = i + 1
          while (stop < raw.length && '"\'”’）)】」』'.includes(raw[stop])) stop += 1
          end = stop
          break
        }
      }
      if (end < 0) break
      const sentence = raw.slice(cursor, end)
      if (squash(sentence).length < minLength) break
      out += sentence
      cursor = end
    }
    return { text: out, consumed: cursor }
  }

  /** 在 `limit` 之前找最后一个自然断点（逗号 / 空格 / 换行）。 */
  function softBreakBefore(text, limit) {
    for (let i = Math.min(limit, text.length) - 1; i > 0; i -= 1) {
      if (SOFT_BREAK_RE.test(text[i])) return i
    }
    return -1
  }

  /** 把一段纯文本渲染成可送 TTS 的 segment[]（复用 renderer 的策略逻辑）。 */
  function emitText(text, asBlock) {
    const source = asBlock || text.includes('\n') ? text : `\n\n${text}`
    const result = renderSpeech(source, policy, renderOptions)
    return result.segments
  }

  /** 推进 pendingText：丢掉已消费的原始字符与块之间的空白。 */
  function consume(count) {
    pendingText = pendingText.slice(count).replace(/^\s+/, '')
    if (!pendingText.trim()) pendingText = ''
  }

  /**
   * 消费 pending 里所有「已经可以安全朗读」的内容。
   *
   * `offset` 语义是「pendingText 中已消费到的绝对下标」——用 `indexOf(raw, cursor)`
   * 定位每个块的真实起点，这样块之间夹着的空行不会让 offset 漂移。
   *
   * @param {boolean} final 是否为 flush（流结束，所有内容都当作完整）
   */
  function take(final) {
    const segments = []
    if (!pendingText.trim()) return segments
    const blocks = parseBlocks(pendingText)
    if (!blocks.length) return segments

    let offset = 0
    let cursor = 0

    for (let index = 0; index < blocks.length; index += 1) {
      const block = blocks[index]
      const raw = String(block.raw || '')
      const start = pendingText.indexOf(raw, cursor)
      if (start < 0) break
      cursor = start
      const isFenced = block.kind === 'code_block' || block.kind === 'mermaid' || block.kind === 'math_block'
      const isTable = block.kind === 'table'
      const structurallyComplete = isBlockComplete(block, index, blocks)
      // flush 时把「没读到收尾标记」的围栏块也当作未完整：宁可少读，也不能把半截代码念出来。
      // 表格例外——已经拿到的行是可信的，flush 时按现有行做摘要即可。
      const complete = final ? !(isFenced && !structurallyComplete) : structurallyComplete

      // ---- 安全线：未闭合的代码围栏 / 未结束的表格，绝不吐内容 ----
      if (!complete && (isFenced || isTable)) break

      // ---- skip 策略的最后一块：只有「还没收尾成独立行」时才留在缓冲里 ----
      // 原因：像日志行这种块一旦被消费掉，后面追加的增量会从行中间重新解析，
      // 变成半截垃圾（"... ERROR b" + "oom" 被切成两段念出来）。
      // 等它被换行/空行收尾后再统一消费 + skip，既安全又不会让缓冲无限增长。
      if (policyFor(block.kind, policy) === 'skip' && index === blocks.length - 1 && !/\n\s*$/.test(pendingText)) {
        break
      }

      // ---- 块还没收尾，而且只是某个结构的半截开头（如 `![架构图](ht`）----
      // 既不能念，也不能当成完整块消费掉，只能等后续增量。
      if (!complete && !final && isIncompleteMarker(raw)) break

      // ---- 完整块优先 ----
      if (complete) {
        const strategy = policyFor(block.kind, policy)
        const isParagraphLike = block.kind === 'paragraph' || block.kind === 'blockquote'
        const isList = block.kind === 'list'

        if (mode === 'sentence' && (isParagraphLike || isList) && strategy !== 'skip') {
          // 句优先模式：段落/列表内部继续按完整句子切
          const { text, consumed } = takeSentences(raw, minChars)
          if (consumed > 0) {
            segments.push(...emitText(text, true))
            offset = start + consumed
            cursor = offset
          }
          if (consumed >= raw.length) continue
          // 还有未成句的尾巴：超长时在自然断点强制切分，否则留着等下一批增量
          const rest = raw.slice(consumed)
          if (rest.length > maxBlockChars || final) {
            const breakAt = rest.length > maxBlockChars ? softBreakBefore(rest, maxBlockChars) : -1
            const head = breakAt > 0 ? rest.slice(0, breakAt) : rest.length > maxBlockChars ? rest.slice(0, maxBlockChars) : rest
            segments.push(...emitText(head, true))
            offset = start + consumed + head.length
          }
          break
        }

        if (isParagraphLike && !final && squash(raw).length < minChars) {
          // 太短的段落碎片继续攒着（典型场景：短句还没写完）
          break
        }

        segments.push(...emitText(raw, true))
        offset = start + raw.length
        cursor = offset
        continue
      }

      // ---- 块未完整：只在段落/列表上做有限推进 ----
      if (block.kind === 'paragraph' || block.kind === 'blockquote' || block.kind === 'list') {
        if (mode === 'sentence') {
          const { text, consumed } = takeSentences(raw, minChars)
          if (consumed > 0) {
            segments.push(...emitText(text, true))
            offset = start + consumed
          }
          break
        }
        // block 模式：超长时在逗号/空格处强制切分，避免 TTS 长时间无输出
        if (raw.length > maxBlockChars) {
          const breakAt = softBreakBefore(raw, maxBlockChars)
          const head = breakAt > 0 ? raw.slice(0, breakAt) : raw.slice(0, maxBlockChars)
          segments.push(...emitText(head, true))
          offset = start + head.length
        }
        break
      }

      break
    }

    if (offset > 0) consume(offset)
    return segments
  }

  return {
    /**
     * 追加 LLM 文本增量，返回本次可安全朗读的段。
     * @param {string} delta
     * @returns {Array<{kind: string, text: string, source: 'block'|'hint'}>}
     */
    push(delta) {
      const text = typeof delta === 'string' ? delta : delta == null ? '' : String(delta)
      if (!text) return []
      pendingText += text
      return take(false)
    },

    /**
     * 流结束：吐出剩余全部内容。
     *
     * 规则与流式阶段保持一致：
     * - 完整的块（含只有一行就完整的图片/日志块）按策略渲染；
     * - 段落这种需要收尾信号的块也放行，并补一个句号让 TTS 收尾自然；
     * - 没写完的结构（半截图片标记、没闭合的围栏、只有半行的表格）一律丢弃——
     *   那不是内容，只是被截断的语法，念出来只会是噪音。
     *
     * @returns {Array<{kind: string, text: string, source: 'block'|'hint'}>}
     */
    flush() {
      if (!pendingText.trim()) {
        pendingText = ''
        return []
      }
      const segments = take(true)

      const rest = pendingText.trim()
      pendingText = ''
      if (!rest) return segments

      for (const block of parseBlocks(rest)) {
        const raw = String(block.raw || '')
        const strategy = policyFor(block.kind, policy)
        const isFenced = block.kind === 'code_block' || block.kind === 'mermaid' || block.kind === 'math_block'
        if (isFenced && !isBlockComplete(block, 0, [block])) continue
        if (isIncompleteMarker(raw) || isIncompleteMarker(raw.split('\n').pop())) continue
        if (strategy === 'skip') {
          if (block.kind === 'code_block' && renderOptions.codeHint !== false) {
            segments.push({
              kind: 'code_block',
              text: renderOptions.codeHintText || '这里包含一段代码示例，请查看页面内容。',
              source: 'hint',
            })
          }
          continue
        }
        if (block.kind === 'paragraph') {
          const text = endsWithSentence(raw) ? raw : `${raw}。`
          segments.push(...emitText(text, true))
          continue
        }
        segments.push(...emitText(raw, true))
      }
      return segments
    },

    /** 清空缓冲（打断 / 会话结束）。 */
    reset() {
      pendingText = ''
    },

    /** 当前尚未吐出的原始文本（调试与测试用）。 */
    pending() {
      return pendingText
    },
  }
}
