#!/usr/bin/env node
// 火山 Agent Plan 语音合成（TTS）连通性验证（手动运行，走真实凭据与真实网络）。
//
// 目的：
//   1. 确认 Agent Plan TTS 端点（HTTP POST /api/v3/tts/unidirectional）可用；
//   2. 确认「X-Api-App-Key 与 X-Api-Access-Key 都填方舟 API Key」的鉴权组合被接受；
//   3. 收到音频数据并落盘成文件供试听。
//
// 用法：
//   node scripts/verify-tts-plan.mjs
//   node scripts/verify-tts-plan.mjs --text "自定义试听文本" --format mp3
//   node scripts/verify-tts-plan.mjs --endpoint https://... --resource-id volc.bigtts
//
// 成功判据：响应中拿到音频数据（JSON 行流的 data 字段，或二进制 body），
// 音频写入当前目录 `dsh-chatty-tts-verify.<format>`。

import { readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const args = process.argv.slice(2)
function argValue(name) {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : ''
}
const text = argValue('--text') || '你好，这是 dsh-chatty 的语音合成连通性验证。'
const format = argValue('--format') || 'mp3'
const endpoint = argValue('--endpoint') || 'https://openspeech.bytedance.com/api/v3/plan/tts/unidirectional'
const resourceId = argValue('--resource-id') || 'volc.bigtts'
const voice = argValue('--voice') || 'zh_female_shuangkuaisisi_moon_bigtts'

// ── 1. 读取凭据 ────────────────────────────────────────────────────────
const home = process.env.DSH_HOME || join(homedir(), '.dsh')
const credentialsPath = join(home, '.credentials.yaml')
const keyName = process.env.DSH_CHATTY_PLAN_KEY_NAME || 'VOLCENGINE_AGENT_PLAN_API_KEY'

function readApiKey() {
  if (process.env[keyName]) return process.env[keyName]
  const yaml = readFileSync(credentialsPath, 'utf8')
  const match = yaml.match(new RegExp(`^\\s{2}${keyName}:\\s*(.+)$`, 'm'))
  if (!match) {
    throw new Error(`凭据文件 ${credentialsPath} 里没有 ${keyName}。请在 refs: 下加一行：\n  ${keyName}: 你的方舟APIKey`)
  }
  return match[1].trim()
}

const apiKey = readApiKey()
console.log(`[1/3] 凭据 OK：${keyName} = ${apiKey.slice(0, 8)}…（共 ${apiKey.length} 字符）`)
console.log(`[2/3] POST ${endpoint}（resource ${resourceId}）`)

// ── 2. 发起合成请求（流式响应） ────────────────────────────────────────
// signal 兼作总超时与「失败后立刻销毁底层连接」的开关（否则进程退出会崩）。
const controller = new AbortController()
const timeout = setTimeout(() => controller.abort(), 20000)
const res = await fetch(endpoint, {
  signal: controller.signal,
  method: 'POST',
  headers: {
    'X-Api-App-Key': apiKey,
    'X-Api-Access-Key': apiKey,
    'X-Api-Resource-Id': resourceId,
    'X-Api-Request-Id': crypto.randomUUID(),
    'content-type': 'application/json',
  },
  body: JSON.stringify({
    user: { uid: 'dsh-chatty-verify' },
    req_params: {
      text,
      speaker: voice,
      audio_params: { format, sample_rate: 24000, speech_rate: 1.0 },
    },
  }),
})
console.log(`      HTTP ${res.status}  content-type=${res.headers.get('content-type')}`)

// 一次性读全响应体：undici 自行管理底层连接，避免退出期 handle 清理崩溃。
const raw = Buffer.from(await res.arrayBuffer())
const contentType = String(res.headers.get('content-type') || '')

const isJson = contentType.includes('json')
let sawHeader = false
let headerCode = null
let headerMessage = ''
const dataParts = []
if (isJson) {
  for (const line of raw.toString('utf8').split('\n').map((l) => l.trim()).filter(Boolean)) {
    if (!line.startsWith('{')) continue
    try {
      const parsed = JSON.parse(line)
      if (parsed.header) {
        sawHeader = true
        headerCode = Number(parsed.header.code)
        headerMessage = String(parsed.header.message || '')
      }
      if (typeof parsed.data === 'string' && parsed.data) dataParts.push(Buffer.from(parsed.data, 'base64'))
    } catch { /* 非整行 JSON（可能是二进制音频的一部分） */ }
  }
}

if (!res.ok || (sawHeader && headerCode !== 0)) {
  console.error(`✗ 失败：HTTP ${res.status}${sawHeader ? ` header.code=${headerCode} ${headerMessage}` : ''}`)
  if (String(headerMessage).includes('load grant')) {
    console.error('   该 API Key 所在账号尚未开通豆包语音授权：')
    console.error('   请到火山控制台确认 Agent Plan 的语音模型（doubao-语音合成）已开通，')
    console.error('   开通后重新运行本脚本验证。')
  }
  process.exitCode = 1
} else {
  // ── 3. 提取音频并落盘 ────────────────────────────────────────────────
  // JSON 行流：data 字段（base64）拼接；二进制载体：全部字节即音频。
  const audio = isJson ? Buffer.concat(dataParts) : raw
  if (!audio.length) {
    console.error('✗ 未收到音频数据')
    process.exitCode = 1
  } else {
    const outFile = `dsh-chatty-tts-verify.${format}`
    writeFileSync(outFile, audio)
    console.log(`[3/3] ✓ 合成完成：${audio.length} 字节 → ${outFile}（可直接播放试听）`)
    console.log('\n结论：Agent Plan TTS 鉴权与协议可用，volcano TTS 可以转正。')
  }
}
clearTimeout(timeout)
