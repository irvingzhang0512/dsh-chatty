// 一次性探针：逐帧解压多帧 zstd 会话文件，统计事件类型。用完即删。
import { zstdDecompressSync } from 'node:zlib'
import fs from 'node:fs'

const file = process.argv[2]
const raw = fs.readFileSync(file)
const magic = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])
const positions = []
for (let i = 0; i <= raw.length - 4; i += 1) {
  if (raw[i] === magic[0] && raw[i + 1] === magic[1] && raw[i + 2] === magic[2] && raw[i + 3] === magic[3]) positions.push(i)
}
positions.push(raw.length)
const counts = new Map()
const samples = new Map()
let failed = 0
for (let i = 0; i < positions.length - 1; i += 1) {
  const slice = raw.subarray(positions[i], positions[i + 1])
  let text
  try { text = zstdDecompressSync(slice).toString('utf8') } catch { failed += 1; continue }
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    try {
      const event = JSON.parse(line)
      const key = event.type || '(no-type)'
      counts.set(key, (counts.get(key) || 0) + 1)
      if (!samples.has(key)) samples.set(key, event)
    } catch { counts.set('(parse-fail)', (counts.get('(parse-fail)') || 0) + 1) }
  }
}
console.log('帧数:', positions.length - 1, '解压失败帧:', failed)
for (const [type, count] of [...counts.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${type}: ${count}`)
const sample = samples.get('assistant/message')
if (sample) {
  const stream = sample.data && sample.data.stream
  console.log('\nassistant/message 样例：data keys =', Object.keys(sample.data || {}))
  if (Array.isArray(stream)) {
    const kinds = stream.map((entry) => entry && entry.chunk ? entry.chunk.type : entry && entry.type).filter(Boolean)
    console.log('stream 长度:', stream.length, 'chunk 类型:', JSON.stringify([...new Set(kinds)]))
    const delta = stream.find((entry) => entry && entry.chunk && entry.chunk.type === 'text-delta')
    if (delta) console.log('text-delta chunk keys:', JSON.stringify(Object.keys(delta.chunk)))
  }
  const message = sample.data && sample.data.message
  if (message) console.log('message 字段:', JSON.stringify(Object.keys(message)), 'content:', JSON.stringify(message.content || '').slice(0, 200))
}
