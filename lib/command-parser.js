// 语音指令解析（需求 §5）。
//
// 红线：不能做子串包含匹配 ——
//   「发送」          → 命令
//   「这个请求发送以后需要等待服务器响应」 → 普通正文
// 第一阶段策略：一个 Utterance 归一化后必须**整体等于**指令词才算命令；
// 唤醒模式下还必须带前缀（「DSH，发送」/「dsh send」）。
// 后续阶段可以在这里替换成 Command Classifier，调用方无需改动。

export const DEFAULT_COMMANDS = {
  send: ['发送', '提交', '发送消息', 'send', 'submit'],
  undo: ['撤销', '重说', '撤回', 'undo'],
  clear: ['清空', '清除', 'clear'],
  cancel: ['取消', 'cancel'],
  polish: ['润色', '整理一下', 'polish'],
  stop_listening: ['停止录音', '停止监听', '结束监听', 'stop listening'],
  pause: ['暂停', 'pause'],
  resume: ['继续听', '继续', 'resume'],
  read: ['朗读', '读一下', 'read'],
  stop_reading: ['停止朗读', '别读了', 'stop reading'],
}

/** 动作名顺序即 UI/文档中的展示顺序。 */
export const COMMAND_ACTIONS = Object.keys(DEFAULT_COMMANDS)

const FULL_WIDTH_START = 0xff01
const FULL_WIDTH_END = 0xff5e
const FULL_WIDTH_OFFSET = 0xfee0

/**
 * 归一化：全角转半角、小写、去掉首尾空白与尾部标点、压缩内部空白。
 * 注意内部标点保留，否则「这个请求发送以后」会被误拼成一个词。
 */
export function normalizeCommandText(text) {
  let out = String(text == null ? '' : text)
  out = out.replace(/[\uff01-\uff5e]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - FULL_WIDTH_OFFSET))
  out = out.replace(/\u3000/g, ' ')
  out = out.toLowerCase().trim()
  out = out.replace(/[，。！？,.!?；;：:\s]+$/g, '')
  out = out.replace(/\s+/g, ' ')
  return out.trim()
}

function buildTable(commands) {
  const table = new Map()
  for (const [action, phrases] of Object.entries(commands || {})) {
    for (const phrase of Array.isArray(phrases) ? phrases : []) {
      const key = normalizeCommandText(phrase)
      if (key) table.set(key, action)
    }
  }
  return table
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * @param {object} [options]
 * @param {Record<string, string[]>} [options.commands] 覆盖默认指令表
 * @param {'exact'|'wake'|'off'} [options.mode] 指令模式
 * @param {string} [options.wakePrefix] 唤醒前缀，例如 DSH
 * @param {string[]} [options.wakeWords] 额外唤醒词，例如 小D
 */
export function createCommandParser(options = {}) {
  const commands = options.commands && typeof options.commands === 'object'
    ? options.commands
    : DEFAULT_COMMANDS
  const table = buildTable(commands)
  const mode = options.mode === 'wake' || options.mode === 'off' ? options.mode : 'exact'
  const wakeWords = [options.wakePrefix, ...(Array.isArray(options.wakeWords) ? options.wakeWords : [])]
    .map((word) => normalizeCommandText(word))
    .filter(Boolean)
  const wakePattern = wakeWords.length
    ? new RegExp('^(?:' + wakeWords.map(escapeRegExp).join('|') + ')\\s*[,、:：]?\\s*')
    : null

  /**
   * @param {string} text 一个 Utterance 的识别结果
   * @returns {{command: string, phrase: string, mode: 'exact'|'wake', rest: string}|null}
   */
  function parse(text) {
    if (mode === 'off') return null
    const clean = normalizeCommandText(text)
    if (!clean) return null

    // exact 模式：整句等于指令词。wake 模式不认裸指令词，必须带前缀。
    if (mode === 'exact') {
      const direct = table.get(clean)
      return direct ? { command: direct, phrase: clean, mode: 'exact', rest: '' } : null
    }

    if (!wakePattern) return null
    const stripped = clean.replace(wakePattern, '')
    if (stripped === clean) return null
    const command = table.get(stripped)
    if (!command) return null
    return { command, phrase: stripped, mode: 'wake', rest: '' }
  }

  return {
    parse,
    mode,
    wakeWords,
    commands,
    /** 当前指令表（归一化后的短语 → 动作），设置页展示用。 */
    table: () => Object.fromEntries(table),
  }
}
