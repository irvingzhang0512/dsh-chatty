import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import z from '@deepseek-ai/schemastery'
import { createConfig } from '../lib/config.js'
import { createSettingsBridge } from '../lib/native-settings.js'
for (const concurrent of [false, true])
  test(
    '迁移第二项失败：' +
      (concurrent ? '并发回滚冲突可见且不覆盖' : '首项回滚并留下事务记录'),
    async () => {
      const home = await fs.mkdtemp(
        path.join(os.tmpdir(), 'chatty-transaction-')
      )
      try {
        const schema = createConfig(z),
          chatty = {
            options: {
              name: '@irvingzhang0512/dsh-chatty',
              id: 'chatty',
              config: { stt: { provider: 'siliconflow' } }
            },
            fiber: { runtime: { Config: schema } }
          },
          speech = {
            options: {
              name: '@deepseek-ai/dsh-experimental-speech-to-text',
              id: 'speech',
              config: { defaultProvider: 'local', language: 'auto' }
            },
            fiber: { config: { defaultProvider: 'local', language: 'auto' } }
          }
        const before = structuredClone(speech.options.config)
        let failed = false
        const editor = {
          documentPath: path.join(home, 'patch.yml'),
          configuration: () =>
            [chatty, speech].map((entry) => ({
              entry,
              inherited: {},
              override: entry.options.config
            })),
          async edit(entry, fn) {
            const next = fn(entry.options.config, {})
            if (entry === chatty && !failed) {
              failed = true
              if (concurrent) speech.options.config.language = 'zh'
              throw Error('模拟第二项持久化失败')
            }
            entry.options.config = next
          }
        }
        const ctx = {
          get: (key) =>
            key === 'configEditor'
              ? editor
              : key === 'speechToText'
                ? {
                    listProviders: () => [
                      { id: 'local', languages: ['auto', 'zh'] },
                      { id: 'chatty-siliconflow', languages: ['auto', 'zh'] }
                    ]
                  }
                : null
        }
        const bridge = createSettingsBridge({
          ctx,
          schema,
          home,
          active: () => false
        })
        const p = await bridge.migration({ action: 'preview' })
        const resolutions = Object.fromEntries(
          p.conflicts.map((c) => [c.id, c.choices.at(-1)])
        )
        await assert.rejects(
          bridge.migration({
            action: 'apply',
            revisionToken: p.revisionToken,
            resolutions
          }),
          concurrent ? /回滚未完成/ : /已回滚/
        )
        if (concurrent) assert.equal(speech.options.config.language, 'zh')
        else assert.deepEqual(speech.options.config, before)
        const file = (
            await fs.readdir(path.join(home, 'chatty/configuration-backups'))
          )[0],
          journal = JSON.parse(
            await fs.readFile(
              path.join(home, 'chatty/configuration-backups', file),
              'utf8'
            )
          )
        assert.equal(
          journal.state,
          concurrent ? 'rollback-conflict' : 'rolled-back'
        )
        assert.deepEqual(chatty.options.config, {
          stt: { provider: 'siliconflow' }
        })
      } finally {
        if (
          path.dirname(home) !== os.tmpdir() ||
          !path.basename(home).startsWith('chatty-transaction-')
        )
          throw Error('测试目录身份错误')
        await fs.rm(home, { recursive: true, force: true })
      }
    }
  )
