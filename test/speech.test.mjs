/**
 * speech 模块单测：Speech Renderer / Speech Buffer / Speech Queue。
 *
 * 只依赖 node:test + node:assert/strict 与被测的本地模块，完全离线。
 * 断言全部针对真实行为（具体文本、具体状态迁移），不使用恒真断言。
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  BLOCK_KINDS,
  DEFAULT_RENDERER_POLICY,
  parseBlocks,
  classifyBlock,
  summarizeTable,
  renderSpeech,
  renderSpeechAsync,
} from '../lib/speech/renderer.js'
import { createSpeechBuffer } from '../lib/speech/buffer.js'
import { createSpeechQueue } from '../lib/speech/queue.js'

/** 把 push 序列产出的段拼起来，便于整体断言。 */
function collect(buffer, deltas) {
  const out = []
  for (const delta of deltas) out.push(...buffer.push(delta))
  return out
}

const segText = (segments) => segments.map((s) => s.text).join('')

// ---------------------------------------------------------------------------
// Speech Renderer —— 常量与块解析
// ---------------------------------------------------------------------------

test('BLOCK_KINDS 覆盖契约要求的全部块类型', () => {
  assert.deepEqual(BLOCK_KINDS, [
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
  ])
})

test('DEFAULT_RENDERER_POLICY 与需求 §12.2 的策略表一致', () => {
  assert.equal(DEFAULT_RENDERER_POLICY.paragraph, 'read')
  assert.equal(DEFAULT_RENDERER_POLICY.heading, 'read')
  assert.equal(DEFAULT_RENDERER_POLICY.list, 'smart')
  assert.equal(DEFAULT_RENDERER_POLICY.table, 'summarize')
  assert.equal(DEFAULT_RENDERER_POLICY.code_block, 'skip')
  assert.equal(DEFAULT_RENDERER_POLICY.inline_code, 'smart')
  assert.equal(DEFAULT_RENDERER_POLICY.mermaid, 'skip')
  assert.equal(DEFAULT_RENDERER_POLICY.ascii_diagram, 'skip')
  assert.equal(DEFAULT_RENDERER_POLICY.url, 'label_only')
  assert.equal(DEFAULT_RENDERER_POLICY.image, 'skip')
  assert.equal(DEFAULT_RENDERER_POLICY.math_block, 'skip')
  assert.equal(DEFAULT_RENDERER_POLICY.tool_log, 'skip')
})

test('classifyBlock 识别各类型块', () => {
  assert.equal(classifyBlock('普通的一段话。'), 'paragraph')
  assert.equal(classifyBlock('## 小节标题'), 'heading')
  assert.equal(classifyBlock('- 甲\n- 乙\n- 丙'), 'list')
  assert.equal(classifyBlock('| 模型 | 延迟 |\n| --- | --- |\n| A | 500 ms |'), 'table')
  assert.equal(classifyBlock('```python\ndef start():\n    ...\n```'), 'code_block')
  assert.equal(classifyBlock('```mermaid\ngraph TD; A-->B;\n```'), 'mermaid')
  assert.equal(classifyBlock('`npm test`'), 'inline_code')
  assert.equal(classifyBlock('https://example.com/docs'), 'url')
  assert.equal(classifyBlock('![架构图](https://example.com/a.png)'), 'image')
  assert.equal(classifyBlock('$$\nE = mc^2\n$$'), 'math_block')
  assert.equal(classifyBlock('2026-01-01 10:00:00 ERROR failed to connect'), 'tool_log')
  assert.equal(classifyBlock('┌────┐\n│ A  │\n└────┘'), 'ascii_diagram')
  assert.equal(classifyBlock('> 引用一行\n> 引用两行'), 'blockquote')
})

test('parseBlocks 把混合 Markdown 切成带 kind/raw/text 的块', () => {
  const markdown = [
    '# 标题',
    '',
    '第一段话。',
    '',
    '- 甲',
    '- 乙',
    '',
    '| 模型 | 延迟 |',
    '| --- | --- |',
    '| A | 500 ms |',
    '| B | 200 ms |',
    '',
    '```js',
    'const a = 1',
    '```',
    '',
    '> 引用内容',
    '',
    '结尾段落。',
  ].join('\n')

  const blocks = parseBlocks(markdown)
  assert.deepEqual(
    blocks.map((b) => b.kind),
    ['heading', 'paragraph', 'list', 'table', 'code_block', 'blockquote', 'paragraph'],
  )
  for (const block of blocks) {
    assert.equal(typeof block.raw, 'string')
    assert.equal(typeof block.text, 'string')
    assert.ok(block.raw.length > 0)
  }
  assert.equal(blocks[0].text, '标题')
  assert.equal(blocks[2].text, '甲，乙')
  assert.ok(blocks[3].text.includes('毫秒'))
  assert.equal(blocks[4].text, '')
})

test('parseBlocks 识别行内代码、URL、图片、公式与 ASCII 图', () => {
  const blocks = parseBlocks(
    [
      '`npm test`',
      '',
      'https://example.com/docs',
      '',
      '![架构图](https://example.com/a.png)',
      '',
      '$$',
      'E = mc^2',
      '$$',
      '',
      '┌────┐',
      '│ A  │',
      '└────┘',
    ].join('\n'),
  )
  assert.deepEqual(
    blocks.map((b) => b.kind),
    ['inline_code', 'url', 'image', 'math_block', 'ascii_diagram'],
  )
})

test('parseBlocks 对空输入返回空数组', () => {
  assert.deepEqual(parseBlocks(''), [])
  assert.deepEqual(parseBlocks('   \n\n  '), [])
})

// ---------------------------------------------------------------------------
// Speech Renderer —— 表格摘要
// ---------------------------------------------------------------------------

test('summarizeTable 产出自然中文句子，且不含竖线或逐格内容', () => {
  const raw = ['| 模型 | 延迟 |', '| --- | --- |', '| A | 500 ms |', '| B | 200 ms |'].join('\n')
  const speech = summarizeTable(raw)

  assert.equal(speech, '这里比较了两个模型的延迟。模型 A 延迟 大约 500 毫秒。模型 B 延迟 大约 200 毫秒。其中模型 B 的延迟更低。')
  // 不出现竖线，也不出现「表头，竖线，表头」式的逐格朗读
  assert.ok(!speech.includes('|'), '摘要不得包含竖线')
  assert.ok(!speech.includes('竖线'), '摘要不得出现「竖线」字样')
  assert.ok(!/模型[，,]\s*延迟/.test(speech), '不得逐格朗读表头')
  // 单位被口语化
  assert.ok(speech.includes('500 毫秒'))
  assert.ok(!speech.includes('500 ms'))
  // 结论句存在
  assert.ok(speech.includes('模型 B'))
  assert.ok(speech.endsWith('。'))
})

test('summarizeTable 尊重 maxRows，并报告剩余行数', () => {
  const raw = [
    '| 服务 | 耗时（毫秒） |',
    '| --- | --- |',
    '| A | 10 |',
    '| B | 20 |',
    '| C | 30 |',
    '| D | 40 |',
  ].join('\n')
  const speech = summarizeTable(raw, { maxRows: 2 })
  assert.ok(speech.includes('服务'))
  assert.ok(speech.includes('耗时'))
  assert.ok(speech.includes('A 耗时 大约 10 毫秒'))
  assert.ok(speech.includes('B 耗时 大约 20 毫秒'))
  assert.ok(!speech.includes('C 耗时'), '超出 maxRows 的行不应逐行朗读')
  assert.ok(speech.includes('另外还有 2 行'))
})

test('summarizeTable 对无表头的两列表格仍能产出摘要而非逐格朗读', () => {
  const speech = summarizeTable(['| 甲 | 10 |', '| 乙 | 20 |'].join('\n'))
  assert.ok(speech.length > 0)
  assert.ok(!speech.includes('|'))
  assert.ok(speech.includes('甲'))
  assert.ok(speech.includes('乙'))
})

test('summarizeTable 对空表格返回空串', () => {
  assert.equal(summarizeTable(''), '')
  assert.equal(summarizeTable('| 只有表头 |'), '')
})

test('summarizeTable 支持 tableTitle 与自定义比较词', () => {
  const raw = ['| 模型 | 延迟 |', '| --- | --- |', '| A | 500 ms |', '| B | 200 ms |'].join('\n')
  const speech = summarizeTable(raw, { tableTitle: '延迟对比', comparisonWord: '对比' })
  assert.ok(speech.startsWith('延迟对比。'))
  assert.ok(speech.includes('模型 A 延迟 大约 500 毫秒'))
  assert.ok(speech.includes('其中模型 B 的延迟更低'))
  assert.ok(!speech.includes('|'))
})

// ---------------------------------------------------------------------------
// Speech Renderer —— 策略行为
// ---------------------------------------------------------------------------

test('默认策略下代码块被 skip 并补一条 codeHint 提示', () => {
  const markdown = ['说明文字。', '', '```python', 'def start():', '    ...', '```'].join('\n')
  const result = renderSpeech(markdown)

  const hint = result.segments.find((s) => s.source === 'hint')
  assert.ok(hint, '应存在 hint 段')
  assert.equal(hint.kind, 'code_block')
  assert.equal(hint.text, '这里包含一段代码示例，请查看页面内容。')

  assert.ok(!result.speech.includes('def start'), '不得朗读代码内容')
  assert.ok(!result.speech.includes('python'))
  assert.ok(result.speech.includes('说明文字。'))
  assert.ok(result.speech.includes('这里包含一段代码示例，请查看页面内容。'))
  assert.deepEqual(result.skipped, [{ kind: 'code_block', reason: 'policy:skip:code' }])
})

test('codeHint: false 时不再插入代码提示', () => {
  const markdown = ['```js', 'const a = 1', '```'].join('\n')
  const result = renderSpeech(markdown, {}, { codeHint: false })
  assert.deepEqual(result.segments, [])
  assert.equal(result.speech, '')
  assert.deepEqual(result.skipped, [{ kind: 'code_block', reason: 'policy:skip:code' }])
})

test('自定义 codeHintText 生效', () => {
  const result = renderSpeech('```js\nconst a = 1\n```', {}, { codeHintText: '这里有一段代码。' })
  assert.equal(result.segments.length, 1)
  assert.equal(result.segments[0].text, '这里有一段代码。')
  assert.equal(result.segments[0].source, 'hint')
})

test('mermaid 与 ascii 图默认被跳过且不产生提示', () => {
  const markdown = [
    '```mermaid',
    'graph TD; A-->B;',
    '```',
    '',
    '┌────┐',
    '│ A  │',
    '└────┘',
  ].join('\n')
  const result = renderSpeech(markdown)
  assert.deepEqual(result.segments, [])
  assert.equal(result.speech, '')
  assert.deepEqual(result.skipped.map((s) => s.kind).sort(), ['ascii_diagram', 'mermaid'])
})

test('url 默认 label_only：只读链接文字/域名，不念 URL', () => {
  const bare = renderSpeech('https://example.com/some/deep/path?q=1')
  assert.equal(bare.segments.length, 1)
  assert.equal(bare.segments[0].kind, 'url')
  assert.ok(bare.segments[0].text.includes('example.com'))
  assert.ok(!bare.segments[0].text.includes('https://'))
  assert.ok(!bare.speech.includes('http'))

  const link = renderSpeech('[DSH 文档](https://example.com/docs)')
  assert.equal(link.segments.length, 1)
  assert.equal(link.segments[0].kind, 'url')
  assert.equal(link.segments[0].text, 'DSH 文档')
  assert.ok(!link.speech.includes('example.com'))
})

test('段落里的 Markdown 链接只读链接文字，裸 URL 被剥离', () => {
  const result = renderSpeech('参见 [官方文档](https://example.com/docs) 与 https://example.com/raw 获取详情。')
  assert.equal(result.segments.length, 1)
  assert.ok(result.speech.includes('官方文档'))
  assert.ok(result.speech.includes('获取详情'))
  assert.ok(!result.speech.includes('http'))
  assert.ok(!result.speech.includes(']('))
})

test('inline_code 在 smart 策略下朗读中文标识，跳过纯符号', () => {
  const readable = renderSpeech('请运行 `npm run build` 完成构建。')
  assert.ok(readable.speech.includes('npm run build'))

  const result = renderSpeech('用 `dsh-chatty` 插件。')
  assert.ok(result.segments.length >= 1)
  assert.ok(result.speech.includes('dsh-chatty'))
})

test('图片默认 skip，label_only 时只读 alt 文字', () => {
  const skipped = renderSpeech('![架构示意图](https://example.com/a.png)')
  assert.deepEqual(skipped.segments, [])
  assert.deepEqual(skipped.skipped, [{ kind: 'image', reason: 'policy:skip' }])

  const labeled = renderSpeech('![架构示意图](https://example.com/a.png)', { image: 'label_only' })
  assert.equal(labeled.segments.length, 1)
  assert.equal(labeled.segments[0].text, '图片 架构示意图')
})

test('math_block 与 tool_log 默认跳过', () => {
  const math = renderSpeech('$$\nE = mc^2\n$$')
  assert.deepEqual(math.segments, [])
  assert.deepEqual(math.skipped, [{ kind: 'math_block', reason: 'policy:skip' }])

  // 单行公式同样被识别为 math_block
  const inline = renderSpeech('$$ E = mc^2 $$')
  assert.deepEqual(inline.segments, [])
  assert.deepEqual(inline.skipped, [{ kind: 'math_block', reason: 'policy:skip' }])

  const log = renderSpeech('2026-01-01 10:00:00 ERROR failed to connect to upstream')
  assert.deepEqual(log.segments, [])
  assert.deepEqual(log.skipped, [{ kind: 'tool_log', reason: 'policy:skip' }])
})

test('heading / blockquote / 短列表按策略朗读', () => {
  const result = renderSpeech(['## 快速开始', '', '> 先安装依赖。', '', '- 第一步', '- 第二步'].join('\n'))
  assert.deepEqual(result.segments.map((s) => s.kind), ['heading', 'blockquote', 'list'])
  assert.ok(result.speech.includes('快速开始'))
  assert.ok(result.speech.includes('先安装依赖。'))
  assert.ok(result.speech.includes('第一步'))
  assert.ok(result.speech.includes('第二步'))
  assert.equal(result.skipped.length, 0)
})

test('超长列表在 smart 策略下摘要，短列表正常朗读', () => {
  const longList = Array.from({ length: 12 }, (_, i) => `- 第 ${i + 1} 项内容`).join('\n')
  const summarized = renderSpeech(longList)
  assert.equal(summarized.segments.length, 1)
  assert.equal(summarized.segments[0].kind, 'list')
  assert.ok(summarized.speech.includes('这里列出了 12 项内容'))
  assert.ok(summarized.speech.includes('等 12 项'))
  assert.ok(!summarized.speech.includes('第 12 项内容'), '超长列表不应逐条朗读全部条目')

  const shortList = ['- 甲', '- 乙', '- 丙'].join('\n')
  const read = renderSpeech(shortList)
  assert.equal(read.segments.length, 1)
  assert.equal(read.speech, '甲，乙，丙。')
})

test('policy 覆盖可让表格按 read 朗读（仍然不逐格）', () => {
  const markdown = ['| 模型 | 延迟 |', '| --- | --- |', '| A | 500 ms |', '| B | 200 ms |'].join('\n')
  const result = renderSpeech(markdown, { table: 'read' })
  assert.equal(result.segments.length, 1)
  assert.ok(!result.speech.includes('|'))
  assert.ok(result.speech.includes('毫秒'))
})

test('未知策略值回落到默认策略，不抛错', () => {
  const result = renderSpeech('一段话。', { paragraph: 'no-such-policy' })
  assert.equal(result.segments.length, 1)
  assert.equal(result.speech, '一段话。')
})

test('renderSpeech 的返回形状固定为 { segments, skipped, speech }', () => {
  const result = renderSpeech('普通段落。')
  assert.deepEqual(Object.keys(result).sort(), ['segments', 'skipped', 'speech'])
  assert.equal(result.segments.length, 1)
  assert.deepEqual(Object.keys(result.segments[0]).sort(), ['kind', 'source', 'text'])
  assert.equal(result.segments[0].source, 'block')
})

// ---------------------------------------------------------------------------
// Speech Renderer —— 异步摘要
// ---------------------------------------------------------------------------

test('renderSpeechAsync 优先使用注入的 summarizeBlock', async () => {
  const markdown = ['| 模型 | 延迟 |', '| --- | --- |', '| A | 500 ms |', '| B | 200 ms |'].join('\n')
  const calls = []
  const result = await renderSpeechAsync(markdown, {}, {
    summarizeBlock: async (kind, raw) => {
      calls.push({ kind, raw })
      return '这是一张延迟对比表。'
    },
  })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].kind, 'table')
  assert.ok(calls[0].raw.includes('500 ms'))
  assert.equal(result.segments.length, 1)
  assert.equal(result.segments[0].text, '这是一张延迟对比表。')
  assert.equal(result.speech, '这是一张延迟对比表。')
})

test('renderSpeechAsync 在摘要抛错时回落到同步规则', async () => {
  const markdown = ['| 模型 | 延迟 |', '| --- | --- |', '| A | 500 ms |', '| B | 200 ms |'].join('\n')
  const result = await renderSpeechAsync(markdown, {}, {
    summarizeBlock: async () => {
      throw new Error('llm unavailable')
    },
  })
  assert.equal(result.segments.length, 1)
  assert.ok(result.speech.includes('500 毫秒'))
  assert.ok(result.speech.includes('更低'))
})

test('renderSpeechAsync 在摘要返回空值时回落同步规则', async () => {
  const markdown = ['| 模型 | 延迟 |', '| --- | --- |', '| A | 500 ms |', '| B | 200 ms |'].join('\n')
  const result = await renderSpeechAsync(markdown, {}, { summarizeBlock: async () => null })
  assert.ok(result.speech.includes('毫秒'))
})

test('renderSpeechAsync 不为 skip/read 策略调用摘要', async () => {
  const calls = []
  const result = await renderSpeechAsync('普通段落。', {}, {
    summarizeBlock: async (kind) => {
      calls.push(kind)
      return '不该被用到'
    },
  })
  assert.deepEqual(calls, [])
  assert.equal(result.speech, '普通段落。')
})

// ---------------------------------------------------------------------------
// Speech Buffer
// ---------------------------------------------------------------------------

test('buffer 在代码围栏未闭合时不吐任何内容，闭合后才吐（含 hint）', () => {
  const buffer = createSpeechBuffer()
  const emitted = collect(buffer, ['下面是一段示例：\n\n```python\ndef start():\n', '    return 1\n'])

  assert.deepEqual(emitted.map((s) => s.text), ['下面是一段示例：'])
  assert.ok(buffer.pending().includes('```python'), '未闭合的代码仍留在缓冲里')

  const rest = buffer.push('```\n')
  assert.equal(rest.length, 1)
  assert.equal(rest[0].source, 'hint')
  assert.equal(rest[0].text, '这里包含一段代码示例，请查看页面内容。')
  assert.equal(buffer.pending(), '')

  const all = [...emitted, ...rest].map((s) => s.text).join('')
  assert.ok(!all.includes('def start'), '绝不能朗读代码内容')
})

test('buffer 在表格行未结束（无空行）时不吐内容', () => {
  const buffer = createSpeechBuffer()
  const first = buffer.push('| 模型 | 延迟 |\n| --- | --- |\n| A | 500 ms |\n')
  assert.deepEqual(first, [])
  assert.ok(buffer.pending().includes('500 ms'))

  const second = buffer.push('\n')
  assert.equal(second.length, 1)
  assert.equal(second[0].kind, 'table')
  assert.ok(second[0].text.includes('500 毫秒'))
  assert.ok(!second[0].text.includes('|'))
  assert.equal(buffer.pending(), '')
})

test('buffer mode=sentence 按完整句子切分，短碎片继续攒', () => {
  const buffer = createSpeechBuffer({ mode: 'sentence', minChars: 6 })
  const first = collect(buffer, ['第一句已经写完了。第二句还', '没有结束'])
  assert.equal(segText(first), '第一句已经写完了。')
  assert.equal(buffer.pending(), '第二句还没有结束')

  const tail = buffer.flush()
  assert.equal(segText(tail), '第二句还没有结束。')
  assert.equal(buffer.pending(), '')
})

test('buffer 在 block 模式下按完整段落吐内容', () => {
  const buffer = createSpeechBuffer()
  const emitted = collect(buffer, ['第一段写完了。', '\n\n第二段也写完了。'])
  assert.deepEqual(emitted.map((s) => s.text), ['第一段写完了。', '第二段也写完了。'])
  assert.equal(buffer.pending(), '')
})

test('buffer 超过 maxBlockChars 时在逗号处强制切分', () => {
  const buffer = createSpeechBuffer({ maxBlockChars: 20 })
  const long = `${'甲'.repeat(12)}，${'乙'.repeat(12)}，${'丙'.repeat(12)}`
  const emitted = buffer.push(long)

  assert.ok(emitted.length >= 1, '超长段落必须被切分')
  const firstText = emitted[0].text
  assert.ok(firstText.length <= 20, `首段长度 ${firstText.length} 不应超过 maxBlockChars`)
  assert.ok(!firstText.endsWith('，'), '切分点不应把逗号留在段尾')
  assert.ok(buffer.pending().length > 0, '剩余内容仍在缓冲里')
})

test('buffer flush 吐出剩余内容，reset 清空', () => {
  const buffer = createSpeechBuffer()
  assert.deepEqual(buffer.push('还没结束的半句'), [])
  const flushed = buffer.flush()
  assert.equal(segText(flushed), '还没结束的半句。')
  assert.equal(buffer.pending(), '')

  buffer.push('会被丢弃的内容')
  buffer.reset()
  assert.equal(buffer.pending(), '')
  assert.deepEqual(buffer.flush(), [])
})

test('buffer flush 对未闭合的围栏代码也不朗读代码', () => {
  const buffer = createSpeechBuffer()
  buffer.push('说明。\n\n```js\nconst a = 1\n')
  const flushed = buffer.flush()
  const text = segText(flushed)
  assert.ok(!text.includes('const a = 1'))
  assert.equal(buffer.pending(), '')
})

test('buffer 复用 renderer 策略：代码块 policy=read 时可以朗读代码', () => {
  const buffer = createSpeechBuffer({ policy: { code_block: 'read' } })
  const emitted = collect(buffer, ['```js\n', 'const a = 1\n', '```\n'])
  assert.ok(emitted.some((s) => s.text.includes('const a = 1')))
  assert.ok(!emitted.some((s) => s.source === 'hint'))
})

test('buffer push 空字符串是 no-op', () => {
  const buffer = createSpeechBuffer()
  assert.deepEqual(buffer.push(''), [])
  assert.deepEqual(buffer.push(undefined), [])
  assert.equal(buffer.pending(), '')
})

test('buffer 在长表格输入过程中始终不吐半张表', () => {
  const buffer = createSpeechBuffer()
  const deltas = [
    '| 服务 | 耗时 |\n',
    '| --- | --- |\n',
    '| A | 10 ms |\n',
    '| B | 20 ms |\n',
  ]
  const emitted = []
  for (const delta of deltas) emitted.push(...buffer.push(delta))
  assert.deepEqual(emitted, [], '空行出现前不得朗读任何一行表格')

  const closed = buffer.push('\n')
  assert.equal(closed.length, 1)
  assert.equal(closed[0].kind, 'table')
  assert.ok(closed[0].text.includes('10 毫秒'))
  assert.ok(closed[0].text.includes('20 毫秒'))
  assert.ok(!closed[0].text.includes('|'))
})

test('buffer 对 mermaid 与未闭合公式一律不吐内容', () => {
  const buffer = createSpeechBuffer()
  assert.deepEqual(collect(buffer, ['```mermaid\ngraph TD; A-->B;\n']), [])
  assert.deepEqual(buffer.flush(), [], '未闭合的 mermaid 在 flush 时也不朗读')
  assert.equal(buffer.pending(), '')

  buffer.reset()
  assert.deepEqual(collect(buffer, ['$$\nE = mc^2\n']), [])
  assert.deepEqual(buffer.flush(), [])
})

test('buffer 输出段携带 renderer 的 kind 与 source', () => {
  const buffer = createSpeechBuffer()
  const emitted = collect(buffer, ['普通段落。\n\n```js\nconst a = 1\n```\n'])
  assert.deepEqual(
    emitted.map((s) => [s.kind, s.source]),
    [
      ['paragraph', 'block'],
      ['code_block', 'hint'],
    ],
  )
})

test('buffer reset 之后可以继续正常使用', () => {
  const buffer = createSpeechBuffer()
  collect(buffer, ['第一段。'])
  buffer.reset()
  assert.equal(buffer.pending(), '')
  const after = collect(buffer, ['第二段。'])
  assert.deepEqual(after.map((s) => s.text), ['第二段。'])
})

test('buffer 不会把 skip 类型的半截日志行当段落念出来', () => {
  const buffer = createSpeechBuffer({ mode: 'sentence' })
  const emitted = collect(buffer, ['2026-0', '1-01 10', ':00:00 ', 'ERROR b', 'oom\n\n'])
  assert.deepEqual(emitted, [], '日志行不该产出任何可朗读段')
  assert.deepEqual(buffer.flush(), [])
})

test('buffer 对半截图片标记不产出噪音段', () => {
  const buffer = createSpeechBuffer({ mode: 'sentence' })
  assert.deepEqual(collect(buffer, ['![', '架构图](ht', 'tps://example.com/a.png)']), [])
  assert.deepEqual(buffer.flush(), [])
  assert.equal(buffer.pending(), '')
})

test('buffer 对没有空行收尾的表格在 flush 时按已有行摘要', () => {
  const buffer = createSpeechBuffer()
  assert.deepEqual(buffer.push('| 服务 | 耗时 |\n| --- | --- |\n| A | 10 ms |'), [])
  const flushed = buffer.flush()
  assert.equal(flushed.length, 1)
  assert.equal(flushed[0].kind, 'table')
  assert.ok(flushed[0].text.includes('10 毫秒'))
  assert.ok(!flushed[0].text.includes('|'))
})

// ---------------------------------------------------------------------------
// Speech Queue
// ---------------------------------------------------------------------------

test('queue push/next/peek/size/isEmpty 的基本行为', () => {
  const queue = createSpeechQueue()
  assert.equal(queue.size(), 0)
  assert.equal(queue.isEmpty(), true)
  assert.equal(queue.next(), null)
  assert.equal(queue.peek(), null)

  const a = queue.push('第一段', { sessionId: 's1', kind: 'paragraph' })
  const b = queue.push('第二段')
  assert.equal(queue.size(), 2)
  assert.equal(queue.isEmpty(), false)
  assert.equal(a.id, 'speech-1')
  assert.equal(a.seq, 1)
  assert.equal(b.id, 'speech-2')
  assert.equal(a.status, 'queued')
  assert.equal(a.kind, 'paragraph')
  assert.equal(a.meta.sessionId, 's1')

  assert.equal(queue.peek().id, a.id)
  assert.equal(queue.peek().status, 'queued', 'peek 不改变状态')

  const taken = queue.next()
  assert.equal(taken.id, a.id)
  assert.equal(taken.status, 'playing')
  assert.equal(queue.size(), 2, 'playing 仍算未完成条目')
  assert.equal(queue.peek().id, b.id)

  queue.markDone(a.id)
  assert.equal(queue.size(), 1, 'done 之后只剩 b 未完成')
  const second = queue.next()
  assert.equal(second.id, b.id)
  queue.markDone(b.id)
  assert.equal(queue.size(), 0)
  assert.equal(queue.isEmpty(), true)
  assert.equal(queue.next(), null)
})

test('queue markFailed 记录错误信息并移出未完成集合', () => {
  const queue = createSpeechQueue()
  const item = queue.push('会失败的一段')
  queue.next()
  queue.markFailed(item.id, new Error('tts 500'))
  assert.equal(queue.size(), 0)
  const [stored] = queue.items()
  assert.equal(stored.status, 'failed')
  assert.equal(stored.error, 'tts 500')
  // 已结束条目不会被再次迁移状态
  assert.equal(queue.markDone(item.id), null)
})

test('queue clear 取消未播条目并递增 generation', () => {
  const queue = createSpeechQueue()
  const playing = queue.push('正在播')
  const queuedA = queue.push('排队一')
  const queuedB = queue.push('排队二')
  assert.equal(queue.generation(), 0)

  queue.next() // playing -> 正在播
  const before = queue.generation()
  const cancelled = queue.clear()
  assert.equal(cancelled, 2)
  assert.equal(queue.generation(), before + 1)

  const byId = new Map(queue.items().map((item) => [item.id, item]))
  assert.equal(byId.get(queuedA.id).status, 'cancelled')
  assert.equal(byId.get(queuedB.id).status, 'cancelled')
  assert.equal(byId.get(playing.id).status, 'playing', 'clear 不动正在播放的条目')
  assert.equal(byId.get(queuedA.id).meta.cancelReason, 'cleared')
  assert.equal(queue.size(), 1)
})

test('queue interrupt 作废 queued 与 playing 并递增 generation', () => {
  const queue = createSpeechQueue()
  const playing = queue.push('正在播')
  const queued = queue.push('排队中')
  queue.next()

  const before = queue.generation()
  const cancelled = queue.interrupt('user-spoke')
  assert.equal(cancelled, 2)
  assert.equal(queue.generation(), before + 1)
  assert.equal(queue.size(), 0)
  assert.equal(queue.isEmpty(), true)

  const byId = new Map(queue.items().map((item) => [item.id, item]))
  assert.equal(byId.get(playing.id).status, 'cancelled')
  assert.equal(byId.get(queued.id).status, 'cancelled')
  assert.equal(byId.get(playing.id).meta.cancelReason, 'user-spoke')
  assert.equal(queue.peek(), null)
})

test('queue clear/interrupt 即使没有条目也递增 generation', () => {
  const queue = createSpeechQueue()
  assert.equal(queue.clear(), 0)
  assert.equal(queue.generation(), 1)
  assert.equal(queue.interrupt(), 0)
  assert.equal(queue.generation(), 2)
})

test('queue subscribe 收到事件通知，unsubscribe 后不再收到', () => {
  const queue = createSpeechQueue()
  const events = []
  const unsubscribe = queue.subscribe((event) => events.push(event))

  const item = queue.push('一段话')
  assert.equal(events.length, 1)
  assert.equal(events[0].type, 'enqueue')
  assert.equal(events[0].item.id, item.id)
  assert.equal(events[0].size, 1)
  assert.equal(events[0].generation, 0)

  queue.next()
  assert.equal(events[1].type, 'next')
  assert.equal(events[1].item.status, 'playing')

  queue.markDone(item.id)
  assert.equal(events[2].type, 'done')

  queue.interrupt()
  assert.deepEqual(events.slice(3).map((e) => e.type), ['interrupt', 'generation'])
  assert.equal(events.at(-1).generation, 1)

  unsubscribe()
  queue.push('不会再通知')
  assert.equal(events.length, 5)
})

test('queue subscribe 的监听器抛错不影响队列', () => {
  const queue = createSpeechQueue()
  const seen = []
  queue.subscribe(() => {
    throw new Error('listener boom')
  })
  queue.subscribe((event) => seen.push(event.type))
  const item = queue.push('x')
  assert.equal(seen[0], 'enqueue')
  assert.equal(queue.size(), 1)
  queue.markDone(item.id)
  assert.equal(queue.size(), 0)
})
