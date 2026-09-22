/**
 * Speech Renderer —— 把「适合看」的 Markdown 转成「适合听」的纯文本。
 *
 * 设计意图（需求 §11~§15）：
 * - 页面仍然渲染完整 Markdown；本模块只产出**临时**的 Speech Text，绝不修改原始消息。
 * - 先按 Markdown 结构切块（`parseBlocks`），再对每个块按策略渲染（`renderSpeech`），
 *   这样「表格摘要 / 代码跳过」等决策都发生在块级别，而不是逐行拼字符串。
 * - 每种块类型有独立策略：`read` / `skip` / `summarize` / `smart` / `label_only`。
 * - 表格绝不逐格朗读，规则摘要产出自然中文口语句子（需求 §13）；
 *   复杂表格可注入 LLM 摘要（`renderSpeechAsync`），失败回落同步规则。
 *
 * 本文件只依赖 Node 内置能力之外的空集合——纯函数、无副作用、无外部依赖。
 */

/** 支持的块类型（顺序即文档顺序，便于 UI 生成配置项）。 */
export const BLOCK_KINDS = [
  'paragraph',
  'heading',
  'list',
  'table',
  'code_block',
  'inline_code',
  'mermaid',
  'ascii_diagram',
  'url',
  'image',
  'math_block',
  'tool_log',
  'blockquote',
]

/**
 * 默认渲染策略（需求 §12.2 的 YAML 示例逐字对应）。
 * 冻结对象：调用方要改策略必须自己展开一份，避免共享状态被意外修改。
 */
export const DEFAULT_RENDERER_POLICY = Object.freeze({
  paragraph: 'read',
  heading: 'read',
  list: 'smart',
  table: 'summarize',
  code_block: 'skip',
  inline_code: 'smart',
  mermaid: 'skip',
  ascii_diagram: 'skip',
  url: 'label_only',
  image: 'skip',
  math_block: 'skip',
  tool_log: 'skip',
  blockquote: 'read',
})

/** 合法策略值。`label_only` 只对 url / image 这类「有标签但没正文」的块有意义。 */
export const POLICY_VALUES = Object.freeze(['read', 'skip', 'summarize', 'smart', 'label_only'])

/** 可朗读的块类型白名单：`smart` 判定为「值得读」时也只对这些类型放行。 */
const READABLE_KINDS = new Set(['paragraph', 'heading', 'list', 'blockquote', 'table', 'inline_code'])

/** 围栏代码块起始行：```lang / ~~~lang（允许缩进）。语言标记不能含 $，否则 `$$` 会被误判成围栏。 */
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})\s*([^\s`$]*)/

/** Markdown 链接 [文字](地址)，可选 title。 */
const MD_LINK_RE = /\[([^\]\n]*)\]\(\s*[^)\s]+(?:\s+["'][^"']*["'])?\s*\)/g

/** Markdown 图片 ![alt](src)，可选 title。 */
const MD_IMAGE_RE = /!\[([^\]\n]*)\]\(\s*[^)\s]+(?:\s+["'][^"']*["'])?\s*\)/g

/** 裸 URL（不含尾随中文标点）。 */
const BARE_URL_RE = /(?:https?|ftp|wss?):\/\/[^\s<>"'）】」》，。；！？]+/g

/** 裸 URL 的尾巴可能粘连中文标点或英文句点，剥掉它们。 */
function stripUrlTail(url) {
  const value = str(url)
  return value.replace(/[.,;:!?，。；：！？、）)】」》]+$/, '')
}

/** 引用标记：[1] / [citation] / [来源:xxx] / 【1】。 */
const CITATION_RE = /\[\s*(?:\d{1,3}|citation|citations|cite|ref|reference|来源|参考)(?:\s*[:：][^\]\n]*)?\s*\]|【\s*\d{1,3}\s*】/gi

/** 完整的 Markdown 图片 / 链接。 */
const MD_IMAGE_FULL_RE = /^\s*!\[[^\]]*\]\(\s*[^)\s]+(?:\s+["'][^"']*["'])?\s*\)\s*$/
const MD_LINK_FULL_RE = /^\s*\[[^\]]*\]\(\s*[^)\s]+(?:\s+["'][^"']*["'])?\s*\)\s*$/

/**
 * 判断文本是否只是某个块级结构的「半截开头」。
 * 流式场景下 `![架构图](ht` 这种中间态绝不能被当成段落念出来。
 */
export function isIncompleteMarker(raw) {
  const text = str(raw)
  if (!text.trim()) return false
  // 表格行
  if (/^\s*\|/.test(text) && !/\|\s*$/.test(text.trim())) return true
  // 图片 / 链接还没收尾
  if (/^\s*!\[/.test(text) && !MD_IMAGE_FULL_RE.test(text)) return true
  if (/^\s*\[/.test(text) && !MD_LINK_FULL_RE.test(text) && /\]\(\s*[^)\s]*$/.test(text)) return true
  // 公式开标记
  if (/^\s*\$\$?\s*$/.test(text)) return true
  // 强调标记
  if (/^\s*\*{1,3}$/.test(text) || /^\s*_{1,3}$/.test(text) || /^\s*~{1,2}$/.test(text)) return true
  return false
}

/** 块级数学公式：$$ ... $$（可单行或跨行）。 */
const MATH_BLOCK_RE = /^\s*\$\$([\s\S]*?)\$\$\s*$/

/** 未闭合的公式块：行首 $$ 独占一行（或紧随换行），内容还没输出完。 */
const MATH_OPEN_RE = /^\s*\$\$\s*\n/

/** 日志行特征（用于 tool_log / debug 识别）。 */
const LOG_HINT_RE =
  /(^|\s)(?:\[?(?:trace|debug|info|warn|warning|error|fatal|notice)\]?\b|\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}|tool[_ ]?call|tool_use|tool_result|toolResult|function_call|调用工具|工具调用|at\s+\S+\s+\(|stack trace|stacktrace)/i

/** ASCII 制图常用字符（不含 `|`，避免把表格误判为图）。 */
const ASCII_ART_CHARS = '─│┌┐└┘├┤┬┴┼━┃┏┓┗┛┣┫┳┻╋╭╮╯╰▼▲◀▶►◄←→↑↓↔'
const ASCII_ART_RE = new RegExp(`[${ASCII_ART_CHARS}]`)
const ASCII_ARROW_RE = /(?:-{2,}|={2,}|<{2,}|>{2,})\s*[>v^<]|--\+|--\*|\+--/

/** 常见英文计量单位 → 口语化中文（需求 §13 示例：500 ms → 500 毫秒）。 */
const UNIT_CN = new Map([
  ['ms', '毫秒'],
  ['msec', '毫秒'],
  ['millisecond', '毫秒'],
  ['milliseconds', '毫秒'],
  ['s', '秒'],
  ['sec', '秒'],
  ['secs', '秒'],
  ['second', '秒'],
  ['seconds', '秒'],
  ['min', '分钟'],
  ['mins', '分钟'],
  ['minute', '分钟'],
  ['minutes', '分钟'],
  ['h', '小时'],
  ['hr', '小时'],
  ['hrs', '小时'],
  ['hour', '小时'],
  ['hours', '小时'],
  ['kb', 'KB'],
  ['mb', 'MB'],
  ['gb', 'GB'],
  ['tb', 'TB'],
  ['b', '字节'],
  ['byte', '字节'],
  ['bytes', '字节'],
  ['tps', 'tokens每秒'],
  ['tokens/s', 'tokens每秒'],
  ['qps', '每秒查询数'],
])

/** 中文单位原样保留（含常见全角写法）。 */
const CN_UNITS = new Set([
  '毫秒',
  '秒',
  '分钟',
  '小时',
  '天',
  '年',
  '个',
  '次',
  '项',
  '条',
  '人',
  '元',
  '万元',
  '美元',
  '字节',
  '百分比',
  '倍',
  '分',
  '度',
  '℃',
])

/** 句子结束标点。 */
const SENTENCE_END_CHARS = '。！？!?；;…'

/** 强制切分时可用的断点。 */
const SOFT_BREAK_RE = /[，,、；;：:\s]/

/** 表格摘要默认最多朗读的数据行数（超出部分只报数量）。 */
const DEFAULT_TABLE_MAX_ROWS = 5

/** 列表摘要默认最多逐条朗读的条目数。 */
const DEFAULT_LIST_MAX_ITEMS = 5

/** 超过该条目数的列表按「摘要」处理（需求 §12.1 的「超长列表」）。 */
const DEFAULT_LIST_SUMMARY_THRESHOLD = 8

// ---------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------

/** 空值安全取字符串。 */
function str(value) {
  return typeof value === 'string' ? value : value == null ? '' : String(value)
}

/** 归一化策略值；无法识别时回落到默认策略，保证渲染永不因配置错误而失败。 */
function policyFor(kind, policy) {
  const raw = policy && typeof policy === 'object' ? policy[kind] : undefined
  if (typeof raw === 'string' && POLICY_VALUES.includes(raw)) return raw
  return DEFAULT_RENDERER_POLICY[kind] || 'read'
}

/** 把块内多行压成一行，折叠多余空白。 */
function squash(text) {
  return str(text).replace(/\s+/g, ' ').trim()
}

/** 判断是否为表格分隔行（|---|---|:--:|）。 */
function isTableSeparator(line) {
  const t = str(line).trim()
  if (!t.includes('-') || !t.includes('|')) return false
  const cells = t.replace(/^\|/, '').replace(/\|$/, '').split('|')
  if (!cells.length) return false
  return cells.every((cell) => /^:?-{2,}:?$/.test(cell.trim()))
}

/** 表格单元格切分：支持首尾竖线可有可无。 */
function splitTableRow(line) {
  let t = str(line).trim()
  if (t.startsWith('|')) t = t.slice(1)
  if (t.endsWith('|')) t = t.slice(0, -1)
  return t.split('|').map((cell) => cell.trim())
}

/** 去掉列表标记（- / * / + / 1. / 1)），返回正文。 */
function stripListMarker(line) {
  return str(line)
    .replace(/^\s{0,3}(?:[-*+]|\d{1,3}[.)])\s+/, '')
    .trim()
}

/** 去掉引用标记（>），返回正文。 */
function stripQuoteMarker(line) {
  return str(line).replace(/^\s{0,3}>\s?/, '').trim()
}

/** 行内 Markdown → 纯文本（保留行内代码内容，去掉标记）。 */
function stripInlineMarkup(text) {
  return str(text)
    .replace(MD_IMAGE_RE, '')
    .replace(MD_LINK_RE, '$1')
    .replace(CITATION_RE, '')
    // 裸 URL 不朗读：整段删掉（尾随标点一并吃掉），否则 TTS 会一个字符一个字符地念链接
    .replace(BARE_URL_RE, '')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/\*\*\*([^*\n]+)\*\*\*/g, '$1')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?=[^*\w]|$)/g, '$1$2')
    .replace(/___([^_\n]+)___/g, '$1')
    .replace(/__([^_\n]+)__/g, '$1')
    .replace(/~~([^~\n]+)~~/g, '$1')
}

/** 块级文本 → 可朗读纯文本（清标记 + 压缩空白）。 */
function normalizeForSpeech(text) {
  return squash(stripInlineMarkup(text))
}

/** 追加中文句号（已有结束标点则不动）。 */
function endSentence(text) {
  const t = squash(text)
  if (!t) return ''
  return /[。！？!?…；;，,：:]$/.test(t) ? t : `${t}。`
}

/** 是否为「一句结束」的文本。 */
function endsWithSentence(text) {
  return new RegExp(`[${SENTENCE_END_CHARS}]["'”’）)】」』]?$`).test(str(text).trim())
}

/** 数字与单位之间补空格，便于 TTS 断句（500ms → 500 ms）。 */
export function spaceUnits(text) {
  return str(text)
    .replace(/(\d)(?=[A-Za-z%℃])/g, '$1 ')
    .replace(/([A-Za-z%℃])(?=\d)/g, '$1 ')
}

/**
 * 把数值+单位口语化。
 * @returns {{ text: string, unit: string, isApprox: boolean, numeric: number|null }}
 */
function formatValue(value, unitHint = '') {
  const raw = normalizeForSpeech(value)
  if (!raw) return { text: '', unit: '', isApprox: false, numeric: null }
  const m = raw.match(/^(-?\d+(?:[.,]\d+)?)\s*([A-Za-z%℃/]+|[\u4e00-\u9fa5]{1,3})?$/)
  if (!m) {
    // 文本型取值：保留原文，但行内代码之类的标记已在上一步剥离。
    return { text: raw, unit: '', isApprox: false, numeric: null }
  }
  const numeric = Number(m[1].replace(/,/g, ''))
  const rawUnit = m[2] || unitHint || ''
  const unit = normalizeUnit(rawUnit)
  const numText = m[1].replace(/,/g, '')
  const text = unit ? `${numText} ${unit}` : numText
  return { text, unit, isApprox: Boolean(unit), numeric: Number.isFinite(numeric) ? numeric : null }
}

/** 单位口语化。 */
function normalizeUnit(unit) {
  const u = squash(unit)
  if (!u) return ''
  const lower = u.toLowerCase()
  if (UNIT_CN.has(lower)) return UNIT_CN.get(lower)
  if (CN_UNITS.has(u)) return u
  if (/^[A-Za-z%℃/]+$/.test(u)) return u
  if (/^[\u4e00-\u9fa5]{1,3}$/.test(u)) return u
  return u
}

/** 从表头里拆出「指标名」与「单位」：延迟（毫秒）→ { label: '延迟', unit: '毫秒' }。 */
function splitHeaderUnit(header) {
  const raw = normalizeForSpeech(header)
  if (!raw) return { label: '', unit: '' }
  const m = raw.match(/^(.*?)\s*[（(\[【]\s*([^）)\]】]{1,8})\s*[）)\]】]\s*$/)
  if (!m) return { label: raw, unit: '' }
  return { label: squash(m[1]) || raw, unit: normalizeUnit(m[2]) }
}

/** 清洗表头，得到可直接念出来的指标名。 */
function cleanHeader(header) {
  const raw = normalizeForSpeech(header)
  if (!raw) return ''
  if (raw.length > 12) return ''
  if (/^[-—=]+$/.test(raw)) return ''
  return raw
}

// ---------------------------------------------------------------------------
// 块解析
// ---------------------------------------------------------------------------

/**
 * 把一个「裸块」判定为块类型。
 * 判定顺序即优先级：围栏/公式/表格等强结构优先，文本启发式最后。
 */
export function classifyBlock(raw) {
  const text = str(raw)
  const trimmed = text.trim()
  if (!trimmed) return 'paragraph'

  // 1) 围栏代码块（含 mermaid）
  const fence = trimmed.match(FENCE_RE)
  if (fence) {
    const lang = (fence[2] || '').toLowerCase()
    return lang === 'mermaid' ? 'mermaid' : 'code_block'
  }

  // 2) 块级数学公式（对 trim 后的文本判定，容忍尾随换行）。
  //    未闭合的公式块也要认出来，否则 buffer 会把半截公式当段落念出去。
  if (MATH_BLOCK_RE.test(trimmed) || MATH_OPEN_RE.test(text)) return 'math_block'

  // 3) 行内代码：整块就是一个反引号片段
  if (/^\s*`[^`\n]+`\s*$/.test(text)) return 'inline_code'

  const lines = text.split('\n')
  const nonEmpty = lines.filter((line) => line.trim())

  // 4) 表格
  if (nonEmpty.length >= 2) {
    const pipeCount = (line) => (line.match(/\|/g) || []).length
    if (nonEmpty.every((line) => pipeCount(line) >= 2)) return 'table'
    if (isTableSeparator(nonEmpty[1]) && pipeCount(nonEmpty[0]) >= 2) return 'table'
  }

  // 5) 标题
  if (/^\s{0,3}#{1,6}\s/.test(text)) return 'heading'

  // 6) 引用
  if (nonEmpty.length > 0 && nonEmpty.every((line) => /^\s{0,3}>/.test(line))) return 'blockquote'

  // 7) 列表
  if (nonEmpty.length > 0 && nonEmpty.every((line) => /^\s{0,3}(?:[-*+]|\d{1,3}[.)])\s+/.test(line))) {
    return 'list'
  }

  // 8) 图片（整块只有一张图）
  if (nonEmpty.length === 1 && MD_IMAGE_FULL_RE.test(nonEmpty[0])) return 'image'

  // 9) 链接（裸 URL 或整块只有一条 Markdown 链接）：按 url 策略处理，只念链接文字
  if (nonEmpty.length === 1 && /^\s*(?:https?|ftp|wss?):\/\/\S+\s*$/.test(nonEmpty[0])) return 'url'
  if (nonEmpty.length === 1 && MD_LINK_FULL_RE.test(nonEmpty[0])) return 'url'

  // 10) 工具日志 / Debug
  if (LOG_HINT_RE.test(text)) return 'tool_log'

  // 11) ASCII 制图
  const artHits = nonEmpty.filter((line) => ASCII_ART_RE.test(line) || ASCII_ARROW_RE.test(line))
  if (artHits.length > 0 && (nonEmpty.length >= 2 || ASCII_ART_RE.test(text))) return 'ascii_diagram'

  // 12) 兜底
  return 'paragraph'
}

/**
 * 把 Markdown 切成块列表。
 * 返回 `[{ kind, raw, text }]`：`raw` 是原始 Markdown 片段，`text` 是保守清洗后的纯文本
 * （供策略为 `read` 的块直接使用；`summarize` 等策略仍基于 `raw` 生成）。
 *
 * 注意：`inline_code` 不是顶层块类型（行内代码总是嵌在段落里），但 `classifyBlock`
 * 对「整块就是一个行内代码」的输入会返回 `inline_code`，便于单独配置与测试。
 */
export function parseBlocks(markdown) {
  const source = str(markdown).replace(/\r\n?/g, '\n')
  const lines = source.split('\n')
  const blocks = []
  let i = 0

  /** 收集连续同类行（列表/引用）。 */
  const collectWhile = (test) => {
    const collected = []
    while (i < lines.length && test(lines[i])) {
      collected.push(lines[i])
      i += 1
    }
    return collected
  }

  while (i < lines.length) {
    const line = lines[i]

    // 空行：块分隔
    if (!line.trim()) {
      i += 1
      continue
    }

    // 围栏代码块 / mermaid：必须读到闭合围栏
    const fenceMatch = line.match(FENCE_RE)
    if (fenceMatch) {
      const marker = fenceMatch[1]
      const collected = [line]
      i += 1
      let closed = false
      while (i < lines.length) {
        collected.push(lines[i])
        if (new RegExp(`^ {0,3}${marker[0]}{${marker.length},}\\s*$`).test(lines[i])) {
          closed = true
          i += 1
          break
        }
        i += 1
      }
      if (!closed && i >= lines.length) {
        // 未闭合：整段作为代码块（buffer 会据此判定「尚未完成」）
      }
      blocks.push(makeBlock(collected.join('\n')))
      continue
    }

    // 块级数学公式：$$ 单行或跨行（闭合的 $$ 必须在开头的 $$ 之后）
    if (/^\s*\$\$/.test(line)) {
      const collected = [line]
      let closed = /\$\$\s*$/.test(line.trim().slice(2))
      i += 1
      while (i < lines.length && !closed) {
        collected.push(lines[i])
        if (/\$\$\s*$/.test(lines[i])) closed = true
        i += 1
      }
      blocks.push(makeBlock(collected.join('\n')))
      continue
    }

    // 表格：连续含 | 的行
    if ((line.match(/\|/g) || []).length >= 2 && i + 1 < lines.length) {
      const collected = [line]
      let j = i + 1
      while (j < lines.length && lines[j].trim() && (lines[j].match(/\|/g) || []).length >= 2) {
        collected.push(lines[j])
        j += 1
      }
      if (collected.length >= 2) {
        i = j
        blocks.push(makeBlock(collected.join('\n')))
        continue
      }
    }

    // 标题
    if (/^\s{0,3}#{1,6}\s/.test(line)) {
      i += 1
      blocks.push(makeBlock(line))
      continue
    }

    // 引用：连续 > 行
    if (/^\s{0,3}>/.test(line)) {
      const collected = collectWhile((l) => /^\s{0,3}>/.test(l))
      blocks.push(makeBlock(collected.join('\n')))
      continue
    }

    // 列表：连续列表项
    if (/^\s{0,3}(?:[-*+]|\d{1,3}[.)])\s+/.test(line)) {
      const collected = collectWhile((l) => /^\s{0,3}(?:[-*+]|\d{1,3}[.)])\s+/.test(l))
      blocks.push(makeBlock(collected.join('\n')))
      continue
    }

    // Setext 标题：下一行是 === 或 --- 且不含 |
    const next = lines[i + 1]
    if (next && /^\s{0,3}(={2,}|-{2,})\s*$/.test(next) && !next.includes('|')) {
      i += 2
      blocks.push(makeBlock(`${line}\n${next}`))
      continue
    }

    // 段落：直到空行或下一个「强结构」起始行
    const collected = [line]
    i += 1
    while (i < lines.length) {
      const cur = lines[i]
      if (!cur.trim()) break
      if (FENCE_RE.test(cur.trim())) break
      if (/^\s*\$\$/.test(cur)) break
      if (/^\s{0,3}#{1,6}\s/.test(cur)) break
      if (/^\s{0,3}>/.test(cur)) break
      if (/^\s{0,3}(?:[-*+]|\d{1,3}[.)])\s+/.test(cur)) break
      if ((cur.match(/\|/g) || []).length >= 2) break
      collected.push(cur)
      i += 1
    }
    blocks.push(makeBlock(collected.join('\n')))
  }

  return blocks
}

/** 构造块对象。 */
function makeBlock(raw) {
  const kind = classifyBlock(raw)
  return { kind, raw, text: blockText(kind, raw) }
}

/** 按块类型抽取保守的纯文本表示。 */
function blockText(kind, raw) {
  switch (kind) {
    case 'heading':
      return normalizeForSpeech(str(raw).replace(/^\s{0,3}#{1,6}\s*/, ''))
    case 'list':
      return squash(
        str(raw)
          .split('\n')
          .filter((line) => line.trim())
          .map((line) => stripListMarker(line))
          .join('，'),
      )
    case 'blockquote':
      return squash(
        str(raw)
          .split('\n')
          .filter((line) => line.trim())
          .map((line) => stripQuoteMarker(line))
          .join(' '),
      )
    case 'table':
      return summarizeTable(raw)
    case 'code_block':
    case 'mermaid':
    case 'math_block':
      return ''
    case 'image':
      return ''
    case 'url': {
      const m = str(raw).trim().match(/^\s*(?:https?|ftp|wss?):\/\/(\S+?)[/\s]*$/)
      if (!m) return ''
      const host = m[1].split('/')[0]
      return host || ''
    }
    case 'tool_log':
      return ''
    default:
      return normalizeForSpeech(raw)
  }
}

// ---------------------------------------------------------------------------
// 表格摘要（规则版）
// ---------------------------------------------------------------------------

/**
 * 解析 Markdown 表格。
 * @returns {{ headers: string[], rows: string[][] }}
 */
export function parseTable(raw) {
  const lines = str(raw)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && line.includes('|'))
  if (!lines.length) return { headers: [], rows: [] }

  let headerCells = splitTableRow(lines[0])
  let bodyStart = 1
  if (lines[1] && isTableSeparator(lines[1])) bodyStart = 2

  const rows = []
  for (let i = bodyStart; i < lines.length; i += 1) {
    if (isTableSeparator(lines[i])) continue
    const cells = splitTableRow(lines[i])
    if (!cells.some((cell) => cell !== '')) continue
    rows.push(cells)
  }

  // 表头为空（无分隔行的伪表格）时，把首行当作数据行
  if (bodyStart === 1 && !headerCells.some((cell) => cell)) {
    headerCells = []
  }
  const width = Math.max(headerCells.length, ...rows.map((row) => row.length), 0)
  const pad = (arr) => {
    const out = arr.slice(0, width)
    while (out.length < width) out.push('')
    return out
  }
  return { headers: pad(headerCells), rows: rows.map(pad) }
}

/**
 * 用规则把表格转成自然中文口语句子（需求 §13）。
 *
 * 设计取舍：
 * - 第一列视为「对象名/标签」，其余列视为「指标」。
 * - 优先挑一个数值列作为主要指标；有数值列时逐行念「对象 + 指标 + 数值」，
 *   并补一句比较结论（更低/更高/更优）。
 * - 没有数值列时退化为「列举对象 + 指标」的摘要句，绝不逐格朗读。
 * - 表头括号里的单位（延迟（毫秒））会被抽出来，补到裸数字后面（500 → 500 毫秒）。
 * - 行数超过 `maxRows` 时只念前若干行并报告剩余行数，避免长表格变成念经。
 *
 * @param {string} raw 原始 Markdown 表格
 * @param {object} [options]
 * @param {number} [options.maxRows=5] 最多逐行朗读的数据行数
 * @param {string} [options.tableTitle] 表格标题（若上游已知）
 * @param {string} [options.comparisonWord] 比较词，默认「比较」
 * @returns {string} 可直接送 TTS 的中文句子
 */
export function summarizeTable(raw, options = {}) {
  const opts = options && typeof options === 'object' ? options : {}
  const maxRows = Number.isFinite(opts.maxRows) && opts.maxRows > 0 ? Math.floor(opts.maxRows) : DEFAULT_TABLE_MAX_ROWS
  const comparisonWord = typeof opts.comparisonWord === 'string' && opts.comparisonWord ? opts.comparisonWord : '比较'
  const { headers, rows } = parseTable(raw)
  if (!rows.length) return ''

  const rowCount = rows.length
  const itemHeaders = headers.map((header) => cleanHeader(header))
  const metricCols = []
  for (let c = 1; c < headers.length; c += 1) {
    if (itemHeaders[c]) metricCols.push({ index: c, label: itemHeaders[c], ...splitHeaderUnit(headers[c]) })
  }

  // 标签列：第一列；若表头里已有对象名（模型），把它补进标签（A → 模型 A）避免出现光秃秃的字母
  const itemHeader = itemHeaders[0]
  const labelOf = (row) => {
    const index = rows.indexOf(row)
    const base = normalizeForSpeech(row[0]) || `第 ${index + 1} 项`
    if (!itemHeader) return base
    return base.startsWith(itemHeader) ? base : `${itemHeader} ${base}`
  }

  // 数值列判定
  const numericCols = []
  for (const col of metricCols) {
    const values = rows.map((row) => formatValue(row[col.index], col.unit))
    if (values.length && values.every((v) => v.numeric !== null)) {
      numericCols.push({ ...col, values })
    }
  }
  const metric = numericCols[0] || metricCols[metricCols.length - 1] || null
  const metricPhrase = metric ? metric.label : ''
  const metricUnit = metric ? metric.unit : ''

  // 数量词：两个模型 / 三项
  const measureWord = /模型|方式|方案|算法|框架|工具|库|服务|接口|语言/.test(itemHeader) ? '个' : '项'
  const hasComparison = new RegExp(comparisonWord).test(str(raw)) || rowCount >= 2

  // 标题句：优先用调用方给的表格标题，否则按「比较了 N 个 X 的 Y」规则生成
  let headline = typeof opts.tableTitle === 'string' ? squash(opts.tableTitle) : ''
  if (!headline) {
    if (metricPhrase) {
      if (itemHeader) {
        headline = hasComparison
          ? `这里${comparisonWord}了${numToCn(rowCount)}${measureWord}${itemHeader}的${metricPhrase}`
          : `这里列出了${numToCn(rowCount)}${measureWord}${itemHeader}的${metricPhrase}`
      } else {
        headline = `这里列出了${numToCn(rowCount)}行${metricPhrase}数据`
      }
    } else if (itemHeader) {
      headline = `这里列出了${numToCn(rowCount)}${measureWord}${itemHeader}`
    } else {
      headline = `这里有一张${numToCn(rowCount)}行${numToCn(Math.max(headers.length, 1))}列的表格`
    }
  }

  const parts = [endSentence(headline)]
  const shown = rows.slice(0, maxRows)
  const isNumericMetric = Boolean(metric && numericCols.some((col) => col.index === metric.index))

  if (isNumericMetric) {
    // 数值指标：逐行「对象 指标 大约 数值」
    for (const row of shown) {
      const value = formatValue(row[metric.index], metricUnit)
      const approx = value.isApprox ? '大约 ' : ''
      const pieces = [labelOf(row)]
      if (metricPhrase) pieces.push(metricPhrase)
      if (approx) pieces.push(approx.trim())
      pieces.push(value.text || '无数据')
      parts.push(`${pieces.join(' ')}`)
    }
    if (rowCount > shown.length) parts.push(`另外还有 ${rowCount - shown.length} 行`)
    // 比较结论
    const numeric = metric.values
    if (rowCount >= 2 && numeric.length === rowCount) {
      let best = 0
      for (let k = 1; k < numeric.length; k += 1) {
        if (numeric[k].numeric < numeric[best].numeric) best = k
      }
      const tail = metricPhrase ? `的${metricPhrase}` : ''
      parts.push(`其中${labelOf(rows[best])}${tail}更低`)
    }
  } else {
    // 文本指标：列举对象，避免逐格朗读
    const labels = shown.map((row) => labelOf(row))
    const rest = rowCount > shown.length ? `等 ${rowCount} 项` : ''
    const metricTail = metricPhrase ? `的${metricPhrase}` : ''
    parts.push(`${labels.join('、')}${rest}${metricTail}`)
    if (rowCount === 1 && metric) {
      const value = formatValue(rows[0][metric.index], metricUnit)
      if (value.text) parts.push(`${metricPhrase || '该项'}是 ${value.text}`)
    }
  }

  return polishSpeech(parts)
}

/** 数字转中文（0~99，超出原样返回），让「2 个模型」听起来更自然。 */
function numToCn(n) {
  const digits = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九']
  if (!Number.isFinite(n) || n < 0 || n > 99) return String(n)
  if (n === 2) return '两'
  if (n < 10) return digits[n]
  if (n === 10) return '十'
  const tens = Math.floor(n / 10)
  const ones = n % 10
  const tensText = tens === 1 ? '十' : `${digits[tens]}十`
  return ones === 0 ? tensText : `${tensText}${digits[ones]}`
}

/** 拼接句子：统一补句号、清理多余空格、避免出现竖线。 */
function polishSpeech(parts) {
  return parts
    .map((part) => squash(part))
    .filter(Boolean)
    .map((part) => (/[。！？!?…]$/.test(part) ? part : `${part}。`))
    .join('')
    .replace(/\s*([，。！？、；：])\s*/g, '$1')
    // 拉丁标签与中文之间补空格：模型 B的延迟 → 模型 B 的延迟
    .replace(/([A-Za-z0-9])(?=[\u4e00-\u9fa5])/g, '$1 ')
}

// ---------------------------------------------------------------------------
// 列表摘要
// ---------------------------------------------------------------------------

/**
 * 用规则把长列表压成摘要句。
 * @param {string} raw 列表原文
 * @param {object} [options] { maxItems }
 */
export function summarizeList(raw, options = {}) {
  const opts = options && typeof options === 'object' ? options : {}
  const maxItems = Number.isFinite(opts.maxItems) && opts.maxItems > 0 ? Math.floor(opts.maxItems) : DEFAULT_LIST_MAX_ITEMS
  const items = listItems(raw)
  if (!items.length) return ''
  const shown = items.slice(0, maxItems)
  const tail = items.length > shown.length ? `等 ${items.length} 项` : ''
  return polishSpeech([`这里列出了 ${items.length} 项内容`, `${shown.join('、')}${tail}`])
}

/** 抽取列表项文本。 */
export function listItems(raw) {
  return str(raw)
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => normalizeForSpeech(stripListMarker(line)))
    .filter(Boolean)
}

// ---------------------------------------------------------------------------
// 渲染
// ---------------------------------------------------------------------------

/** 渲染结果的空形状。 */
function emptyResult() {
  return { segments: [], skipped: [], speech: '' }
}

/**
 * 把块列表渲染成可朗读段。
 * @param {Array<{kind: string, raw: string, text?: string}>} blocks
 * @param {object} policy
 * @param {object} options
 * @param {object} [options.summaries] 预生成的摘要：{ [块索引或 kind]: string }
 */
function renderBlocks(blocks, policy, options = {}, summaries = new Map()) {
  const opts = options && typeof options === 'object' ? options : {}
  const segments = []
  const skipped = []
  const speechParts = []
  const listThreshold =
    Number.isFinite(opts.listSummaryThreshold) && opts.listSummaryThreshold > 0
      ? Math.floor(opts.listSummaryThreshold)
      : DEFAULT_LIST_SUMMARY_THRESHOLD

  const push = (kind, text, source = 'block') => {
    const value = squash(text)
    if (!value) return
    segments.push({ kind, text: value, source })
    speechParts.push(value)
  }

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index]
    const kind = block.kind
    const raw = str(block.raw)
    const strategy = policyFor(kind, policy)
    const summary = summaries.get(index) ?? summaries.get(kind)

    switch (strategy) {
      case 'skip': {
        if (kind === 'code_block' && opts.codeHint !== false) {
          push('code_block', opts.codeHintText || '这里包含一段代码示例，请查看页面内容。', 'hint')
        }
        skipped.push({ kind, reason: kind === 'code_block' ? 'policy:skip:code' : 'policy:skip' })
        break
      }
      case 'label_only': {
        const label = labelForBlock(kind, raw)
        if (label) push(kind, label)
        else skipped.push({ kind, reason: 'policy:label_only:empty' })
        break
      }
      case 'summarize': {
        const text = summary || defaultSummary(kind, raw, { ...opts, listSummaryThreshold: listThreshold })
        if (text) push(kind, text)
        else skipped.push({ kind, reason: 'policy:summarize:empty' })
        break
      }
      case 'smart': {
        const decided = smartDecision(kind, raw, opts, listThreshold)
        if (!decided) {
          skipped.push({ kind, reason: 'policy:smart:not-speech-friendly' })
          break
        }
        const text = summary || defaultSummary(kind, raw, { ...opts, listSummaryThreshold: listThreshold })
        if (text) push(kind, text)
        else skipped.push({ kind, reason: 'policy:smart:empty' })
        break
      }
      case 'read':
      default: {
        const text = readableText(kind, raw, block.text)
        if (text) push(kind, text)
        else skipped.push({ kind, reason: 'policy:read:empty' })
        break
      }
    }
  }

  const speech = polishSpeech(speechParts)
  return { segments, skipped, speech }
}

/** `smart` 判定：值得朗读返回 true。 */
function smartDecision(kind, raw, opts, listThreshold) {
  if (!READABLE_KINDS.has(kind)) return false
  if (kind === 'list') {
    const items = listItems(raw)
    if (items.length === 0) return false
    if (items.length > listThreshold) return true // 长列表 → 摘要
    return items.join('').length >= 2
  }
  if (kind === 'table') return true
  if (kind === 'inline_code') {
    const code = normalizeForSpeech(raw).replace(/^`|`$/g, '')
    return /[\u4e00-\u9fa5]/.test(code) && code.length >= 2
  }
  return Boolean(normalizeForSpeech(raw))
}

/** 默认摘要生成（规则版）。 */
function defaultSummary(kind, raw, opts) {
  switch (kind) {
    case 'table':
      return summarizeTable(raw, opts)
    case 'list': {
      // 短列表：逐条朗读；超长列表（smart 阈值）才压成摘要句
      const items = listItems(raw)
      const threshold =
        Number.isFinite(opts.listSummaryThreshold) && opts.listSummaryThreshold > 0
          ? Math.floor(opts.listSummaryThreshold)
          : DEFAULT_LIST_SUMMARY_THRESHOLD
      if (items.length <= threshold) return items.join('，')
      return summarizeList(raw, { maxItems: opts.listMaxItems })
    }
    case 'paragraph':
    case 'blockquote':
    case 'heading':
      return normalizeForSpeech(raw)
    default:
      return ''
  }
}

/** `read` 策略下的文本提取。 */
function readableText(kind, raw, precomputed) {
  if (kind === 'table') return summarizeTable(raw)
  if (kind === 'image') return ''
  if (kind === 'url') return labelForBlock(kind, raw)
  // 代码/图/公式/日志默认 skip；若用户显式改成 read，则剥掉标记后原样朗读（可能很吵，属于用户自担）
  if (kind === 'code_block' || kind === 'mermaid' || kind === 'math_block') return stripFence(raw)
  if (kind === 'tool_log') return normalizeForSpeech(raw)
  if (kind === 'list') return listItems(raw).join('，')
  if (kind === 'blockquote') {
    return squash(
      str(raw)
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => stripQuoteMarker(line))
        .join(' '),
    )
  }
  if (kind === 'inline_code') return normalizeForSpeech(raw).replace(/^`|`$/g, '')
  // 段落类文本补句号：TTS 对没有终止标点的长句更容易读飞
  if (kind === 'paragraph') return endSentence(precomputed || normalizeForSpeech(raw))
  if (typeof precomputed === 'string' && precomputed) return precomputed
  return normalizeForSpeech(raw)
}

/** 去掉围栏/公式标记，得到内部文本（供把 code_block 显式配成 read 的场景）。 */
function stripFence(raw) {
  const text = str(raw).trim()
  const fence = text.match(/^(?:`{3,}|~{3,})[^\n]*\n([\s\S]*?)\n?(?:`{3,}|~{3,})\s*$/)
  if (fence) return squash(fence[1])
  const math = text.match(/^\$\$([\s\S]*?)\$\$$/)
  if (math) return squash(math[1])
  return normalizeForSpeech(text.replace(/^(?:`{3,}|~{3,})/, '').replace(/(?:`{3,}|~{3,})$/, ''))
}

/** `label_only` 策略下取「标签」：URL 只念链接文字/域名，图片念 alt。 */function labelForBlock(kind, raw) {
  const text = str(raw)
  if (kind === 'url') {
    const md = text.match(/\[([^\]]+)\]\(\s*[^)\s]+/)
    if (md && squash(md[1])) return normalizeForSpeech(md[1])
    const parts = text.match(/(?:https?|ftp|wss?):\/\/([^\s/?#]+)\/?([^\s?#]*)/)
    if (!parts) return '这里有一个链接'
    const host = parts[1]
    const path = stripUrlTail(parts[2] || '').replace(/[/#]/g, ' ').trim()
    const label = [host, path].filter(Boolean).join(' ')
    return label ? `链接 ${label}` : '这里有一个链接'
  }
  if (kind === 'image') {
    const alt = text.match(/!\[([^\]]*)\]/)
    return alt && squash(alt[1]) ? `图片 ${squash(alt[1])}` : ''
  }
  return normalizeForSpeech(text)
}

/**
 * 同步渲染 Markdown → 可朗读内容。
 *
 * @param {string} markdown
 * @param {object} [policy] 覆盖默认策略，例如 `{ code_block: 'read' }`
 * @param {object} [options]
 * @param {boolean} [options.codeHint=true] 代码块 skip 时是否补一条提示
 * @param {string} [options.codeHintText] 自定义代码提示文案
 * @param {number} [options.listSummaryThreshold=8] 超过该条目数的列表按摘要处理
 * @returns {{ segments: Array<{kind: string, text: string, source: 'block'|'hint'}>, skipped: Array<{kind: string, reason: string}>, speech: string }}
 */
export function renderSpeech(markdown, policy = {}, options = {}) {
  const blocks = parseBlocks(markdown)
  if (!blocks.length) return emptyResult()
  return renderBlocks(blocks, policy, options)
}

/**
 * 异步渲染：对 `summarize` / `smart` 的块优先调用 `options.summarizeBlock(kind, raw)`。
 *
 * - 摘要函数返回 `null` / 空串 / 抛错 / 超时（由调用方自行 signal 控制）时，一律回落到同步规则。
 * - `skip` / `read` / `label_only` 策略不会触发 LLM 摘要，避免无意义开销。
 *
 * @param {string} markdown
 * @param {object} [policy]
 * @param {object} [options] 额外支持 `summarizeBlock(kind, raw) -> Promise<string|null>`
 */
export async function renderSpeechAsync(markdown, policy = {}, options = {}) {
  const opts = options && typeof options === 'object' ? options : {}
  const blocks = parseBlocks(markdown)
  if (!blocks.length) return emptyResult()

  const summaries = new Map()
  if (typeof opts.summarizeBlock === 'function') {
    for (let index = 0; index < blocks.length; index += 1) {
      const block = blocks[index]
      const strategy = policyFor(block.kind, policy)
      if (strategy !== 'summarize' && strategy !== 'smart') continue
      try {
        const result = await opts.summarizeBlock(block.kind, block.raw)
        const text = squash(result)
        if (text) summaries.set(index, text)
      } catch {
        // 摘要失败不是错误：静默回落到同步规则
      }
    }
  }

  return renderBlocks(blocks, policy, opts, summaries)
}

/** 供 buffer 复用的内部工具（不进入公开契约，但保持稳定）。 */
export const __internals = Object.freeze({
  squash,
  normalizeForSpeech,
  isIncompleteMarker,
  endsWithSentence,
  policyFor,
  stripListMarker,
  stripQuoteMarker,
  spaceUnits,
  endSentence,
  numToCn,
  isTableSeparator,
  splitTableRow,
  SENTENCE_END_CHARS,
  SOFT_BREAK_RE,
  DEFAULT_LIST_SUMMARY_THRESHOLD,
  DEFAULT_LIST_MAX_ITEMS,
  DEFAULT_TABLE_MAX_ROWS,
})
