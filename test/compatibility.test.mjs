import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  splitChattyVersion,
  compareChattyVersions,
  validateCompatibility
} from '../lib/compatibility.js'
const manifest = JSON.parse(
    fs.readFileSync(new URL('../package.json', import.meta.url))
  ),
  contract = JSON.parse(
    fs.readFileSync(new URL('../compatibility.json', import.meta.url))
  )
test('同基线修订按整数比较，不能忽略构建元数据或跨基线自动更新', () => {
  assert.equal(
    compareChattyVersions('0.2.0-rc.2+rev.10', '0.2.0-rc.2+rev.2'),
    1
  )
  assert.equal(compareChattyVersions(manifest.version, manifest.version), 0)
  assert.throws(
    () => compareChattyVersions('0.2.1+rev.1', manifest.version),
    /基线/
  )
  assert.throws(() => splitChattyVersion('0.2.0-rc.2'))
  assert.throws(() => splitChattyVersion('0.2.0+rev.0'))
})
test('实际包、所有精确 peers、五包与自版本清单必须同时匹配', () => {
  const actual = {
    dshVersion: contract.dshVersion,
    speechPackages: contract.speechPackages
  }
  assert.ok(validateCompatibility(manifest, contract, actual).matched)
  assert.equal(
    validateCompatibility(manifest, contract, {
      ...actual,
      dshVersion: '0.1.5-rc.2'
    }).matched,
    false
  )
  assert.equal(
    validateCompatibility(
      { ...manifest, version: contract.bundleVersion + '+rev.' + (contract.chattyRevision + 1) },
      contract,
      actual
    ).matched,
    false
  )
  assert.equal(
    validateCompatibility(manifest, contract, { ...actual, speechPackages: {} })
      .matched,
    false
  )
  assert.equal(
    validateCompatibility(manifest, { ...contract, speechPackages: {} }, actual)
      .matched,
    false
  )
})
