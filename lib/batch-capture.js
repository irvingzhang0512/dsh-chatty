import { randomUUID } from 'node:crypto'
// 录音开始时固定服务实例和增强参数；正文／音频仍留在客户端。
export function createBatchCaptures({
  snapshot,
  resolve,
  sessionExists,
  limits,
  otherActive = () => 0
}) {
  const active = new Map(),
    cancelled = new Map()
  const key = (p) =>
    JSON.stringify([p.sessionId, p.recordingGeneration, p.utteranceId])
  function start(p) {
    if (
      !sessionExists(p.sessionId) ||
      typeof p.utteranceId !== 'string' ||
      !p.utteranceId ||
      p.utteranceId.length > 200 ||
      !Number.isSafeInteger(p.recordingGeneration) ||
      p.recordingGeneration < 1 ||
      !Number.isSafeInteger(p.utteranceSeq) ||
      p.utteranceSeq < 1
    )
      throw Error('无效录音身份')
    const id = key(p)
    if (cancelled.has(id)) throw Error('录音已取消')
    const existing = [...active.values()].find((s) => s.key === id)
    if (existing) {
      if (
        existing.identity.utteranceSeq !== p.utteranceSeq ||
        existing.identity.providerId !== p.providerId ||
        existing.identity.language !== p.language
      )
        throw Error('录音身份重复但参数不同')
      return {
        captureId: existing.captureId,
        config: existing.config,
        limits: existing.cap,
        duplicate: true
      }
    }
    const cap = limits(p)
    if (active.size + otherActive() >= cap.maxPending)
      throw Error('识别积压已满')
    const config = snapshot(),
      spec = resolve(p),
      captureId = randomUUID()
    config.stt.provider = spec.provider.info.id
    config.stt.language = spec.language
    const s = {
      key: id,
      captureId,
      identity: { ...p },
      config,
      spec,
      cap,
      controller: new AbortController()
    }
    s.timer = setTimeout(() => cancel({ captureId }), cap.timeoutMs)
    s.timer.unref?.()
    active.set(captureId, s)
    return { captureId, config, limits: cap }
  }
  function take(p) {
    const s = active.get(p.captureId)
    if (
      !s ||
      s.identity.sessionId !== p.sessionId ||
      !sessionExists(p.sessionId)
    )
      throw Error('录音快照不存在或已失效')
    if (s.taken) throw Error('本句已提交识别')
    if (
      resolve({
        providerId: s.spec.provider.info.id,
        language: s.spec.language
      }).provider !== s.spec.provider
    )
      throw Error('原识别服务已被替换')
    s.taken = true
    return s
  }
  function release(s) {
    clearTimeout(s.timer)
    active.delete(s.captureId)
    cancelled.set(s.key, true)
    while (cancelled.size > 32) cancelled.delete(cancelled.keys().next().value)
  }
  function cancel(p) {
    const candidates = p.captureId
      ? [active.get(p.captureId)].filter(Boolean)
      : [...active.values()].filter((s) => s.key === key(p))
    for (const s of candidates) {
      s.controller.abort()
      release(s)
      cancelled.set(s.key, true)
    }
    if (!p.captureId) cancelled.set(key(p), true)
    while (cancelled.size > 32) cancelled.delete(cancelled.keys().next().value)
    return { cancelled: true }
  }
  return {
    start,
    take,
    release,
    cancel,
    active: () => active.size,
    dispose() {
      for (const s of active.values()) {
        s.controller.abort()
        clearTimeout(s.timer)
      }
      active.clear()
      cancelled.clear()
    }
  }
}
