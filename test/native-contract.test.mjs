import { test } from 'node:test'
import assert from 'node:assert/strict'
import z from '@deepseek-ai/schemastery'
import { createConfig } from '../lib/config.js'
import { createDraftLedger } from '../lib/draft-ledger.js'
import {
  migrationOf,
  validateEnhanced,
  unpack
} from '../lib/native-settings.js'
function editor(limit = 200) {
  let state = { draft: '手写：', draftRev: 1, occurrences: [], phase: 'plain' }
  const actions = {
    captureInsertion: () => ({
      start: state.draft.length,
      end: state.draft.length,
      draftRev: state.draftRev
    }),
    insertText: (text, span) => {
      if (span.draftRev !== state.draftRev) return false
      state = {
        ...state,
        draft:
          state.draft.slice(0, span.start) + text + state.draft.slice(span.end),
        draftRev: state.draftRev + 1
      }
      return true
    }
  }
  const ledger = createDraftLedger({ actions: () => actions, state, limit })
  return { ledger, get: () => state, receive: () => ledger.receive(state) }
}
test('并发句在自身插入后重定位并保留分隔符，润色后撤销仍只操作语音', () => {
  const e = editor(),
    l = e.ledger
  const a = l.capture(),
    b = l.capture()
  assert.ok(l.insert('第一句', a))
  e.receive()
  assert.ok(l.insert('第二句', b))
  e.receive()
  assert.equal(e.get().draft, '手写：第一句\n第二句')
  const records = l.records()
  assert.ok(
    l.replace('整理后的语音', {
      start: records[0].start,
      end: records[1].end,
      draftRev: e.get().draftRev,
      epoch: l.epoch()
    })
  )
  e.receive()
  assert.equal(l.text(), '整理后的语音')
  assert.ok(l.undo())
  e.receive()
  assert.equal(e.get().draft, '手写：')
})
test('账本超过追踪窗口后拒绝旧锚点，清空保留无法追踪的旧内容', () => {
  const e = editor(1),
    l = e.ledger
  const old = l.capture()
  for (let i = 0; i < 5; i++) {
    assert.ok(l.insert(String(i), l.capture(), ''))
    e.receive()
  }
  assert.equal(l.insert('迟到', old), false)
  assert.ok(l.clear())
  assert.equal(e.get().draft, '手写：0123')
})
test('迁移冲突显式选择，未知字段保留，供应商不支持字段清除后幂等', () => {
  const raw = {
    unknown: { keep: true },
    stt: {
      provider: 'siliconflow',
      language: 'zh-CN',
      stream_url: 'unused',
      resource_id: 'unused',
      continuous_listening: true
    },
    tts: { provider: 'siliconflow', resource_id: 'unused' }
  }
  const p = migrationOf(raw, {
    defaultProvider: 'sensevoice-local',
    language: 'auto'
  })
  assert.ok(p.conflicts.length)
  const resolved = Object.fromEntries(
    p.conflicts.map((c) => [c.id, c.choices[0]])
  )
  const after = migrationOf(
    raw,
    { defaultProvider: 'sensevoice-local', language: 'auto' },
    resolved
  )
  assert.deepEqual(after.selection, {
    defaultProvider: 'sensevoice-local',
    language: 'auto'
  })
  assert.equal(after.next.stt.auto_start, false)
  assert.equal(after.next.stt.stream_url, undefined)
  assert.equal(after.next.tts.resource_id, undefined)
  assert.deepEqual(after.next.unknown, raw.unknown)
  assert.equal(migrationOf(after.next).changes.length, 0)
})
test('严格目标配置校验零值、非法区间、策略、重复口令与带密钥端点', () => {
  const schema = createConfig(z)
  const cfg = unpack(
    schema({ stt: { vad: { pre_roll_ms: 0, min_speech_ms: 0 } } })
  )
  assert.equal(cfg.stt.vad.pre_roll_ms, 0)
  validateEnhanced(cfg)
  assert.throws(() => schema({ ui: { panel_width: -1 } }))
  assert.throws(() => schema({ tts: { renderer: { table: 'unsupported' } } }))
  cfg.polish.base_url = 'https://user:secret@example.com'
  assert.throws(() => validateEnhanced(cfg), /凭据/)
})
test('未显式存旧默认 Provider 的单字段迁移仍有效，async 地址保持实时用途', () => {
  const p = migrationOf({
    stt: {
      credential: 'OLD_KEY',
      stream_url: 'wss://example.com/bigmodel_async',
      base_url: 'https://example.com'
    }
  })
  assert.equal(p.next.stt.providers.volcano.credential, 'OLD_KEY')
  assert.equal(
    p.next.stt.providers.volcano.stream_url,
    'wss://example.com/bigmodel_async'
  )
  assert.equal(p.next.stt.base_url, undefined)
  assert.equal(p.next.stt.providers.volcano.base_url, undefined)
  assert.ok(p.conflicts.some((c) => c.id === 'stt.base_url'))
})
test('自定义旧地址及已有自动监听冲突有唯一 ID，各用途一次选择即可应用', () => {
  const raw = {
    stt: {
      provider: 'volcano',
      stream_url: 'wss://old.example.com/custom',
      providers: {
        volcano: {
          batch_url: 'wss://new.example.com/batch',
          stream_url: 'wss://new.example.com/live'
        }
      },
      continuous_listening: true,
      auto_start: false
    }
  }
  const first = migrationOf(raw)
  assert.equal(
    new Set(first.conflicts.map((c) => c.id)).size,
    first.conflicts.length
  )
  const choices = Object.fromEntries(
    first.conflicts.map((c) => [
      c.id,
      c.id.endsWith(':purpose') ? '作为实时端点' : c.choices.at(-1)
    ])
  )
  const resolved = migrationOf(raw, {}, choices)
  assert.ok(resolved.conflicts.every((c) => c.choices.includes(choices[c.id])))
  assert.equal(
    resolved.next.stt.providers.volcano.stream_url,
    'wss://old.example.com/custom'
  )
  assert.equal(resolved.next.stt.auto_start, true)
})
