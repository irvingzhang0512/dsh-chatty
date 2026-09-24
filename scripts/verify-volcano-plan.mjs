#!/usr/bin/env node
// 火山 Agent Plan 语音识别连通性验证（手动运行，走真实凭据与真实网络）。
//
// 目的：在正式启用 volcano(plan) provider 前，用最小代价确认三件事：
//   1. 凭据文件里能取到 VOLCENGINE_AGENT_PLAN_API_KEY；
//   2. 「X-Api-App-Key 与 X-Api-Access-Key 都填同一把方舟 API Key」的鉴权组合被
//      plan 端点接受（这是本插件 plan 模式的核心假设）；
//   3. 流式帧协议（full request → audio → last）在 plan 端点上行为一致。
//
// 用法：
//   node scripts/verify-volcano-plan.mjs
//   node scripts/verify-volcano-plan.mjs --seconds 2          # 发送更长的静音
//   node scripts/verify-volcano-plan.mjs --url wss://...      # 覆盖端点
//
// 说明：发送的是静音 PCM（16k/16bit/单声道），预期服务端正常应答但识别文本为空；
// 成功判据是收到合法 FULL_SERVER_RESPONSE（或明确的业务错误码），而不是识别出文字。

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { MinimalWebSocket } from '../lib/ws-client.js'
import {
  buildFullClientRequest,
  buildAudioOnlyRequest,
  parseServerResponse,
  extractVolcanoResult,
  VOLCANO_MESSAGE_TYPE,
} from '../lib/stt/volcano.js'

const args = process.argv.slice(2)
function argValue(name) {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : ''
}
const seconds = Math.max(0.2, Number(argValue('--seconds')) || 1)
const url = argValue('--url') || 'wss://openspeech.bytedance.com/api/v3/plan/sauc/bigmodel_nostream'
const resourceId = argValue('--resource-id') || 'volc.seedasr.sauc.duration'
const model = argValue('--model') || 'doubao-seed-asr-2.0'
// 鉴权组合：
//   dual          X-Api-App-Key 与 X-Api-Access-Key 都填 API Key（豆包语音经典风格的 plan 化猜测）
//   bearer        Authorization: Bearer <API Key>（方舟 v3 OpenAPI 风格）
//   bearer+dual   三者都带
//   appkey-only   仅 X-Api-App-Key
const authMode = argValue('--auth') || 'xapikey'

// ── 1. 读取凭据 ────────────────────────────────────────────────────────
const home = process.env.DSH_HOME || join(homedir(), '.dsh')
const credentialsPath = join(home, '.credentials.yaml')
const keyName = process.env.DSH_CHATTY_PLAN_KEY_NAME || 'VOLCENGINE_AGENT_PLAN_API_KEY'

function readApiKey() {
  if (process.env[keyName]) return process.env[keyName]
  let text = ''
  try { text = readFileSync(credentialsPath, 'utf8') } catch {
    throw new Error(`凭据文件不存在：${credentialsPath}`)
  }
  const match = text.match(new RegExp(`^\\s{2}${keyName}:\\s*(.+)$`, 'm'))
  if (!match) {
    throw new Error(`凭据文件 ${credentialsPath} 里没有 ${keyName}。请在 refs: 下加一行：\n  ${keyName}: 你的方舟APIKey`)
  }
  return match[1].trim()
}

const apiKey = readApiKey()
console.log(`[1/3] 凭据 OK：${keyName} = ${apiKey.slice(0, 8)}…（共 ${apiKey.length} 字符）；鉴权组合：${authMode}`)
console.log(`[2/3] 连接 ${url}`)

// xapikey（默认，实测可用）：单一 X-Api-Key 头；其余组合保留用于排查。
const authHeaders = {
  xapikey: { 'X-Api-Key': apiKey },
  dual: { 'X-Api-App-Key': apiKey, 'X-Api-Access-Key': apiKey },
  bearer: { Authorization: `Bearer ${apiKey}` },
  'bearer+dual': { 'X-Api-App-Key': apiKey, 'X-Api-Access-Key': apiKey, Authorization: `Bearer ${apiKey}` },
  'appkey-only': { 'X-Api-App-Key': apiKey },
}[authMode] || { 'X-Api-Key': apiKey }

// ── 2. 连接并完成一次最小识别会话 ──────────────────────────────────────
const socket = new MinimalWebSocket(url, {
  headers: {
    ...authHeaders,
    'X-Api-Resource-Id': resourceId,
    'X-Api-Request-Id': crypto.randomUUID(),
    'X-Api-Connect-Id': crypto.randomUUID(),
    'X-Api-Sequence': '-1',
  },
})

const timeout = setTimeout(() => {
  console.error('✗ 超时：10 秒内没有收到任何服务端响应（检查网络/端点/鉴权）')
  socket.close()
  process.exitCode = 1
}, 10000)

let gotFullResponse = false
socket.onopen = () => {
  console.log('      连接已建立（鉴权头被接受）')
  socket.send(buildFullClientRequest({
    model,
    uid: 'dsh-chatty-verify',
    language: 'zh-CN',
    sampleRate: 16000,
    resourceId,
  }))
  // 1 秒静音 PCM16（16k 单声道 = 32000 字节），按 6400 字节分帧发送。
  const silence = new Uint8Array(Math.round(seconds * 16000 * 2))
  const frameBytes = 6400
  for (let offset = 0; offset < silence.length; offset += frameBytes) {
    const chunk = silence.subarray(offset, Math.min(offset + frameBytes, silence.length))
    const isLast = offset + frameBytes >= silence.length
    socket.send(buildAudioOnlyRequest(chunk, 2 + Math.floor(offset / frameBytes), isLast))
  }
  console.log(`      已发送 ${seconds}s 静音音频，等待服务端响应…`)
}
socket.onmessage = (event) => {
  try {
    const frame = parseServerResponse(event.data)
    if (frame.type === VOLCANO_MESSAGE_TYPE.FULL_SERVER_RESPONSE) {
      gotFullResponse = true
      const { text } = extractVolcanoResult(frame.payload || {})
      console.log(`[3/3] ✓ 收到合法服务端响应（payload code=${frame.payloadCode ?? 'n/a'}），识别文本：${JSON.stringify(text)}（静音应为空）`)
      console.log('\n结论：Agent Plan 鉴权组合与流式协议可用，可以把 volcano(plan) provider 转正。')
      clearTimeout(timeout)
      socket.close()
      return
    }
    console.log('      收到帧：', JSON.stringify(frame).slice(0, 200))
  } catch (error) {
    console.error('✗ 响应解析失败：', error.message)
    clearTimeout(timeout)
    socket.close()
    process.exitCode = 1
  }
}
socket.onerror = (event) => {
  console.error('✗ 连接错误：', event && event.message)
  console.error('   排查提示：')
  console.error('   - 401 {"error":"load grant: ... not found in SaaS storage"} → 该 API Key 所在账号')
  console.error('     尚未开通豆包语音授权，请到火山控制台确认 Agent Plan 的语音模型已开通；')
  console.error('   - 400 {"error":"app key not found..."} → 缺少 X-Api-App-Key 头；')
  console.error('   - 可用 --auth dual / bearer / bearer+dual / appkey-only 换组合重试。')
  clearTimeout(timeout)
  process.exit(1)
}
socket.onclose = () => { clearTimeout(timeout) }
