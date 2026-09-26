// dsh-chatty — 宿主半边（host half）。
//
// 职责边界：
//   宿主：Voice Draft 领域状态、语音指令判定、LLM 润色/摘要、STT/TTS Provider 调用、
//         Speech Buffer/Renderer/Queue 流水线、凭据解析、Assistant 回复文本分发。
//   浏览器：麦克风采集、本地 VAD、音频可视化、Voice Bar 与 Draft 面板、音频播放、composer 写入。
//
// API Key 只在宿主侧经 ctx.credentials 解析，绝不下发浏览器。
//
// 路由一览见 docs/ARCHITECTURE.md 第 3 节。

import { defineTool } from '@deepseek-ai/dsh-tools'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { execFile } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { Config } from './config.js'
import { toCredentialRef, credentialNameChanged } from './credential-name.js'
import { createVoiceDraft } from './draft.js'
import { createCommandParser } from './command-parser.js'
import { writeJson, readBody, isTrustedCaller, writeSseHead, writeSse, parseJsonBody } from './http-util.js'
import { sniffAudioFormat } from './audio.js'
import { createPolishText, createSpeechSummarizer } from './polish.js'
import { createSpeechPipeline } from './pipeline.js'
import { STT_PROVIDER_KEYS, STT_DEFAULTS, STT_KNOWN_MODELS, sttCapability, createSttProvider } from './stt/providers.js'
import { TTS_PROVIDER_KEYS, TTS_DEFAULTS, STATIC_VOICES, ttsCapability, createTtsProvider } from './tts/providers.js'
import { createWebSocketImpl } from './ws-client.js'
import { adaptSessionEvent } from './reply-adapter.js'

export const name = 'dsh-chatty'
export const inject = ['tools', 'credentials', 'webServer', 'settings', 'llm']
export { Config }

const MIME_BY_EXT = {
  '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.mp4': 'audio/mp4',
  '.ogg': 'audio/ogg', '.oga': 'audio/ogg', '.flac': 'audio/flac', '.webm': 'audio/webm', '.aac': 'audio/aac',
  '.pcm': 'audio/L16',
}

export function apply(ctx, baseConfig) {
  // ── 实时配置：设置卡改完立即生效，不需要重启进程 ──────────────────────
  let scope = null
  let getConfig = () => baseConfig
  const live = () => Config(structuredClone(getConfig() || {})) ?? baseConfig

  ctx.inject(['settings'], (sctx) => {
    scope = sctx.settings.register(name, Config, { base: baseConfig })
    getConfig = () => scope.get() ?? baseConfig
    sctx.effect(() => () => { getConfig = () => baseConfig; scope = null })
  })

  const logger = (ctx.logger && typeof ctx.logger.warn === 'function')
    ? (message, error) => ctx.logger.warn(message, error)
    : () => {}

  async function resolveKey(ref) {
    const key = toCredentialRef(ref)
    if (!key) return ''
    if (credentialNameChanged(ref)) {
      logger(`dsh-chatty: 凭据名 "${String(ref).trim()}" 已归一化为 "${key}"（DSH Credentials 只接受字母数字下划线）`)
    }
    try {
      const resolved = await ctx.credentials.resolve(credentialRef(key))
      if (resolved && resolved.value) return resolved.value
    } catch { /* 回落到环境变量 */ }
    return process.env[key] || ''
  }

  // ── Voice Draft：每个会话一份，宿主是唯一权威副本 ─────────────────────
  const drafts = new Map()
  function draftFor(sessionId) {
    const id = String(sessionId || 'default')
    let draft = drafts.get(id)
    if (!draft) {
      const cfg = live()
      draft = createVoiceDraft({ maxUtterances: cfg.draft.max_utterances, separator: cfg.draft.separator })
      drafts.set(id, draft)
    }
    return draft
  }

  function commandParser() {
    const cfg = live()
    return createCommandParser({
      commands: cfg.voice_control.commands,
      mode: cfg.voice_control.command_mode,
      wakePrefix: cfg.voice_control.wake_prefix,
      wakeWords: cfg.voice_control.wake_words,
    })
  }

  function draftPayload(draft) {
    return {
      text: draft.text(),
      size: draft.size(),
      utterances: draft.utterances(),
    }
  }

  // 语音指令 → 宿主动作 / 浏览器动作。
  // 宿主负责草稿类动作（撤销/清空/取消/润色），浏览器负责音频与麦克风类动作。
  const HOST_COMMANDS = new Set(['undo', 'clear', 'cancel', 'polish'])
  const CLIENT_COMMANDS = new Set(['send', 'stop_listening', 'pause', 'resume', 'read', 'stop_reading'])

  async function runCommand(sessionId, parsed, signal) {
    const draft = draftFor(sessionId)
    const command = parsed.command
    const effects = []
    let removed = 0
    if (command === 'undo') { draft.undo(); effects.push('setDraft') }
    else if (command === 'clear' || command === 'cancel') { removed = draft.clear(); effects.push('setDraft') }
    else if (command === 'polish') {
      const cfg = live()
      if (cfg.polish.enabled && cfg.draft.polish_on_command) {
        const polished = await polishText(draft.text(), {}, signal)
        if (polished && polished !== draft.text()) draft.replaceAll(polished)
      }
      effects.push('setDraft')
    } else if (command === 'send') {
      // 宿主不直接投递 Session：由浏览器把草稿写入 composer 并提交，
      // 这样「发送」与手动点发送走完全相同的通路。
      effects.push('submit')
    }
    return { command, effects, removed }
  }

  // ── 语音流水线（Assistant 回复 → 可朗读片段） ────────────────────────
  const speechClients = new Set()
  const lastReply = new Map()
  const turnBySession = new Map()

  const summarizeBlock = createSpeechSummarizer({
    resolveKey,
    getConfig: live,
    llm: ctx.llm,
    getAgentDefaultModel: () => {
      const service = ctx.get && ctx.get('agentDefaultModel')
      return service && typeof service.currentSelection === 'function' ? service.currentSelection() : null
    },
  })

  const pipeline = createSpeechPipeline({
    get policy() { return live().tts.renderer },
    get codeHint() { return live().tts.code_hint },
    summarizeBlock: (kind, raw, signal) => summarizeBlock(kind, raw, signal),
    onSegment(segment, sessionId) {
      for (const client of speechClients) {
        if (client.sessionId !== sessionId) continue
        if (!writeSse(client.res, 'speech.segment', segment)) speechClients.delete(client)
      }
    },
    onEnd(sessionId) {
      for (const client of speechClients) {
        if (client.sessionId !== sessionId) continue
        if (!writeSse(client.res, 'speech.end', { sessionId })) speechClients.delete(client)
      }
    },
    onCancel(sessionId, reason) {
      for (const client of speechClients) {
        if (client.sessionId !== sessionId) continue
        if (!writeSse(client.res, 'speech.cancel', { sessionId, reason })) speechClients.delete(client)
      }
    },
  })

  const polishText = createPolishText({
    resolveKey,
    getConfig: live,
    llm: ctx.llm,
    getAgentDefaultModel: () => {
      const service = ctx.get && ctx.get('agentDefaultModel')
      return service && typeof service.currentSelection === 'function' ? service.currentSelection() : null
    },
  })

  // Assistant 回复文本 → Speech Buffer → Speech Renderer → Speech Queue。
  //
  // 无论是否开启自动朗读都记录最近一次回复（手动朗读要用），
  // 但只有开启自动朗读 / 语音对话模式（或浏览器订阅了语音事件流）才真正推进流水线。
  const hostState = { voiceChat: false }
  const voicePipelineActive = (cfg) => Boolean(cfg.tts.auto_read || hostState.voiceChat)
  ctx.effect(() => ctx.on('session/event', (session, event) => {
    const outgoing = adaptSessionEvent(session, event)
    if (!outgoing) return
    const sessionId = outgoing.conversationId
    const cfg = live()
    const autoRead = voicePipelineActive(cfg)
    if (outgoing.type === 'reply.delta') {
      // 新一轮回复产生时按配置清空旧队列（需求 §18）。
      const current = turnBySession.get(sessionId)
      if (current !== outgoing.turnId) {
        turnBySession.set(sessionId, outgoing.turnId)
        if (autoRead) pipeline.cancel(sessionId)
        lastReply.set(sessionId, { turnId: outgoing.turnId, text: '' })
      }
      const record = lastReply.get(sessionId) || { turnId: outgoing.turnId, text: '' }
      record.text += outgoing.text || ''
      lastReply.set(sessionId, record)
      if (autoRead) pipeline.feed(sessionId, outgoing.text)
    } else if (outgoing.type === 'reply.end') {
      if (autoRead) pipeline.finish(sessionId)
    } else if (outgoing.type === 'reply.cancel') {
      if (autoRead) pipeline.cancel(sessionId)
    }
  }, { global: true }), 'dsh-chatty: assistant reply → speech pipeline')

  // ── STT：批量 + 流式会话 ─────────────────────────────────────────────
  const sttSessions = new Map()
  let streamSeq = 0

  // 空字符串不能覆盖 Provider 默认值：这里统一剔除空值再交给 Provider。
  function compactConfig(source) {
    const out = {}
    for (const [key, value] of Object.entries(source || {})) {
      if (value === undefined || value === null || value === '') continue
      out[key] = value
    }
    return out
  }

  function makeSttProvider(providerName, cfg) {
    return createSttProvider(providerName, {
      config: compactConfig({
        model: cfg.stt.model,
        language: cfg.stt.language,
        baseUrl: cfg.stt.base_url,
        streamUrl: cfg.stt.stream_url,
        resourceId: cfg.stt.resource_id,
        credential: cfg.stt.credential,
        sampleRate: 16000,
      }),
      resolveKey,
      logger,
      // 火山流式识别需要自定义认证头，Node 全局 WebSocket 不支持 headers，
      // 因此注入自带的 RFC6455 最小实现（见 lib/ws-client.js）。
      WebSocketImpl: createWebSocketImpl(),
    })
  }

  async function transcribeBatch(cfg, bytes, mimeType, language, providerName, signal) {
    const provider = makeSttProvider(providerName || cfg.stt.provider, cfg)
    const started = Date.now()
    const out = await provider.transcribe({
      audio: bytes,
      mimeType,
      language: language || cfg.stt.language,
      signal,
    })
    return { text: String(out.text || '').trim(), provider: provider.name, tookMs: Date.now() - started }
  }

  // ── TTS ──────────────────────────────────────────────────────────────
  function makeTtsProvider(providerName, cfg) {
    return createTtsProvider(providerName, {
      config: compactConfig({
        model: cfg.tts.model,
        voice: cfg.tts.voice,
        speed: cfg.tts.speed,
        format: cfg.tts.format,
        sampleRate: cfg.tts.sample_rate,
        streamUrl: cfg.tts.stream_url,
        resourceId: cfg.tts.resource_id,
        credential: cfg.tts.credential,
      }),
      resolveKey,
      logger,
      // 火山 Agent Plan 单向流式合成同样需要自定义认证头。
      WebSocketImpl: createWebSocketImpl(),
    })
  }

  // ────────────────────────────────────────────────────────────────────
  // 路由
  // ────────────────────────────────────────────────────────────────────

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-chatty/status',
    handler: async (req, res) => {
      if (req.method !== 'GET') { writeJson(res, 405, { ok: false, error: { code: 'method', message: 'GET only' } }); return }
      const cfg = live()
      const parser = commandParser()
      writeJson(res, 200, {
        ok: true,
        stt: {
          provider: cfg.stt.provider,
          model: cfg.stt.model,
          streaming: cfg.stt.streaming,
          language: cfg.stt.language,
          continuous_listening: cfg.stt.continuous_listening,
          partial_preview: cfg.stt.partial_preview,
          capability: sttCapability(cfg.stt.provider),
          vad: cfg.stt.vad,
          wake_word: cfg.stt.wake_word,
        },
        tts: {
          provider: cfg.tts.provider,
          model: cfg.tts.model,
          voice: cfg.tts.voice,
          speed: cfg.tts.speed,
          format: cfg.tts.format,
          sample_rate: cfg.tts.sample_rate,
          volume: cfg.tts.volume,
          auto_read: cfg.tts.auto_read,
          voice_chat: hostState.voiceChat,
          interrupt_on_speech: cfg.tts.interrupt_on_speech,
          code_hint: cfg.tts.code_hint,
          capability: ttsCapability(cfg.tts.provider),
          renderer: cfg.tts.renderer,
        },
        voice_control: {
          enabled: cfg.voice_control.enabled,
          command_mode: cfg.voice_control.command_mode,
          wake_prefix: cfg.voice_control.wake_prefix,
          wake_words: cfg.voice_control.wake_words,
          commands: parser.commands,
          host_commands: Array.from(HOST_COMMANDS),
          client_commands: Array.from(CLIENT_COMMANDS),
        },
        draft: cfg.draft,
        ui: cfg.ui,
        polish: { enabled: cfg.polish.enabled },
        mic_device_id: cfg.mic_device_id,
        noise_suppression: cfg.noise_suppression,
        echo_cancellation: cfg.echo_cancellation,
        auto_gain_control: cfg.auto_gain_control,
      })
    },
  }), 'dsh-chatty: /status route')

  // 凭据状态检查：供 /config-info 与 /credentials/state 共用。
  async function credentialState(name) {
    const ref = toCredentialRef(name)
    if (!ref) return { name: '', requested: String(name || ''), configured: false, source: '' }
    try {
      const state = await ctx.credentials.describe(credentialRef(ref))
      return { name: ref, requested: String(name || ''), configured: !!state?.configured, source: state?.source ? String(state.source) : '' }
    } catch {
      return { name: ref, requested: String(name || ''), configured: false, source: '' }
    }
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-chatty/config-info',
    handler: async (req, res) => {
      if (req.method !== 'GET') { writeJson(res, 405, { ok: false, error: { code: 'method', message: 'GET only' } }); return }
      const cfg = live()
      const stt = {
        providers: STT_PROVIDER_KEYS.map((key) => ({
          key,
          capability: sttCapability(key),
          models: STT_KNOWN_MODELS[key] || [],
          authMode: key === 'volcano' ? 'plan' : 'api-key',
          label: key === 'volcano' ? '火山引擎（Agent Plan）'
            : key === 'siliconflow' ? '硅基流动' : key,
          defaultCredential: STT_DEFAULTS[key]?.credential || '',
        })),
        active: cfg.stt.provider,
        credentials: [
          await credentialState(cfg.stt.credential),
        ],
      }
      const tts = {
        providers: TTS_PROVIDER_KEYS.map((key) => ({
          key,
          capability: ttsCapability(key),
          label: key === 'volcano' ? '火山引擎（Agent Plan 合成）' : key === 'siliconflow' ? '硅基流动' : key,
          defaultCredential: TTS_DEFAULTS[key]?.credential || '',
        })),
        active: cfg.tts.provider,
        credentials: [
          await credentialState(cfg.tts.credential),
        ],
        voices: STATIC_VOICES,
      }
      const models = []
      try {
        if (ctx.llm && typeof ctx.llm.listProviders === 'function' && typeof ctx.llm.listModels === 'function') {
          for (const provider of ctx.llm.listProviders()) {
            const id = typeof provider === 'string' ? provider : provider.id || provider.name
            if (!id) continue
            const items = await ctx.llm.listModels(id).catch(() => [])
            for (const item of items || []) {
              const model = typeof item === 'string' ? item : item && (item.id || item.name)
              if (model) models.push({ provider: id, model: String(model) })
            }
          }
        }
      } catch { /* LLM 服务不可用时设置页只少一个下拉框 */ }
      writeJson(res, 200, { ok: true, stt, tts, models })
    },
  }), 'dsh-chatty: /config-info route')

  // ── 凭据体验：状态检查 + 用系统编辑器打开凭据文件 ────────────────────
  // DSH 凭据服务没有公开的写入 API，宿主不代写密钥；这里只负责把文件打开、
  // 告诉用户该加哪几行、并实时反馈每把 Key 是否已经配置。
  function credentialsFilePath() {
    const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
    return path.join(home, '.credentials.yaml')
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-chatty/credentials/state',
    handler: async (req, res) => {
      if (req.method !== 'GET') { writeJson(res, 405, { ok: false, error: { code: 'method', message: 'GET only' } }); return }
      const cfg = live()
      const filePath = credentialsFilePath()
      const wanted = [
        { role: 'STT（当前 provider）', name: cfg.stt.credential },
        { role: 'TTS（当前 provider）', name: cfg.tts.credential },
      ]
      const credentials = []
      const seenNames = new Set()
      for (const item of wanted) {
        const state = await credentialState(item.name)
        if (!state.name || seenNames.has(state.name)) continue
        seenNames.add(state.name)
        credentials.push({ ...state, role: item.role })
      }
      writeJson(res, 200, {
        ok: true,
        path: filePath,
        exists: existsSync(filePath),
        credentials,
        hint: '在 refs: 下按名称添加一行即可，例如\n  VOLCENGINE_AGENT_PLAN_API_KEY: 你的方舟APIKey\n  SILICONFLOW_API_KEY: 你的硅基流动APIKey',
      })
    },
  }), 'dsh-chatty: /credentials/state route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-chatty/credentials/open',
    handler: async (req, res) => {
      if (req.method !== 'POST') { writeJson(res, 405, { ok: false, error: { code: 'method', message: 'POST only' } }); return }
      if (!isTrustedCaller(req)) { writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'forbidden source origin' } }); return }
      const filePath = credentialsFilePath()
      let created = false
      if (!existsSync(filePath)) {
        // 首次使用：生成最小骨架，用户只需要在 refs: 下补自己的 Key 行。
        const skeleton = [
          '# DSH 凭据文件（凭据引用名: 密钥值）。保存后回到设置卡点「重新检查」。',
          '# 引用名只允许字母/数字/下划线，例如：',
          '#   VOLCENGINE_AGENT_PLAN_API_KEY: 你的方舟APIKey',
          '#   SILICONFLOW_API_KEY: 你的硅基流动APIKey',
          'refs: {}',
          'version: 1',
          '',
        ].join('\n')
        try { await writeFile(filePath, skeleton, 'utf8'); created = true } catch (error) {
          writeJson(res, 500, { ok: false, error: { code: 'write', message: String(error && error.message || error) } }); return
        }
      }
      try {
        // 可测试性开关：测试环境设置 DSH_CHATTY_SKIP_OPEN=1 时不真的唤起编辑器。
        const skipOpen = process.env.DSH_CHATTY_SKIP_OPEN === '1'
        const command = process.platform === 'win32' ? 'cmd'
          : process.platform === 'darwin' ? 'open' : 'xdg-open'
        const args = process.platform === 'win32' ? ['/c', 'start', '', filePath] : [filePath]
        if (!skipOpen) execFile(command, args, { windowsHide: true }, () => { /* 打开失败也不阻塞响应 */ })
        writeJson(res, 200, { ok: true, path: filePath, created, opened: !skipOpen })
      } catch (error) {
        writeJson(res, 500, { ok: false, error: { code: 'open', message: String(error && error.message || error) } })
      }
    },
  }), 'dsh-chatty: /credentials/open route')

  // ── Voice Draft ──────────────────────────────────────────────────────
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-chatty/draft',
    handler: async (req, res) => {
      if (!isTrustedCaller(req)) { writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'forbidden source origin' } }); return }
      const url = new URL(req.url || '/dsh-chatty/draft', 'http://127.0.0.1')
      const querySession = url.searchParams.get('sessionId') || ''

      if (req.method === 'GET') {
        const draft = draftFor(querySession)
        writeJson(res, 200, { ok: true, draft: draftPayload(draft) })
        return
      }
      if (req.method !== 'POST') { writeJson(res, 405, { ok: false, error: { code: 'method', message: 'GET or POST only' } }); return }

      let raw
      try { raw = await readBody(req, 1024 * 1024) } catch (error) {
        writeJson(res, 400, { ok: false, error: { code: 'body', message: error.message } }); return
      }
      const payload = parseJsonBody(raw)
      const sessionId = String(payload.sessionId || querySession || 'default')
      const action = String(payload.action || 'get')
      const draft = draftFor(sessionId)
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), Math.max(1000, live().timeout_ms))
      try {
        // v0.3 听写直写：识别结果由浏览器直接写入 Session 输入框，
        // 宿主草稿路由仅保留 polish；其余动作已迁移到客户端。
        if (action !== 'polish' && action !== 'get') {
          writeJson(res, 410, {
            ok: false,
            error: { code: 'deprecated', message: `action "${action}" 已废弃：识别结果直接写入 Session 输入框，仅保留 polish` },
          })
          return
        }

        let command = null
        let effects = []

        if (action === 'polish') {
          const cfg = live()
          const source = String(payload.text || draft.text() || '')
          if (cfg.polish.enabled && source.trim()) {
            const polished = await polishText(source, { prompt: payload.prompt }, controller.signal)
            if (polished && polished !== source) draft.replaceAll(polished)
          }
          effects = ['setDraft']
        }

        writeJson(res, 200, { ok: true, action, draft: draftPayload(draft), command, effects })
      } catch (error) {
        writeJson(res, 502, { ok: false, error: { code: 'draft', message: String(error && error.message || error) } })
      } finally {
        clearTimeout(timer)
      }
    },
  }), 'dsh-chatty: /draft route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-chatty/draft/polish',
    handler: async (req, res) => {
      if (req.method !== 'POST') { writeJson(res, 405, { ok: false, error: { code: 'method', message: 'POST only' } }); return }
      if (!isTrustedCaller(req)) { writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'forbidden source origin' } }); return }
      let raw
      try { raw = await readBody(req, 1024 * 1024) } catch (error) {
        writeJson(res, 400, { ok: false, error: { code: 'body', message: error.message } }); return
      }
      const payload = parseJsonBody(raw)
      const text = String(payload.text || '').trim()
      if (!text) { writeJson(res, 400, { ok: false, error: { code: 'empty', message: 'text required' } }); return }
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), Math.max(1000, live().timeout_ms))
      try {
        const out = await polishText(text, { prompt: payload.prompt }, controller.signal)
        writeJson(res, 200, { ok: true, text: out })
      } catch (error) {
        writeJson(res, 502, { ok: false, error: { code: 'polish', message: String(error && error.message || error) } })
      } finally { clearTimeout(timer) }
    },
  }), 'dsh-chatty: /draft/polish route')

  // ── STT：批量 ────────────────────────────────────────────────────────
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-chatty/stt/transcribe',
    handler: async (req, res) => {
      if (req.method !== 'POST') { writeJson(res, 405, { ok: false, error: { code: 'method', message: 'POST only' } }); return }
      if (!isTrustedCaller(req)) { writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'forbidden source origin' } }); return }
      const cfg = live()
      let raw
      try { raw = await readBody(req, cfg.max_audio_bytes + 1024 * 1024) } catch (error) {
        writeJson(res, 400, { ok: false, error: { code: 'body', message: error.message } }); return
      }
      const payload = parseJsonBody(raw)
      const dataBase64 = typeof payload.dataBase64 === 'string' ? payload.dataBase64 : ''
      if (!dataBase64) { writeJson(res, 400, { ok: false, error: { code: 'no-audio', message: 'no audio data' } }); return }
      let bytes
      try { bytes = Buffer.from(dataBase64, 'base64') } catch { bytes = null }
      if (!bytes || !bytes.length) { writeJson(res, 400, { ok: false, error: { code: 'decode', message: 'failed to decode audio' } }); return }
      if (bytes.length > cfg.max_audio_bytes) {
        writeJson(res, 413, { ok: false, error: { code: 'too-large', message: `audio is ${bytes.length} bytes, max ${cfg.max_audio_bytes}` } }); return
      }
      const mimeType = String(payload.mimeType || '').trim() || mimeForFormat(sniffAudioFormat(bytes))
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), Math.max(1000, cfg.timeout_ms))
      req.on('aborted', () => controller.abort())
      try {
        const out = await transcribeBatch(cfg, bytes, mimeType, payload.language, payload.provider, controller.signal)
        writeJson(res, 200, { ok: true, ...out })
      } catch (error) {
        writeJson(res, 502, { ok: false, error: { code: error && error.code || 'stt', message: String(error && error.message || error) } })
      } finally { clearTimeout(timer) }
    },
  }), 'dsh-chatty: /stt/transcribe route')

  // ── STT：流式会话 ────────────────────────────────────────────────────
  //
  // 浏览器把 PCM 分片 POST 到 /stt/stream/push，partial/final 通过
  // /stt/stream/events 的 SSE 推回。选择 HTTP 分片而不是 WebSocket：
  // 与 DSH 现有路由体系一致，且浏览器侧只需要 fetch + EventSource。
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-chatty/stt/stream/start',
    handler: async (req, res) => {
      if (req.method !== 'POST') { writeJson(res, 405, { ok: false, error: { code: 'method', message: 'POST only' } }); return }
      if (!isTrustedCaller(req)) { writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'forbidden source origin' } }); return }
      const cfg = live()
      let raw
      try { raw = await readBody(req, 64 * 1024) } catch (error) {
        writeJson(res, 400, { ok: false, error: { code: 'body', message: error.message } }); return
      }
      const payload = parseJsonBody(raw)
      const providerName = String(payload.provider || cfg.stt.provider)
      const capability = sttCapability(providerName)
      const streamId = `s${++streamSeq}-${Date.now().toString(36)}`
      const clients = new Set()
      const session = {
        id: streamId,
        providerName,
        language: String(payload.language || cfg.stt.language),
        sampleRate: Number(payload.sampleRate) || 16000,
        clients,
        finalText: '',
        closed: false,
      }
      const emit = (event, data) => {
        for (const client of clients) {
          if (!writeSse(client, event, data)) clients.delete(client)
        }
      }
      session.emit = emit
      sttSessions.set(streamId, session)

      const provider = makeSttProvider(providerName, cfg)
      // 批量 Provider 也要能进入「流式模式」：用伪流式包一层，行为一致。
      try {
        session.stream = provider.createStream({
          language: session.language,
          sampleRate: session.sampleRate,
          onPartial: (text) => { if (cfg.stt.partial_preview) emit('partial', { streamId, text }) },
          onFinal: (text) => {
            session.finalText = String(text || '').trim()
            emit('final', { streamId, text: session.finalText, provider: providerName })
          },
          onError: (error) => emit('error', { streamId, message: String(error && error.message || error) }),
        })
      } catch (error) {
        sttSessions.delete(streamId)
        writeJson(res, 502, { ok: false, error: { code: error && error.code || 'stt', message: String(error && error.message || error) } })
        return
      }
      writeJson(res, 200, { ok: true, streamId, capability, sampleRate: session.sampleRate })
    },
  }), 'dsh-chatty: /stt/stream/start route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-chatty/stt/stream/push',
    handler: async (req, res) => {
      if (req.method !== 'POST') { writeJson(res, 405, { ok: false, error: { code: 'method', message: 'POST only' } }); return }
      if (!isTrustedCaller(req)) { writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'forbidden source origin' } }); return }
      const cfg = live()
      let raw
      try { raw = await readBody(req, Math.min(cfg.max_audio_bytes, 4 * 1024 * 1024) + 64 * 1024) } catch (error) {
        writeJson(res, 400, { ok: false, error: { code: 'body', message: error.message } }); return
      }
      const payload = parseJsonBody(raw)
      const session = sttSessions.get(String(payload.streamId || ''))
      if (!session || session.closed) { writeJson(res, 404, { ok: false, error: { code: 'stream', message: 'unknown or closed stream' } }); return }
      const dataBase64 = typeof payload.dataBase64 === 'string' ? payload.dataBase64 : ''
      if (!dataBase64) { writeJson(res, 400, { ok: false, error: { code: 'no-audio', message: 'no audio data' } }); return }
      try {
        session.stream.pushAudio(new Uint8Array(Buffer.from(dataBase64, 'base64')))
      } catch (error) {
        writeJson(res, 502, { ok: false, error: { code: 'push', message: String(error && error.message || error) } }); return
      }
      writeJson(res, 200, { ok: true, seq: Number(payload.seq) || 0 })
    },
  }), 'dsh-chatty: /stt/stream/push route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-chatty/stt/stream/events',
    handler: async (req, res) => {
      if (req.method !== 'GET') { writeJson(res, 405, { ok: false, error: { code: 'method', message: 'GET only' } }); return }
      const url = new URL(req.url || '/dsh-chatty/stt/stream/events', 'http://127.0.0.1')
      const session = sttSessions.get(String(url.searchParams.get('streamId') || ''))
      if (!session) { writeJson(res, 404, { ok: false, error: { code: 'stream', message: 'unknown stream' } }); return }
      writeSseHead(res)
      session.clients.add(res)
      const timer = setInterval(() => { try { res.write(': keepalive\n\n') } catch { /* closed */ } }, 15000)
      req.on('close', () => {
        clearInterval(timer)
        session.clients.delete(res)
      })
    },
  }), 'dsh-chatty: /stt/stream/events route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-chatty/stt/stream/stop',
    handler: async (req, res) => {
      if (req.method !== 'POST') { writeJson(res, 405, { ok: false, error: { code: 'method', message: 'POST only' } }); return }
      if (!isTrustedCaller(req)) { writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'forbidden source origin' } }); return }
      let raw
      try { raw = await readBody(req, 64 * 1024) } catch (error) {
        writeJson(res, 400, { ok: false, error: { code: 'body', message: error.message } }); return
      }
      const payload = parseJsonBody(raw)
      const session = sttSessions.get(String(payload.streamId || ''))
      if (!session) { writeJson(res, 200, { ok: true, text: '' }); return }
      try {
        if (payload.cancel) session.stream.cancel()
        else await session.stream.stop()
      } catch (error) {
        logger('dsh-chatty: stream stop failed', error)
      }
      session.closed = true
      sttSessions.delete(session.id)
      session.emit('closed', { streamId: session.id, text: session.finalText })
      for (const client of session.clients) { try { client.end() } catch { /* closed */ } }
      session.clients.clear()
      writeJson(res, 200, { ok: true, text: session.finalText })
    },
  }), 'dsh-chatty: /stt/stream/stop route')

  // ── TTS ──────────────────────────────────────────────────────────────
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-chatty/tts/synthesize',
    handler: async (req, res) => {
      if (req.method !== 'POST') { writeJson(res, 405, { ok: false, error: { code: 'method', message: 'POST only' } }); return }
      if (!isTrustedCaller(req)) { writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'forbidden source origin' } }); return }
      const cfg = live()
      let raw
      try { raw = await readBody(req, 256 * 1024) } catch (error) {
        writeJson(res, 400, { ok: false, error: { code: 'body', message: error.message } }); return
      }
      const payload = parseJsonBody(raw)
      const text = String(payload.text || '').trim()
      if (!text) { writeJson(res, 400, { ok: false, error: { code: 'empty', message: 'text required' } }); return }
      if (text.length > cfg.tts.max_chars) {
        writeJson(res, 413, { ok: false, error: { code: 'too-long', message: `text exceeds ${cfg.tts.max_chars} characters` } }); return
      }
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), Math.max(1000, cfg.timeout_ms))
      req.on('aborted', () => controller.abort())
      res.on('close', () => controller.abort())
      try {
        const provider = makeTtsProvider(cfg.tts.provider, cfg)
        const stream = provider.createStream({
          text,
          voice: String(payload.voice || cfg.tts.voice || ''),
          speed: Number(payload.speed) || cfg.tts.speed,
          format: String(payload.format || cfg.tts.format || 'pcm'),
          signal: controller.signal,
        })
        res.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Cache-Control': 'no-store',
          'X-Audio-Format': stream.format,
          'X-Audio-Sample-Rate': String(stream.sampleRate),
          'X-Audio-Channels': String(stream.channels),
        })
        let wrote = false
        for await (const chunk of stream.chunks) {
          if (controller.signal.aborted || res.destroyed) break
          if (!chunk || !chunk.length) continue
          wrote = true
          if (!res.write(Buffer.from(chunk))) await new Promise((resolve) => res.once('drain', resolve))
        }
        if (!res.destroyed) res.end()
        if (!wrote && !res.destroyed) logger('dsh-chatty: TTS returned no audio')
      } catch (error) {
        if (!res.headersSent) {
          writeJson(res, controller.signal.aborted ? 499 : 502, {
            ok: false,
            error: { code: error && error.code || (controller.signal.aborted ? 'cancelled' : 'tts'), message: String(error && error.message || error) },
          })
        } else if (!res.destroyed) res.destroy(error)
      } finally { clearTimeout(timer) }
    },
  }), 'dsh-chatty: /tts/synthesize route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-chatty/tts/voices',
    handler: async (req, res) => {
      if (req.method !== 'GET') { writeJson(res, 405, { ok: false, error: { code: 'method', message: 'GET only' } }); return }
      const cfg = live()
      try {
        const provider = makeTtsProvider(cfg.tts.provider, cfg)
        const voices = await provider.listVoices({ signal: AbortSignal.timeout(Math.min(cfg.timeout_ms, 15000)) })
        writeJson(res, 200, { ok: true, voices })
      } catch (error) {
        writeJson(res, 200, { ok: true, voices: STATIC_VOICES.filter((item) => item.provider === cfg.tts.provider), warning: String(error && error.message || error) })
      }
    },
  }), 'dsh-chatty: /tts/voices route')

  // ── Speech：自动朗读事件流 / 手动朗读 / 打断 ─────────────────────────
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-chatty/speech/events',
    handler: async (req, res) => {
      if (req.method !== 'GET') { writeJson(res, 405, { ok: false, error: { code: 'method', message: 'GET only' } }); return }
      const url = new URL(req.url || '/dsh-chatty/speech/events', 'http://127.0.0.1')
      const sessionId = String(url.searchParams.get('sessionId') || '')
      if (!sessionId || sessionId.length > 200) { writeJson(res, 400, { ok: false, error: { code: 'session', message: 'valid sessionId required' } }); return }
      writeSseHead(res)
      const client = { sessionId, res }
      speechClients.add(client)
      const timer = setInterval(() => { try { res.write(': keepalive\n\n') } catch { /* closed */ } }, 15000)
      req.on('close', () => { clearInterval(timer); speechClients.delete(client) })
    },
  }), 'dsh-chatty: /speech/events route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-chatty/speech/render',
    handler: async (req, res) => {
      if (req.method !== 'POST') { writeJson(res, 405, { ok: false, error: { code: 'method', message: 'POST only' } }); return }
      if (!isTrustedCaller(req)) { writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'forbidden source origin' } }); return }
      let raw
      try { raw = await readBody(req, 1024 * 1024) } catch (error) {
        writeJson(res, 400, { ok: false, error: { code: 'body', message: error.message } }); return
      }
      const payload = parseJsonBody(raw)
      const sessionId = String(payload.sessionId || '')
      const markdown = typeof payload.markdown === 'string' && payload.markdown
        ? payload.markdown
        : (lastReply.get(sessionId)?.text || '')
      if (!markdown.trim()) { writeJson(res, 200, { ok: true, segments: [], empty: true }); return }
      try {
        const segments = await pipeline.render(sessionId || 'default', markdown)
        writeJson(res, 200, { ok: true, segments })
      } catch (error) {
        writeJson(res, 502, { ok: false, error: { code: 'speech', message: String(error && error.message || error) } })
      }
    },
  }), 'dsh-chatty: /speech/render route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-chatty/speech/stop',
    handler: async (req, res) => {
      if (req.method !== 'POST') { writeJson(res, 405, { ok: false, error: { code: 'method', message: 'POST only' } }); return }
      if (!isTrustedCaller(req)) { writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'forbidden source origin' } }); return }
      let raw
      try { raw = await readBody(req, 64 * 1024) } catch (error) {
        writeJson(res, 400, { ok: false, error: { code: 'body', message: error.message } }); return
      }
      const payload = parseJsonBody(raw)
      const sessionId = String(payload.sessionId || 'default')
      const removed = pipeline.cancel(sessionId)
      writeJson(res, 200, { ok: true, removed, generation: pipeline.queueFor(sessionId).generation() })
    },
  }), 'dsh-chatty: /speech/stop route')

  // ── 语音对话模式：运行时开关（Voice Bar 🗣 切换，不持久化） ───────────
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-chatty/voice-chat',
    handler: async (req, res) => {
      if (req.method !== 'POST') { writeJson(res, 405, { ok: false, error: { code: 'method', message: 'POST only' } }); return }
      if (!isTrustedCaller(req)) { writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'forbidden source origin' } }); return }
      let raw
      try { raw = await readBody(req, 16 * 1024) } catch (error) {
        writeJson(res, 400, { ok: false, error: { code: 'body', message: error.message } }); return
      }
      const payload = parseJsonBody(raw)
      hostState.voiceChat = payload.enabled === true
      writeJson(res, 200, { ok: true, voice_chat: hostState.voiceChat })
    },
  }), 'dsh-chatty: /voice-chat route')

  // ── 工具：把音频文件转写成文本 ───────────────────────────────────────
  ctx.tools.register(defineTool({
    name: 'transcribe_audio',
    description:
      'Recognize speech in an audio file and return the transcript as text. '
      + 'Uses the dsh-chatty STT provider configuration (Volcano or SiliconFlow). '
      + 'Use for voice messages, recordings and interviews.',
    parameters: {
      file_path: { type: 'string', required: true, description: 'Absolute path to the audio file (wav, mp3, m4a, ogg, flac, webm).' },
      language: { type: 'string', description: 'Recognition language code, e.g. zh-CN. Default: the configured language.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          provider: { type: 'string' },
          text: { type: 'string' },
          tookMs: { type: 'integer' },
        },
      },
      render(args, value) {
        const body = value.text.length > 4000 ? `${value.text.slice(0, 4000)}\n…[truncated ${value.text.length} chars]` : value.text
        return [{ type: 'text', text: `transcribe_audio (${value.provider}, ${value.tookMs}ms):\n${body}` }]
      },
    },
    isConcurrencySafe: () => false,
    timeoutMs: 365000,
    async execute(args, exec) {
      const cfg = live()
      const filePath = String(args.file_path || '').trim()
      if (!filePath) throw new Error('transcribe_audio: file_path is required')
      const info = await stat(filePath).catch(() => null)
      if (!info) throw new Error(`transcribe_audio: file not found: ${filePath}`)
      if (info.size > cfg.max_audio_bytes) {
        throw new Error(`transcribe_audio: file too large (${info.size} bytes, max ${cfg.max_audio_bytes})`)
      }
      const bytes = await readFile(filePath)
      const mimeType = MIME_BY_EXT[path.extname(filePath).toLowerCase()] || mimeForFormat(sniffAudioFormat(bytes))
      return transcribeBatch(cfg, bytes, mimeType, args.language, '', exec.signal)
    },
  }))

  // ── 清理 ────────────────────────────────────────────────────────────
  ctx.effect(() => () => {
    for (const session of sttSessions.values()) {
      try { session.stream.cancel() } catch { /* 已经结束 */ }
      for (const client of session.clients) { try { client.end() } catch { /* closed */ } }
    }
    sttSessions.clear()
    for (const client of speechClients) { try { client.res.end() } catch { /* closed */ } }
    speechClients.clear()
    pipeline.reset()
    drafts.clear()
    lastReply.clear()
    turnBySession.clear()
  }, 'dsh-chatty: release streams')
}

function mimeForFormat(format) {
  switch (format) {
    case 'wav': return 'audio/wav'
    case 'mp3': return 'audio/mpeg'
    case 'ogg': return 'audio/ogg'
    case 'webm': return 'audio/webm'
    case 'pcm': return 'audio/L16'
    default: return 'application/octet-stream'
  }
}
