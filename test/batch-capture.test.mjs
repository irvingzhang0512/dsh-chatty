import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createBatchCaptures } from '../lib/batch-capture.js'
function fixture() {
  let config = {
    stt: {
      provider: 'cloud',
      language: 'zh',
      providers: { cloud: { model: 'old' } }
    }
  }
  let provider = { info: { id: 'cloud' } }
  const captures = createBatchCaptures({
    snapshot: () => structuredClone(config),
    resolve: (p) => ({ provider, language: p.language || 'zh' }),
    sessionExists: (id) => id === 's',
    limits: () => ({ maxPending: 2, timeoutMs: 10000 })
  })
  return {
    captures,
    changeConfig() {
      config.stt.providers.cloud.model = 'new'
    },
    replaceProvider() {
      provider = { info: { id: 'cloud' } }
    }
  }
}
const identity = {
  sessionId: 's',
  recordingGeneration: 1,
  utteranceId: 'u',
  utteranceSeq: 1
}
test('完整句在开始时冻结参数，重复开始幂等，结束清理预算', () => {
  const f = fixture(),
    started = f.captures.start(identity)
  assert.equal(f.captures.start(identity).captureId, started.captureId)
  f.changeConfig()
  const lease = f.captures.take({
    sessionId: 's',
    captureId: started.captureId
  })
  assert.equal(lease.config.stt.providers.cloud.model, 'old')
  assert.throws(
    () => f.captures.take({ sessionId: 's', captureId: started.captureId }),
    /已提交/
  )
  f.captures.release(lease)
  assert.equal(f.captures.active(), 0)
  assert.throws(() => f.captures.start(identity), /取消/)
  f.captures.dispose()
})
test('取消可以早于开始响应，录音实例替换不偷换服务', () => {
  const f = fixture()
  f.captures.cancel(identity)
  assert.throws(() => f.captures.start(identity), /取消/)
  const start = f.captures.start({ ...identity, utteranceId: 'new' })
  f.replaceProvider()
  assert.throws(
    () => f.captures.take({ sessionId: 's', captureId: start.captureId }),
    /替换/
  )
  f.captures.dispose()
})
test('录音预算包含其它流式任务且超时会释放，中止信号传给识别任务', () => {
  const f = fixture()
  const a = f.captures.start(identity),
    b = f.captures.start({ ...identity, utteranceId: 'b' })
  assert.throws(
    () => f.captures.start({ ...identity, utteranceId: 'c' }),
    /积压/
  )
  const lease = f.captures.take({ sessionId: 's', captureId: a.captureId })
  f.captures.cancel({ captureId: a.captureId })
  assert.equal(lease.controller.signal.aborted, true)
  assert.equal(f.captures.active(), 1)
  f.captures.cancel({ captureId: b.captureId })
  assert.equal(f.captures.active(), 0)
  f.captures.dispose()
})
