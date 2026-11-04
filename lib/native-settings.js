import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { normalizeCommandText, DEFAULT_COMMANDS } from './command-parser.js'
import { toCredentialRef } from './credential-name.js'

export const unpack = (v) =>
  v && typeof v.get === 'function'
    ? unpack(v.get())
    : Array.isArray(v)
      ? v.map(unpack)
      : v && typeof v === 'object'
        ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, unpack(x)]))
        : v
export const token = (v) =>
  createHash('sha256').update(JSON.stringify(v)).digest('hex')
export const valueAt = (o, p) => p.split('.').reduce((v, k) => v?.[k], o)
export function projectFields(raw, fields) {
  const out = {}
  for (const f of fields) {
    let v = valueAt(raw, f.path)
    if (f.path === 'ui.visualizer' && v === 'wave') v = 'bars'
    if (v !== undefined) editPath(out, f.path, v)
  }
  return out
}
export function editPath(raw, p, value, unset = false) {
  const parts = Array.isArray(p) ? p : p.split('.')
  if (
    !parts.length ||
    parts.some(
      (k) =>
        typeof k !== 'string' ||
        ['__proto__', 'prototype', 'constructor'].includes(k)
    )
  )
    throw Error('非法路径')
  let node = raw
  for (const k of parts.slice(0, -1)) node = node[k] ||= {}
  if (unset) delete node[parts.at(-1)]
  else node[parts.at(-1)] = structuredClone(value)
}
export function fieldsOf(schema, prefix = '') {
  if (schema?.refs) {
    const refs = schema.refs
    const expand = (id, seen = new Set()) => {
      if (seen.has(id)) return {}
      const n = refs[id]
      if (!n) return {}
      const next = new Set([...seen, id])
      return {
        ...n,
        ...(n.dict
          ? {
              dict: Object.fromEntries(
                Object.entries(n.dict).map(([k, v]) => [k, expand(v, next)])
              )
            }
          : {}),
        ...(n.list ? { list: n.list.map((v) => expand(v, next)) } : {}),
        ...(n.inner ? { inner: expand(n.inner, next) } : {})
      }
    }
    schema = expand(schema.uid)
  }
  if (schema?.type === 'object' && schema.dict)
    return Object.entries(schema.dict).flatMap(([k, v]) =>
      fieldsOf(v, prefix ? prefix + '.' + k : k)
    )
  return [
    {
      path: prefix,
      label: schema?.meta?.description || prefix,
      type: schema?.type,
      default: schema?.meta?.default,
      schema
    }
  ]
}
export function validateCommands(config) {
  const seen = new Set()
  const commands = config.voice_control?.commands || DEFAULT_COMMANDS
  for (const [action, phrases] of Object.entries(commands)) {
    if (!Object.hasOwn(DEFAULT_COMMANDS, action) || !Array.isArray(phrases))
      throw Error('未知口令动作／词表')
    for (const phrase of phrases) {
      if (typeof phrase !== 'string') throw Error('口令必须是文字')
      const key = normalizeCommandText(phrase)
      if (!key || seen.has(key)) throw Error('口令为空或重复：' + phrase)
      seen.add(key)
    }
  }
}
export function validateEnhanced(config) {
  validateCommands(config)
  for (const field of [
    'stt.providers.volcano.batch_url',
    'stt.providers.volcano.stream_url',
    'stt.providers.siliconflow.base_url',
    'tts.providers.volcano.base_url',
    'tts.providers.siliconflow.base_url',
    'polish.base_url'
  ]) {
    const value = valueAt(config, field)
    if (!value) continue
    let url
    try {
      url = new URL(value)
    } catch {
      throw Error('端点不是有效 URL：' + field)
    }
    const protocols = field.startsWith('stt.providers.volcano')
      ? ['wss:', 'ws:']
      : ['https:', 'http:']
    if (
      !protocols.includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw Error('端点协议不支持，或含有凭据／查询参数：' + field)
    if (
      ['http:', 'ws:'].includes(url.protocol) &&
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    )
      throw Error('远程端点必须使用加密连接')
  }
  for (const field of [
    'stt.providers.volcano.credential',
    'stt.providers.siliconflow.credential',
    'tts.providers.volcano.credential',
    'tts.providers.siliconflow.credential',
    'polish.key_env'
  ]) {
    const ref = valueAt(config, field)
    if (ref && !toCredentialRef(ref)) throw Error('凭据引用名无效')
  }
}
export function migrationOf(raw, official = {}, resolutions = {}) {
  const next = structuredClone(raw)
  const changes = []
  const conflicts = []
  const visible = (value) => {
    if (typeof value === 'string') {
      try {
        const u = new URL(value)
        if (['http:', 'https:', 'ws:', 'wss:'].includes(u.protocol)) {
          u.username = ''
          u.password = ''
          u.search = ''
          return u.href
        }
      } catch {}
      return value.slice(0, 200)
    }
    if (Array.isArray(value)) return value.map(visible)
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, visible(v)])
      )
    return value
  }
  const conflict = (old, target, choices, suffix = '', values = {}) => {
    const id = old + (suffix ? ':' + suffix : '')
    conflicts.push({
      id,
      old,
      target,
      choices,
      oldValue: visible(values.oldValue ?? valueAt(raw, old)),
      newValue: visible(values.newValue ?? valueAt(raw, target))
    })
    return resolutions[id]
  }
  const remove = (old) => {
    if (valueAt(next, old) !== undefined) {
      editPath(next, old, null, true)
      changes.push({ old, target: '清理失效字段' })
    }
  }
  const move = (old, target) => {
    const v = valueAt(next, old)
    if (v === undefined) return
    if (
      valueAt(next, target) !== undefined &&
      token(valueAt(next, target)) !== token(v)
    ) {
      if (conflict(old, target, ['保留新字段', '采用旧字段']) === '采用旧字段')
        editPath(next, target, v)
    } else editPath(next, target, v)
    remove(old)
    changes.push({ old, target })
  }
  const legacyStt = [
    'model',
    'credential',
    'base_url',
    'resource_id',
    'stream_url'
  ].some((k) => raw.stt?.[k] !== undefined)
  const p = raw.stt?.provider || (legacyStt ? 'volcano' : undefined)
  if (['volcano', 'siliconflow'].includes(p))
    for (const [a, b] of Object.entries({
      model: 'model',
      credential: 'credential',
      base_url: 'base_url',
      resource_id: 'resource_id',
      stream_url: p === 'volcano' ? 'batch_url' : 'stream_url'
    })) {
      const old = 'stt.' + a
      if (p === 'siliconflow' && ['resource_id', 'stream_url'].includes(a)) {
        if (valueAt(raw, old) !== undefined)
          conflict(old, '供应商不支持该字段', ['确认清理'])
        remove(old)
        continue
      }
      if (p === 'volcano' && a === 'base_url') {
        if (valueAt(raw, old) !== undefined)
          conflict(old, 'Agent Plan 不使用旧 HTTP base_url', ['确认清理'])
        remove(old)
        continue
      }
      if (
        p === 'volcano' &&
        a === 'stream_url' &&
        valueAt(raw, old) !== undefined
      ) {
        const url = valueAt(raw, old)
        if (typeof url !== 'string') {
          conflict(old, '无效旧地址', ['确认清理'])
          remove(old)
          continue
        }
        if (url.endsWith('/bigmodel_async')) {
          move(old, 'stt.providers.volcano.stream_url')
          continue
        }
        if (!url.endsWith('/bigmodel_nostream')) {
          const choice = conflict(
            old,
            '自定义旧 WebSocket 的用途',
            ['作为完整句端点', '作为实时端点'],
            'purpose'
          )
          const target =
            'stt.providers.volcano.' +
            (choice === '作为实时端点' ? 'stream_url' : 'batch_url')
          const existing = raw.stt?.providers?.volcano || {}
          let overwrite = '采用旧地址'
          if (
            [existing.batch_url, existing.stream_url].some(
              (v) => v !== undefined && v !== url
            )
          )
            overwrite = conflict(
              old,
              '所选用途已有新地址时',
              ['保留目标已有地址', '采用旧地址'],
              'address',
              {
                newValue: {
                  batch_url: existing.batch_url,
                  stream_url: existing.stream_url
                }
              }
            )
          if (valueAt(next, target) === undefined || overwrite === '采用旧地址')
            editPath(next, target, url)
          remove(old)
          changes.push({ old, target })
          continue
        }
      }
      move(old, 'stt.providers.' + p + '.' + b)
    }
  if (p && !['volcano', 'siliconflow'].includes(p))
    for (const key of [
      'model',
      'credential',
      'base_url',
      'resource_id',
      'stream_url'
    ]) {
      if (raw.stt?.[key] !== undefined)
        conflict('stt.' + key, '旧服务无法映射', ['确认清理'])
      remove('stt.' + key)
    }
  const t = raw.tts?.provider || 'volcano'
  if (['volcano', 'siliconflow'].includes(t))
    for (const [a, b] of Object.entries({
      model: 'model',
      voice: 'voice',
      credential: 'credential',
      stream_url: 'base_url',
      resource_id: 'resource_id'
    })) {
      if (
        (t === 'volcano' && a === 'model') ||
        (t === 'siliconflow' && a === 'resource_id')
      ) {
        remove('tts.' + a)
        continue
      }
      move('tts.' + a, 'tts.providers.' + t + '.' + b)
    }
  if (raw.stt?.continuous_listening === true) {
    const choice = conflict('stt.continuous_listening', 'stt.auto_start', [
      '保持关闭',
      '启用自动开麦'
    ])
    editPath(next, 'stt.auto_start', choice === '启用自动开麦')
    remove('stt.continuous_listening')
  } else move('stt.continuous_listening', 'stt.auto_start')
  for (const [a, b] of Object.entries({
    polishBaseUrl: 'base_url',
    polishProvider: 'provider',
    polishModelId: 'model_id',
    polishKeyEnv: 'key_env'
  }))
    move(a, 'polish.' + b)
  if (raw.ui?.show_partial === false || raw.stt?.partial_preview === false)
    editPath(next, 'stt.partial_preview', false)
  if (next.ui?.visualizer === 'wave') {
    next.ui.visualizer = 'bars'
    changes.push({ old: 'ui.visualizer=wave', target: 'bars' })
  }
  for (const old of [
    'stt.provider',
    'stt.language',
    'stt.wake_word',
    'draft.auto_send',
    'ui.show_partial',
    'max_audio_bytes',
    'voiceChat',
    'tts.voice_chat',
    'tts.app_id_credential',
    'tts.cluster',
    'tts.providers.volcano.model',
    'tts.providers.siliconflow.resource_id'
  ])
    remove(old)
  const language =
    { 'zh-CN': 'zh', 'en-US': 'en' }[raw.stt?.language] || raw.stt?.language
  const selection = ['volcano', 'siliconflow'].includes(p)
    ? { defaultProvider: 'chatty-' + p, ...(language ? { language } : {}) }
    : language
      ? { language }
      : {}
  if (p && !['volcano', 'siliconflow'].includes(p))
    conflict('stt.provider', '旧服务无法映射', ['保留官方选择'])
  for (const [key, v] of Object.entries(selection))
    if (official[key] !== undefined && official[key] !== v) {
      const choice = conflict(
        'selection.' + key,
        '官方已有选择',
        ['保留官方选择', '采用旧选择'],
        '',
        { oldValue: v, newValue: official[key] }
      )
      if (choice !== '采用旧选择') selection[key] = official[key]
    }
  if (raw.max_audio_bytes !== undefined)
    conflict('max_audio_bytes', '采用官方音频上限', ['采用官方上限'])
  return { next, selection, changes, conflicts }
}
export function createSettingsBridge({ ctx, schema, home, live, active }) {
  const names = {
    chatty: '@irvingzhang0512/dsh-chatty',
    speech: '@deepseek-ai/dsh-experimental-speech-to-text',
    api: '@deepseek-ai/dsh-experimental-api-speech-to-text',
    sensevoice: '@deepseek-ai/dsh-experimental-speech-to-text-sensevoice'
  }
  const editor = ctx.get('configEditor')
  const getRows = () => editor?.configuration() || []
  const find = (owner) => {
    const rows = getRows().filter((r) => r.entry.options.name === names[owner])
    if (rows.length !== 1) throw Error('配置所有者不可用或不唯一：' + owner)
    return rows[0]
  }
  const getSchema = (row) => row.entry.fiber?.runtime?.Config
  function describe() {
    return Object.keys(names).flatMap((owner) => {
      let r
      try {
        r = find(owner)
      } catch {
        return []
      }
      const ownSchema = owner === 'chatty' ? schema : getSchema(r)
      const fields = ownSchema ? fieldsOf(ownSchema.toJSON()) : []
      const eff = projectFields(unpack(r.entry.fiber?.config || {}), fields)
      return [
        {
          owner,
          entryId: r.entry.options.id,
          effective: eff,
          user: known(r.override, fields),
          base: known(r.inherited, fields),
          writable: !!editor && !!ownSchema,
          unavailableReason: ownSchema
            ? null
            : '配置所有者未加载，请先启用官方模块',
          revisionToken: token([r.entry.options.config || {}, r.inherited]),
          fields,
          applies:
            owner === 'chatty' || owner === 'speech' ? '下次任务' : '重载所有者'
        }
      ]
    })
  }
  function known(raw, fields) {
    return Object.fromEntries(
      fields
        .map((f) => [f.path, valueAt(raw, f.path)])
        .filter(([, v]) => v !== undefined && !v?.__jsExpr)
    )
  }
  async function save(p) {
    const row = find(p.owner)
    if (p.owner !== 'chatty' && !getSchema(row)) throw Error('配置所有者未加载')
    if (row.entry.options.id !== p.entryId) throw Error('配置条目已变化')
    const fields = fieldsOf(
      (p.owner === 'chatty' ? schema : getSchema(row))?.toJSON()
    )
    const allowed = new Set(fields.map((f) => f.path))
    const ops = p.operations
    if (!Array.isArray(ops) || ops.length > 256) throw Error('非法写入操作')
    if (p.owner === 'sensevoice' && ops.some((op) => op.path === 'providerId'))
      return renameProvider(p)
    if (active() && p.owner !== 'chatty' && p.owner !== 'speech')
      throw Error('请先停止语音任务再重载参数')
    await editor.edit(row.entry, (current, inherited) => {
      if (token([current, inherited]) !== p.expectedRevisionToken) {
        const e = Error('配置已被其他操作修改，请重新加载')
        e.status = 409
        throw e
      }
      const next = structuredClone(current)
      for (const op of ops) {
        if (
          !['set', 'unset'].includes(op.op) ||
          !allowed.has(op.path) ||
          op.value?.__jsExpr
        )
          throw Error('禁止修改未列配置或表达式')
        if (op.op === 'unset') {
          const v = valueAt(inherited, op.path)
          editPath(next, op.path, v, v === undefined)
        } else editPath(next, op.path, op.value)
      }
      if (p.owner === 'chatty') {
        const valid = unpack(schema(next))
        validateEnhanced(valid)
      }
      if (p.owner === 'speech') {
        const registry = ctx.get('speechToText')
        const selected = next.defaultProvider || inherited.defaultProvider
        const language = next.language || inherited.language || 'auto'
        if (
          !registry
            ?.listProviders()
            .some(
              (info) =>
                info.id === selected && info.languages.includes(language)
            )
        )
          throw Error('识别服务或语言组合不支持')
      }
      return next
    })
    return describe()
  }
  const dir = path.join(home, 'chatty', 'configuration-backups')
  async function transaction(rows, targets) {
    const backupId = randomUUID(),
      file = path.join(dir, backupId + '.json')
    await mkdir(dir, { recursive: true, mode: 0o700 })
    let originalFile
    try {
      originalFile = (await readFile(editor.documentPath)).toString('base64')
    } catch {}
    const backup = {
      schemaVersion: 1,
      profile: editor.documentPath,
      createdAt: new Date().toISOString(),
      originalFile,
      rows,
      state: 'prepared'
    }
    const journal = () =>
      writeFile(file, JSON.stringify(backup, null, 2), { mode: 0o600 })
    await writeFile(file, JSON.stringify(backup, null, 2), {
      mode: 0o600,
      flag: 'wx'
    })
    const applied = []
    try {
      for (const item of rows) {
        const row = find(item.owner)
        await editor.edit(row.entry, (raw, inherited) => {
          if (
            token(raw) !== token(item.before) ||
            (item.inherited && token(inherited) !== item.inherited)
          )
            throw Error('配置已变化，请重新预览')
          return targets[item.owner]
        })
        applied.push(item)
      }
      backup.state = 'applied'
      await journal()
    } catch (error) {
      const failures = []
      for (const item of applied.reverse()) {
        try {
          await editor.edit(find(item.owner).entry, (raw) => {
            if (token(raw) !== item.after) throw Error('回滚有并发冲突')
            return item.before
          })
        } catch (e) {
          failures.push(item.owner + ': ' + e.message)
        }
      }
      backup.state = failures.length ? 'rollback-conflict' : 'rolled-back'
      backup.failure = String(error.message)
      backup.rollbackFailures = failures
      await journal()
      throw Error(
        error.message +
          (failures.length
            ? '；回滚未完成：' + failures.join('；')
            : '；已回滚') +
          '；备份 ' +
          backupId
      )
    }
    return backupId
  }
  async function renameProvider(p) {
    if (active()) throw Error('请先停止语音任务再更改本地服务标识')
    const local = find('sensevoice'),
      speech = find('speech')
    const current = unpack(local.entry.fiber.effectiveConfig).providerId
    const op = p.operations.find((o) => o.path === 'providerId')
    const nextId =
      op.op === 'unset'
        ? valueAt(local.inherited, 'providerId') || 'sensevoice-local'
        : op.value
    if (typeof nextId !== 'string' || !nextId.trim() || nextId.length > 200)
      throw Error('本地服务标识不合法')
    if (
      nextId !== current &&
      ctx
        .get('speechToText')
        ?.listProviders()
        .some((info) => info.id === nextId)
    )
      throw Error('服务标识已被占用')
    const references = []
    const inspect = (value, prefix) => {
      if (value === current) references.push(prefix)
      else if (value && typeof value === 'object')
        for (const [key, child] of Object.entries(value))
          inspect(child, prefix + '.' + key)
    }
    if (nextId !== current)
      for (const row of getRows()) {
        if (row.entry !== local.entry && row.entry !== speech.entry)
          inspect(row.entry.options.config, row.entry.options.id)
      }
    if (references.length)
      throw Error(
        '其他配置仍引用该服务 ID，请先由其所有者处理：' + references.join('、')
      )
    if (
      token([local.entry.options.config || {}, local.inherited]) !==
      p.expectedRevisionToken
    )
      throw Error('配置已变化，请重新加载')
    const beforeLocal = structuredClone(local.entry.options.config),
      beforeSpeech = structuredClone(speech.entry.options.config)
    const nextLocal = structuredClone(beforeLocal)
    for (const item of p.operations) {
      if (
        !fieldsOf(getSchema(local).toJSON()).some((f) => f.path === item.path)
      )
        throw Error('未列字段')
      if (item.op === 'unset') {
        const v = valueAt(local.inherited, item.path)
        editPath(nextLocal, item.path, v, v === undefined)
      } else if (item.op === 'set') editPath(nextLocal, item.path, item.value)
      else throw Error('非法操作')
    }
    const nextSpeech = { ...beforeSpeech }
    if (ctx.get('speechToText').snapshot().selection.providerId === current)
      nextSpeech.defaultProvider = nextId
    const rows = [
      {
        owner: 'sensevoice',
        before: beforeLocal,
        after: token(nextLocal),
        inherited: token(local.inherited)
      },
      {
        owner: 'speech',
        before: beforeSpeech,
        after: token(nextSpeech),
        inherited: token(speech.inherited)
      }
    ]
    await transaction(rows, { sensevoice: nextLocal, speech: nextSpeech })
    return describe()
  }
  async function migration(p = {}) {
    if (active()) throw Error('请先停止听写、播放和准备任务')
    const row = find('chatty')
    const speech = find('speech')
    const preview = migrationOf(
      row.entry.options.config || {},
      speech.override,
      p.resolutions
    )
    const revisionToken = token([
      row.entry.options.config,
      row.inherited,
      speech.entry.options.config,
      speech.inherited
    ])
    if (p.action === 'list') {
      const files = await readdir(dir).catch(() => [])
      return {
        backups: await Promise.all(
          files
            .filter((n) => /^[a-f0-9-]{36}\.json$/.test(n))
            .map(async (n) => {
              const b = JSON.parse(await readFile(path.join(dir, n), 'utf8'))
              return {
                id: n.slice(0, -5),
                createdAt: b.createdAt,
                state: b.state,
                owners: b.rows.map((r) => r.owner)
              }
            })
        )
      }
    }
    if (!p.action || p.action === 'preview')
      return {
        changes: preview.changes,
        conflicts: preview.conflicts,
        revisionToken
      }
    if (p.action === 'restore') {
      if (!/^[a-f0-9-]{36}$/.test(p.backupId || '')) throw Error('无效备份')
      const backup = JSON.parse(
        await readFile(path.join(dir, p.backupId + '.json'), 'utf8')
      )
      if (backup.profile !== editor.documentPath)
        throw Error('备份不属于当前 Profile')
      if (backup.state === 'restored' || backup.state === 'rolled-back')
        return { restored: true }
      for (const item of backup.rows)
        if (token(find(item.owner).entry.options.config) !== item.after)
          throw Error('配置已变，不能覆盖恢复：' + item.owner)
      const restoreRows = backup.rows.map((item) => ({
        owner: item.owner,
        before: structuredClone(find(item.owner).entry.options.config),
        after: token(item.before)
      }))
      const recoveryBackupId = await transaction(
        restoreRows,
        Object.fromEntries(backup.rows.map((item) => [item.owner, item.before]))
      )
      backup.state = 'restored'
      await writeFile(
        path.join(dir, p.backupId + '.json'),
        JSON.stringify(backup, null, 2),
        { mode: 0o600 }
      )
      return { restored: true, recoveryBackupId }
    }
    if (
      p.action !== 'apply' ||
      preview.conflicts.some((c) => !c.choices.includes(p.resolutions?.[c.id]))
    )
      throw Error('请逐项选择迁移冲突后应用')
    if (revisionToken !== p.revisionToken) throw Error('迁移预览已过期')
    const targetSelection = {
      ...speech.entry.options.config,
      ...preview.selection
    }
    const registry = ctx.get('speechToText')
    if (
      registry &&
      !registry
        .listProviders()
        .some(
          (info) =>
            info.id ===
              (targetSelection.defaultProvider ||
                unpack(speech.entry.fiber.effectiveConfig).defaultProvider) &&
            info.languages.includes(targetSelection.language || 'auto')
        )
    )
      throw Error('迁移后的服务或语言不支持')
    validateEnhanced(unpack(schema(preview.next)))
    const rows = [
      {
        owner: 'speech',
        before: structuredClone(speech.entry.options.config),
        after: token(targetSelection),
        inherited: token(speech.inherited)
      },
      {
        owner: 'chatty',
        before: structuredClone(row.entry.options.config),
        after: token(preview.next),
        inherited: token(row.inherited)
      }
    ]
    const backupId = await transaction(rows, {
      speech: targetSelection,
      chatty: preview.next
    })
    return { applied: true, backupId, changes: preview.changes }
  }
  return { describe, save, migration, live }
}
