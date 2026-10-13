import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { readFile, stat } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import os from 'node:os'
import { AsyncLocalStorage } from 'node:async_hooks'
import { createConfig } from './config.js'
import { validateCompatibility } from './compatibility.js'
import {
  createSettingsBridge,
  unpack,
  migrationOf,
  validateEnhanced,
  fieldsOf,
  projectFields
} from './native-settings.js'
import { createStreamSessions } from './stream-session.js'
import { createBatchCaptures } from './batch-capture.js'
import { createModelCatalog } from './model-catalog.js'
import { createCredentialFile } from './credential-file.js'
import { presentOwner } from './settings-presentation.js'
import { toCredentialRef } from './credential-name.js'
import { createCommandParser } from './command-parser.js'
import {
  writeJson,
  readBody,
  isTrustedCaller,
  writeSseHead,
  writeSse,
  parseJsonBody
} from './http-util.js'
import { parseWavHeader } from './audio.js'
import { createPolishText, createSpeechSummarizer } from './polish.js'
import { createSpeechPipeline } from './pipeline.js'
import { createSttProvider } from './stt/providers.js'
import {
  STATIC_VOICES,
  ttsCapability,
  createTtsProvider
} from './tts/providers.js'
import { createWebSocketImpl } from './ws-client.js'
import { adaptSessionEvent } from './reply-adapter.js'

export const name = 'dsh-chatty'
export const inject = [
  'tools',
  'credentials',
  'webServer',
  'settings',
  'llm',
  'configEditor',
  'pluginPackages',
  'sessions',
  'sessionProjections',
  'agentDefaultModel'
]
export const Config = createConfig(z, { acceptLegacy: true })
const TargetConfig = createConfig(z)
const packageInfo = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8')
)
const compatibilityInfo = JSON.parse(
  readFileSync(new URL('../compatibility.json', import.meta.url), 'utf8')
)

export function apply(ctx, baseConfig) {
  const installedSource = () => {
    try {
      const profile = path.dirname(ctx.get('configEditor').documentPath)
      const manifest = JSON.parse(
        readFileSync(path.join(profile, 'package.json'), 'utf8')
      )
      const source = manifest.dependencies?.[packageInfo.name] || ''
      if (!/^git\+|^https:\/\/github\.com\//.test(source))
        return { kind: 'local', label: '本地开发来源' }
      const url = new URL(source.replace(/^git\+/, ''))
      url.username = ''
      url.password = ''
      url.search = ''
      let commit = url.hash.slice(1).match(/^[a-f0-9]{40}$/)?.[0]
      if (!commit) {
        const lock = readFileSync(
          path.join(profile, 'pnpm-lock.yaml'),
          'utf8'
        ).split('\n')
        const found = []
        for (let i = 0; i < lock.length; i++)
          if (
            lock[i].includes(packageInfo.name + '@') &&
            lock[i].includes('git+')
          ) {
            const match = lock
              .slice(i + 1, i + 5)
              .join('\n')
              .match(/commit:\s*([a-f0-9]{40})/)
            if (match) found.push(match[1])
          }
        if (new Set(found).size === 1) commit = found[0]
      }
      return {
        kind: 'git',
        spec: 'git+' + url.href,
        commit,
        label: 'Git ' + (commit?.slice(0, 12) || url.hash.slice(1) || '未解析')
      }
    } catch {
      return { kind: 'unknown', label: '来源尚未解析' }
    }
  }
  const rawLive = () =>
    projectFields(unpack(baseConfig), fieldsOf(TargetConfig.toJSON()))
  const native = ctx.get('speechToText')
  const remote =
    ctx.get('speechController') &&
    new Proxy(
      {},
      {
        get(_target, key) {
          const service = ctx.get('speechController')
          const value = service?.[key]
          return typeof value === 'function' ? value.bind(service) : value
        }
      }
    )
  const live = () => {
    const cfg = rawLive()
    const selection = native?.snapshot().selection || {}
    return {
      ...cfg,
      stt: {
        ...cfg.stt,
        provider: selection.providerId,
        language: selection.language
      },
      tts: { ...cfg.tts, ...cfg.tts.providers[cfg.tts.provider] }
    }
  }
  const logger = () => {}
  async function resolveKey(ref) {
    if (!ref) return ''
    try {
      const secret = await ctx.credentials.resolve(
        credentialRef(toCredentialRef(ref))
      )
      return secret?.value || ''
    } catch {
      return ''
    }
  }
  const facts = () => {
    const packages = ctx.get('pluginPackages')
    const rows = ctx.get('configEditor')?.entries() || []
    const actual = {}
    let declaredBundles = []
    try {
      declaredBundles = JSON.parse(
        readFileSync(
          path.join(
            path.dirname(ctx.get('configEditor').documentPath),
            'package.json'
          ),
          'utf8'
        )
      ).dsh.profile.bundles
    } catch {}
    for (const pkg of Object.keys(compatibilityInfo.speechPackages)) {
      const entry = rows.find((e) => e.options.name === pkg)
      if (
        !entry &&
        (!pkg.endsWith('voice-input-bundle') || !declaredBundles.includes(pkg))
      )
        continue
      let base =
        entry?.parent?.tree.ctx.baseUrl ||
        ctx.fiber?.entry?.parent?.tree.ctx.baseUrl
      try {
        actual[pkg] = base ? packages.packageOf(pkg, base)?.version : undefined
      } catch {}
    }
    let dshVersion
    try {
      dshVersion = JSON.parse(
        readFileSync(ctx.get('profileContext').installAnchor, 'utf8')
      ).version
    } catch {}
    const { reasons } = validateCompatibility(packageInfo, compatibilityInfo, {
      dshVersion,
      speechPackages: actual
    })
    return {
      matched: !reasons.length,
      target: compatibilityInfo,
      actual: {
        speechPackages: actual,
        dshVersion,
        chattyVersion: packageInfo.version,
        source: installedSource()
      },
      reasons
    }
  }
  const compatibility = facts()
  if (!native || !remote) {
    compatibility.matched = false
    compatibility.reasons.push(
      '官方识别服务尚未加载，请完成 Bundle 安装后重新启用 Chatty'
    )
  }
  const refreshCompatibility = () => {
    Object.assign(compatibility, facts())
    if (
      !ctx.get('speechToText') ||
      !ctx.get('speechController') ||
      !['chatty-volcano','chatty-siliconflow'].every(id=>ctx.get('speechToText').listProviders().some(p=>p.id===id))
    ) {
      compatibility.matched = false
      compatibility.reasons.push(
        '官方识别服务未加载或已重载，请重新启用 Chatty'
      )
    }
    return compatibility
  }
  ctx.effect(() => ctx.settings.configure?.({ auto: false }) || (() => {}))
  const needsMigration = () => {
    const row = ctx
      .get('configEditor')
      ?.configuration()
      .find((r) => r.entry.options.name === packageInfo.name)
    return migrationOf(row?.entry.options.config || {}).changes.length > 0
  }
  const requireReady = () => {
    refreshCompatibility()
    if (needsMigration()) throw Error('请先在高级设置预览并迁移旧配置')
    try {
      validateEnhanced(unpack(TargetConfig(rawLive())))
    } catch {
      throw Error('请先在设置卡修正无效配置值')
    }
    if (!compatibility.matched) {
      const error = Error('语音基线不匹配：' + compatibility.reasons.join('；'))
      error.code = 'compatibility'
      throw error
    }
  }
  function makeSttProvider(p, cfg, stream = false) {
    const c = cfg.stt.providers[p]
    if (!c) throw Error('识别服务不支持')
    return createSttProvider(p, {
      config: {
        model: c.model,
        credential: c.credential,
        resourceId: c.resource_id,
        baseUrl: c.base_url,
        streamUrl: stream ? c.stream_url : c.batch_url,
        sampleRate: 16000,
        streamTimeoutMs: cfg.stt.stream_idle_timeout_ms
      },
      resolveKey,
      WebSocketImpl: createWebSocketImpl()
    })
  }
  const pending = new Set()
  const synthesisTasks = new Set()
  const sttScope = new AsyncLocalStorage()
  if (compatibility.matched)
    for (const p of ['volcano', 'siliconflow'])
      ctx.effect(() =>
        native.register({
          info: {
            id: 'chatty-' + p,
            name: p === 'volcano' ? '火山 Agent Plan' : '硅基流动',
            location: 'cloud',
            languages:
              p === 'volcano'
                ? ['auto', 'zh', 'en']
                : ['auto', 'zh', 'en', 'ja', 'ko', 'yue']
          },
          async transcribe(input, signal) {
            const cfg = sttScope.getStore() || live()
            const header = parseWavHeader(input.audio)
            const started = Date.now()
            const out = await makeSttProvider(p, cfg).transcribe({
              audio: input.audio,
              mimeType: 'audio/wav',
              language: input.language,
              signal
            })
            return {
              text: out.text,
              audioSeconds: header
                ? header.dataSize / (header.sampleRate * header.channels * 2)
                : 0,
              inferenceSeconds: (Date.now() - started) / 1000
            }
          }
        })
      )
  const sessionExists = (id) => !!id && !!ctx.sessions.get(id)
  const limits = (providerId) => {
    const cat = remote.catalog()
    const cfg = live()
    const local = ctx
      .get('configEditor')
      .entries()
      .find(
        (e) =>
          e.options.name ===
          '@deepseek-ai/dsh-experimental-speech-to-text-sensevoice'
      )?.fiber?.config
    return {
      maxAudioBytes: Math.min(
        cat.maxAudioBytes,
        ...((providerId || cfg.stt.provider) === unpack(local)?.providerId
          ? [unpack(local).maxAudioBytes]
          : [])
      ),
      maxDurationSeconds: Math.min(
        cat.maxDurationSeconds,
        cfg.stt.max_segment_seconds
      ),
      maxPending: cfg.stt.max_pending,
      timeoutMs: cfg.timeout_ms
    }
  }
  const streams = createStreamSessions({
    sessionExists,
    limits: (p) => ({
      ...limits(p.providerId),
      maxPending: limits().maxPending - captures.active()
    }),
    open: (p, callbacks) => {
      requireReady()
      if (p.providerId !== 'chatty-volcano')
        throw Error('当前服务只支持分句识别')
      const spec = native.resolve({
        audio: new Uint8Array(),
        providerId: p.providerId,
        language: p.language
      })
      void spec
      return makeSttProvider('volcano', live(), true).createStream({
        language: p.language,
        sampleRate: 16000,
        ...callbacks
      })
    }
  })
  const captures = createBatchCaptures({
    snapshot: live,
    resolve: (p) =>
      native.resolve({
        audio: new Uint8Array(),
        providerId: p.providerId,
        language: p.language
      }),
    sessionExists,
    limits: (p) => limits(p?.providerId),
    otherActive: () =>
      streams.count() + [...pending].filter((c) => !c.captureLease).length
  })
  ctx.effect(() =>
    ctx.on(
      'loader/partial-dispose',
      (entry) => {
        if (
          [
            '@deepseek-ai/dsh-experimental-speech-to-text',
            '@deepseek-ai/dsh-experimental-api-speech-to-text',
            '@deepseek-ai/dsh-experimental-speech-to-text-sensevoice'
          ].includes(entry.options.name)
        ) {
          streams.dispose()
          captures.dispose()
          for (const c of pending) c.abort()
        }
      },
      { global: true }
    )
  )
  ctx.effect(() => () => {
    streams.dispose()
    captures.dispose()
    for (const c of pending) c.abort()
    for (const c of synthesisTasks) c.abort()
    pending.clear()
  })
  const bridge = createSettingsBridge({
    ctx,
    schema: TargetConfig,
    home: process.env.DSH_HOME || path.join(os.homedir(), '.dsh'),
    live: rawLive,
    active: () =>
      streams.active() ||
      captures.active() > 0 ||
      pending.size > 0 ||
      synthesisTasks.size > 0 ||
      native
        ?.snapshot()
        .providers.some((p) =>
          [
            'downloading',
            'checking',
            'loading',
            'waking',
            'cancelling'
          ].includes(p.preparation.phase)
        )
  })
  async function transcribe(bytes, selection, signal) {
    requireReady()
    const started = Date.now()
    const out = await remote.transcribe(
      {
        audioBase64: Buffer.from(bytes).toString('base64'),
        providerId: selection.providerId || live().stt.provider,
        language: selection.language || live().stt.language
      },
      signal
    )
    return {
      ...out,
      provider: selection.providerId || live().stt.provider,
      tookMs: Date.now() - started
    }
  }
  function route(suffix, methods, handler) {
    ctx.effect(() =>
      ctx.webServer.register({
        kind: 'exact',
        path: '/dsh-chatty/' + suffix,
        async handler(req, res) {
          if (!methods.includes(req.method)) {
            res.setHeader?.('Allow', methods.join(', '))
            writeJson(res, 405, { ok: false, error: { message: '方法不支持' } })
            return
          }
          if (req.method !== 'GET' && !isTrustedCaller(req)) {
            writeJson(res, 403, { ok: false, error: { message: '来源不可信' } })
            return
          }
          const controller = new AbortController()
          const timer = setTimeout(() => controller.abort(), live().timeout_ms)
          timer.unref?.()
          req.on('aborted', () => controller.abort())
          res.on('close', () => controller.abort())
          try {
            const body =
              req.method === 'GET'
                ? {}
                : parseJsonBody(await readBody(req, 6 * 1024 * 1024))
            const result = await handler(body, req, res, controller.signal)
            if (result !== undefined)
              writeJson(res, 200, { ok: true, ...result })
          } catch (e) {
            if (!res.headersSent)
              writeJson(res, e.status || 400, {
                ok: false,
                error: {
                  code: e.code || 'request',
                  message: String(e.message || e)
                }
              })
          } finally {
            clearTimeout(timer)
          }
        }
      })
    )
  }
  const parser = () => createCommandParser(live().voice_control)
  route('status', ['GET'], () => {
    refreshCompatibility()
    const cfg = live()
    return {
      ...cfg,
      stt: {
        ...cfg.stt,
        capability: {
          streaming: cfg.stt.provider === 'chatty-volcano',
          partialResult: cfg.stt.provider === 'chatty-volcano',
          batch: true
        }
      },
      tts: {
        ...cfg.tts,
        voice_chat: false,
        capability: ttsCapability(cfg.tts.provider)
      },
      compatibility,
      migrationPending: needsMigration(),
      limits: compatibility.matched ? limits() : null,
      catalog: compatibility.matched ? remote.catalog() : null
    }
  })
  route('settings', ['GET', 'POST'], (p) =>
    p.owner
      ? bridge.save(p).then((owners) => ({ owners: owners.map(presentOwner) }))
      : { owners: bridge.describe().map(presentOwner) }
  )
  const modelCatalog = createModelCatalog({
    home: process.env.DSH_HOME || path.join(os.homedir(), '.dsh'),
    getConfig: rawLive, getSpeech: () => remote?.catalog(), llm: ctx.llm, resolveKey,
    getDefaultModel: sessionId => {
      const session=sessionId&&ctx.get('sessions')?.get(sessionId)
      const selection=session&&ctx.get('sessionProjections')?.snapshot(session,['modelSelection']).values.modelSelection?.next
      return selection||ctx.get('agentDefaultModel')?.currentSelection?.()||null
    },
    listVoices: async (provider, target, signal) => createTtsProvider(provider, {
      config: { model: target.model, baseUrl: target.base_url, credential: target.credential }, resolveKey
    }).listVoices({ signal, strict: true })
  })
  ctx.effect(() => () => modelCatalog.dispose())
  route('models/catalog', ['POST'], async (p,req,res,signal) => {
    if (p.refresh) requireReady()
    return { catalog: await modelCatalog.catalog(p, signal) }
  })
  const credentialFile = createCredentialFile({
    locate: async () => {
      const entries = ctx.get('configEditor').configuration().filter(r => r.entry.options.name === '@deepseek-ai/dsh-credentials-local' && !r.entry.options.disabled)
      if (entries.length !== 1) return null
      const { resolveSpec } = await import('@deepseek-ai/dsh-credentials-local')
      return resolveSpec(unpack({ ...entries[0].inherited, ...entries[0].override })).filename
    },
    canOpen: async () => { try { return (await import('@deepseek-ai/dsh-native-command')).canOpenNativePath() } catch { return false } },
    open: async (filename,signal) => (await import('@deepseek-ai/dsh-native-command')).openNativeTextFile(filename,signal)
  })
  route('credentials/file', ['GET','POST'], async (p,req,res,signal) => req.method === 'GET' ? { file: await credentialFile.state() } : credentialFile.openFile(p,signal))
  route('migration', ['POST'], (p) => bridge.migration(p))
  route('speech/prepare', ['POST'], async (p) => {
    requireReady()
    if (p.cancel) await remote.cancelPreparation(p.providerId)
    else await remote.prepare(p.providerId, p.options)
    return { catalog: remote.catalog() }
  })
  route('stt/transcribe', ['POST'], async (p, req, res, signal) => {
    if (!sessionExists(p.sessionId)) throw Error('会话不存在')
    if (
      !p.captureId &&
      pending.size + captures.active() + streams.count() >= limits().maxPending
    )
      throw Error('识别积压已满')
    const lease = p.captureId ? captures.take(p) : null
    const c = lease?.controller || new AbortController()
    c.captureLease = !!lease
    pending.add(c)
    const abort = () => c.abort()
    signal.addEventListener('abort', abort, { once: true })
    try {
      const base64 = p.audioBase64 || p.dataBase64 || '',
        bytes = Buffer.from(base64, 'base64')
      if (bytes.toString('base64') !== base64)
        throw Error('音频必须是标准 base64')
      const wav = lease && parseWavHeader(bytes)
      if (
        lease &&
        (bytes.length > lease.cap.maxAudioBytes ||
          (wav &&
            wav.dataSize / (wav.sampleRate * wav.channels * 2) >
              lease.cap.maxDurationSeconds))
      )
        throw Error('音频超过录音快照上限')
      return await sttScope.run(lease?.config, () =>
        transcribe(
          bytes,
          lease
            ? {
                providerId: lease.spec.provider.info.id,
                language: lease.spec.language
              }
            : p,
          c.signal
        )
      )
    } finally {
      pending.delete(c)
      signal.removeEventListener('abort', abort)
      if (lease) captures.release(lease)
    }
  })
  route('stt/capture/start', ['POST'], (p, req, res, signal) => {
    requireReady()
    if (signal.aborted) throw Error('录音已取消')
    return captures.start(p)
  })
  route('stt/capture/cancel', ['POST'], (p) => captures.cancel(p))
  for (const action of ['start', 'push', 'stop', 'cancel'])
    route('stt/stream/' + action, ['POST'], async (p) => {
      if (action !== 'cancel') requireReady()
      if (
        action === 'start' &&
        !(await resolveKey(live().stt.providers.volcano.credential))
      )
        throw Error('请先配置火山识别凭据')
      return streams[action](p)
    })
  route('stt/stream/events', ['GET'], (p, req, res) => {
    requireReady()
    const id = new URL(req.url, 'http://localhost').searchParams.get('streamId')
    streams.assertActive(id)
    writeSseHead(res)
    const off = streams.subscribe(id, (event) => {
      if (event) writeSse(res, event.kind, event.data)
      else res.end()
    })
    res.on('close', off)
  })
  route('voice-chat', ['POST'], () => {
    const e = Error('语音对话本期暂不启用')
    e.status = 410
    e.code = 'feature_deferred'
    throw e
  })
  route('draft', ['POST'], async (p, req, res, signal) => {
    if (p.action !== 'polish') {
      const e = Error('草稿由原生编辑器管理')
      e.status = 410
      throw e
    }
    if (!sessionExists(p.sessionId)) throw Error('会话不存在')
    return {
      draft: { text: await polishText(String(p.text || ''), p, signal) }
    }
  })
  route('draft/polish', ['POST'], async (p, req, res, signal) => ({
    text: await polishText(String(p.text || ''), p, signal)
  }))
  route('credentials/state', ['GET'], async () => {
    const cfg = live()
    const refs = new Set(
      [
        cfg.stt.providers.volcano.credential,
        cfg.stt.providers.siliconflow.credential,
        cfg.tts.providers.volcano.credential,
        cfg.tts.providers.siliconflow.credential,
        cfg.polish.key_env
      ].filter(Boolean)
    )
    return {
      credentials: await Promise.all(
        [...refs].map(async (ref) => {
          const state=await ctx.credentials.describe(credentialRef(toCredentialRef(ref)))
          return {ref,configured:!!state?.configured,writable:!!state?.writable}
        })
      )
    }
  })
  route('credentials', ['POST'], async (p) => {
    const cfg = live()
    const allowed = [
      cfg.stt.providers.volcano.credential,
      cfg.stt.providers.siliconflow.credential,
      cfg.tts.providers.volcano.credential,
      cfg.tts.providers.siliconflow.credential,
      cfg.polish.key_env
    ]
    if (!allowed.includes(p.ref)) throw Error('不是 Chatty 使用的凭据引用')
    try {
      if (p.unset)
        await ctx.credentials.unset(credentialRef(toCredentialRef(p.ref)))
      else if (typeof p.value === 'string' && p.value.trim())
        await ctx.credentials.set(
          credentialRef(toCredentialRef(p.ref)),
          p.value.trim()
        )
      else throw Error()
      return { saved: true }
    } catch {
      throw Error('凭据保存失败，请检查该引用是否被只读来源覆盖')
    }
  })
  route('config-info', ['GET'], () => ({
    stt: { providers: native?.snapshot().providers || [] },
    tts: { voices: STATIC_VOICES }
  }))
  const speechClients = new Set()
  const lastReply = new Map()
  const turnBySession = new Map()

  const summarizeBlock = createSpeechSummarizer({
    resolveKey,
    getConfig: live,
    llm: ctx.llm,
    createUserMessage,
    getAgentDefaultModel: (sessionId) => {
      const session = ctx.sessions.get(sessionId)
      const selection =
        session &&
        ctx.get('sessionProjections')?.snapshot(session, ['modelSelection'])
          .values.modelSelection?.next
      if (selection) return selection
      const service = ctx.get && ctx.get('agentDefaultModel')
      return service && typeof service.currentSelection === 'function'
        ? service.currentSelection()
        : null
    }
  })

  const pipeline = createSpeechPipeline({
    get policy() {
      return live().tts.renderer
    },
    get codeHint() {
      return live().tts.code_hint
    },
    summarizeBlock: (kind, raw, signal, sessionId) =>
      summarizeBlock(kind, raw, signal, sessionId),
    onSegment(segment, sessionId) {
      for (const client of speechClients) {
        if (client.sessionId !== sessionId) continue
        const turnId = turnBySession.get(sessionId)
        if (client.blockedTurn && client.blockedTurn === turnId) continue
        if (!writeSse(client.res, 'speech.segment', { ...segment, turnId }))
          speechClients.delete(client)
      }
    },
    onEnd(sessionId) {
      for (const client of speechClients) {
        if (client.sessionId !== sessionId) continue
        if (!writeSse(client.res, 'speech.end', { sessionId }))
          speechClients.delete(client)
      }
    },
    onCancel(sessionId, reason) {
      for (const client of speechClients) {
        if (client.sessionId !== sessionId) continue
        if (!writeSse(client.res, 'speech.cancel', { sessionId, reason }))
          speechClients.delete(client)
      }
    }
  })

  const polishText = createPolishText({
    resolveKey,
    getConfig: live,
    llm: ctx.llm,
    createUserMessage,
    getAgentDefaultModel: (sessionId) => {
      const session = ctx.sessions.get(sessionId)
      const selection =
        session &&
        ctx.get('sessionProjections')?.snapshot(session, ['modelSelection'])
          .values.modelSelection?.next
      if (selection) return selection
      const service = ctx.get && ctx.get('agentDefaultModel')
      return service && typeof service.currentSelection === 'function'
        ? service.currentSelection()
        : null
    }
  })

  // Assistant 回复文本 → Speech Buffer → Speech Renderer → Speech Queue。
  //
  // 无论是否开启自动朗读都记录最近一次回复（手动朗读要用），
  // 但只有开启自动朗读 / 语音对话模式（或浏览器订阅了语音事件流）才真正推进流水线。

  const voicePipelineActive = (cfg) => Boolean(cfg.tts.auto_read)
  ctx.effect(
    () =>
      ctx.on(
        'session/event',
        (session, event) => {
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
            const record = lastReply.get(sessionId) || {
              turnId: outgoing.turnId,
              text: ''
            }
            record.text += outgoing.text || ''
            lastReply.set(sessionId, record)
            if (autoRead) pipeline.feed(sessionId, outgoing.text)
          } else if (outgoing.type === 'reply.end') {
            if (autoRead) pipeline.finish(sessionId)
          } else if (outgoing.type === 'reply.cancel') {
            if (autoRead) pipeline.cancel(sessionId)
          }
        },
        { global: true }
      ),
    'dsh-chatty: assistant reply → speech pipeline'
  )

  function makeTtsProvider(providerName, cfg) {
    return createTtsProvider(providerName, {
      config: compactConfig({
        model: cfg.tts.model,
        voice: cfg.tts.voice,
        speed: cfg.tts.speed,
        format: cfg.tts.format,
        sampleRate: cfg.tts.sample_rate,
        baseUrl: cfg.tts.base_url,
        resourceId: cfg.tts.resource_id,
        credential: cfg.tts.credential
      }),
      resolveKey,
      logger,
      // 火山 Agent Plan 单向流式合成同样需要自定义认证头。
      WebSocketImpl: createWebSocketImpl()
    })
  }

  // ── TTS ──────────────────────────────────────────────────────────────
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: '/dsh-chatty/tts/synthesize',
        handler: async (req, res) => {
          if (req.method !== 'POST') {
            writeJson(res, 405, {
              ok: false,
              error: { code: 'method', message: 'POST only' }
            })
            return
          }
          if (!isTrustedCaller(req)) {
            writeJson(res, 403, {
              ok: false,
              error: { code: 'forbidden', message: 'forbidden source origin' }
            })
            return
          }
          requireReady()
          const cfg = live()
          let raw
          try {
            raw = await readBody(req, 256 * 1024)
          } catch (error) {
            writeJson(res, 400, {
              ok: false,
              error: { code: 'body', message: error.message }
            })
            return
          }
          const payload = parseJsonBody(raw)
          const text = String(payload.text || '').trim()
          if (!text) {
            writeJson(res, 400, {
              ok: false,
              error: { code: 'empty', message: 'text required' }
            })
            return
          }
          if (text.length > cfg.tts.max_chars) {
            writeJson(res, 413, {
              ok: false,
              error: {
                code: 'too-long',
                message: `text exceeds ${cfg.tts.max_chars} characters`
              }
            })
            return
          }
          const controller = new AbortController()
          const timer = setTimeout(
            () => controller.abort(),
            Math.max(1000, cfg.timeout_ms)
          )
          synthesisTasks.add(controller)
          req.on('aborted', () => controller.abort())
          res.on('close', () => controller.abort())
          try {
            const provider = makeTtsProvider(cfg.tts.provider, cfg)
            const stream = provider.createStream({
              text,
              voice: String(payload.voice || cfg.tts.voice || ''),
              speed: Number(payload.speed) || cfg.tts.speed,
              format: String(payload.format || cfg.tts.format || 'pcm'),
              signal: controller.signal
            })
            res.writeHead(200, {
              'Content-Type': 'application/octet-stream',
              'Cache-Control': 'no-store',
              'X-Audio-Format': stream.format,
              'X-Audio-Sample-Rate': String(stream.sampleRate),
              'X-Audio-Channels': String(stream.channels)
            })
            let wrote = false
            for await (const chunk of stream.chunks) {
              if (controller.signal.aborted || res.destroyed) break
              if (!chunk || !chunk.length) continue
              wrote = true
              if (!res.write(Buffer.from(chunk)))
                await new Promise((resolve) => res.once('drain', resolve))
            }
            if (!res.destroyed) res.end()
            if (!wrote && !res.destroyed)
              logger('dsh-chatty: TTS returned no audio')
          } catch (error) {
            if (!res.headersSent) {
              writeJson(res, controller.signal.aborted ? 499 : 502, {
                ok: false,
                error: {
                  code:
                    (error && error.code) ||
                    (controller.signal.aborted ? 'cancelled' : 'tts'),
                  message: String((error && error.message) || error)
                }
              })
            } else if (!res.destroyed) res.destroy(error)
          } finally {
            clearTimeout(timer)
            synthesisTasks.delete(controller)
          }
        }
      }),
    'dsh-chatty: /tts/synthesize route'
  )

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: '/dsh-chatty/tts/voices',
        handler: async (req, res) => {
          if (req.method !== 'GET') {
            writeJson(res, 405, {
              ok: false,
              error: { code: 'method', message: 'GET only' }
            })
            return
          }
          requireReady()
          const cfg = live()
          try {
            const provider = makeTtsProvider(cfg.tts.provider, cfg)
            const voices = await provider.listVoices({
              signal: AbortSignal.timeout(Math.min(cfg.timeout_ms, 15000))
            })
            writeJson(res, 200, { ok: true, voices })
          } catch (error) {
            writeJson(res, 200, {
              ok: true,
              voices: STATIC_VOICES.filter(
                (item) => item.provider === cfg.tts.provider
              ),
              warning: String((error && error.message) || error)
            })
          }
        }
      }),
    'dsh-chatty: /tts/voices route'
  )

  // ── Speech：自动朗读事件流 / 手动朗读 / 打断 ─────────────────────────
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: '/dsh-chatty/speech/events',
        handler: async (req, res) => {
          if (req.method !== 'GET') {
            writeJson(res, 405, {
              ok: false,
              error: { code: 'method', message: 'GET only' }
            })
            return
          }
          const url = new URL(
            req.url || '/dsh-chatty/speech/events',
            'http://127.0.0.1'
          )
          const sessionId = String(url.searchParams.get('sessionId') || '')
          if (!sessionId || sessionId.length > 200) {
            writeJson(res, 400, {
              ok: false,
              error: { code: 'session', message: 'valid sessionId required' }
            })
            return
          }
          writeSseHead(res)
          const client = { sessionId, res }
          speechClients.add(client)
          const timer = setInterval(() => {
            try {
              res.write(': keepalive\n\n')
            } catch {
              /* closed */
            }
          }, 15000)
          res.on('close', () => {
            clearInterval(timer)
            speechClients.delete(client)
          })
        }
      }),
    'dsh-chatty: /speech/events route'
  )

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: '/dsh-chatty/speech/render',
        handler: async (req, res) => {
          if (req.method !== 'POST') {
            writeJson(res, 405, {
              ok: false,
              error: { code: 'method', message: 'POST only' }
            })
            return
          }
          if (!isTrustedCaller(req)) {
            writeJson(res, 403, {
              ok: false,
              error: { code: 'forbidden', message: 'forbidden source origin' }
            })
            return
          }
          let raw
          try {
            raw = await readBody(req, 1024 * 1024)
          } catch (error) {
            writeJson(res, 400, {
              ok: false,
              error: { code: 'body', message: error.message }
            })
            return
          }
          const payload = parseJsonBody(raw)
          const sessionId = String(payload.sessionId || '')
          const markdown =
            typeof payload.markdown === 'string' && payload.markdown
              ? payload.markdown
              : lastReply.get(sessionId)?.text ||
                ctx.sessions
                  .get(sessionId)
                  ?.deriveMessages?.()
                  .findLast((m) => m.role === 'assistant')
                  ?.content?.filter((b) => b.type === 'text')
                  .map((b) => b.text)
                  .join('\n') ||
                ''
          if (!markdown.trim()) {
            writeJson(res, 200, { ok: true, segments: [], empty: true })
            return
          }
          try {
            const segments = await pipeline.render(
              sessionId || 'default',
              markdown,
              { emit: false }
            )
            writeJson(res, 200, { ok: true, segments })
          } catch (error) {
            writeJson(res, 502, {
              ok: false,
              error: {
                code: 'speech',
                message: String((error && error.message) || error)
              }
            })
          }
        }
      }),
    'dsh-chatty: /speech/render route'
  )

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: '/dsh-chatty/speech/stop',
        handler: async (req, res) => {
          if (req.method !== 'POST') {
            writeJson(res, 405, {
              ok: false,
              error: { code: 'method', message: 'POST only' }
            })
            return
          }
          if (!isTrustedCaller(req)) {
            writeJson(res, 403, {
              ok: false,
              error: { code: 'forbidden', message: 'forbidden source origin' }
            })
            return
          }
          let raw
          try {
            raw = await readBody(req, 64 * 1024)
          } catch (error) {
            writeJson(res, 400, {
              ok: false,
              error: { code: 'body', message: error.message }
            })
            return
          }
          const payload = parseJsonBody(raw)
          const sessionId = String(payload.sessionId || 'default')
          for (const client of speechClients)
            if (client.sessionId === sessionId)
              client.blockedTurn = turnBySession.get(sessionId)
          const removed = pipeline.cancel(sessionId)
          writeJson(res, 200, {
            ok: true,
            removed,
            generation: pipeline.queueFor(sessionId).generation()
          })
        }
      }),
    'dsh-chatty: /speech/stop route'
  )

  ctx.tools.register(
    defineTool({
      name: 'transcribe_audio',
      description: '使用当前官方识别服务转写完整 WAV 文件。',
      parameters: {
        file_path: {
          type: 'string',
          required: true,
          description: 'WAV 文件绝对路径'
        },
        language: { type: 'string', description: '识别语言' }
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            text: { type: 'string' },
            provider: { type: 'string' },
            tookMs: { type: 'integer' }
          }
        },
        render: (args, value) => [{ type: 'text', text: value.text }]
      },
      isConcurrencySafe: () => false,
      async execute(args, exec) {
        requireReady()
        if (!path.isAbsolute(args.file_path))
          throw Error('WAV 文件必须是绝对路径')
        const info = await stat(args.file_path)
        if (!info.isFile() || info.size > limits().maxAudioBytes)
          throw Error('文件无效或超过音频上限')
        const result = await transcribe(
          await readFile(args.file_path),
          { language: args.language },
          exec.signal
        )
        return {
          text: result.text,
          provider: result.provider,
          tookMs: Math.round(result.tookMs)
        }
      }
    })
  )
  ctx.effect(() => () => {
    for (const client of speechClients) client.res.end()
    speechClients.clear()
    pipeline.reset()
    lastReply.clear()
    turnBySession.clear()
  })
}
