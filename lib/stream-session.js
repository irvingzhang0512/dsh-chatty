import { randomUUID, createHash } from 'node:crypto'

export function createStreamSessions({ open, limits, sessionExists }) {
  const sessions = new Map()
  const dead = new Map()
  function start(p) {
    if (
      !sessionExists(p.sessionId) ||
      typeof p.utteranceId !== 'string' ||
      !p.utteranceId ||
      p.utteranceId.length > 200 ||
      !Number.isSafeInteger(p.recordingGeneration) ||
      p.recordingGeneration < 1 ||
      !Number.isSafeInteger(p.utteranceSeq) ||
      p.utteranceSeq < 1 ||
      p.sampleRate !== 16000
    )
      throw Error('无效录音身份')
    const same = (s) =>
      s.sessionId === p.sessionId &&
      s.recordingGeneration === p.recordingGeneration &&
      s.utteranceId === p.utteranceId
    const duplicate = [...sessions.values()].find(same)
    if (duplicate) {
      if (
        duplicate.utteranceSeq !== p.utteranceSeq ||
        duplicate.providerId !== p.providerId ||
        duplicate.language !== p.language
      )
        throw Error('录音身份重复但参数不同')
      return {
        streamId: duplicate.streamId,
        limits: duplicate.cap,
        duplicate: true
      }
    }
    if ([...dead.values()].some((d) => same(d.identity)))
      throw Error('该录音已经结束，请创建新句')
    const cap = limits(p)
    if (sessions.size >= cap.maxPending) throw Error('识别积压已满')
    const streamId = randomUUID()
    const s = {
      ...p,
      streamId,
      seq: 0,
      eventSeq: 0,
      bytes: 0,
      hashes: new Map(),
      events: [],
      clients: new Set(),
      final: false,
      closed: false,
      cap
    }
    const emit = (kind, data = {}) => {
      if (s.closed && kind !== 'closed') return
      if (kind === 'final') {
        if (s.final) return
        s.final = true
        s.text = String(data.text || '')
      }
      const event = {
        kind,
        data: { streamId, ...p, eventSeq: ++s.eventSeq, ...data }
      }
      if (kind === 'partial')
        s.events = s.events.filter((e) => e.kind !== 'partial')
      s.events.push(event)
      if (s.events.length > 32) s.events.splice(0, s.events.length - 32)
      for (const send of s.clients) send(event)
    }
    const close = () => {
      if (s.closed) return
      s.closed = true
      clearTimeout(s.timer)
      emit('closed')
      for (const send of s.clients) send(null)
      s.clients.clear()
      sessions.delete(streamId)
      dead.set(streamId, {
        text: s.text || '',
        error: s.error,
        cancelled: s.cancelled,
        seq: s.seq,
        identity: p
      })
      if (dead.size > 32) dead.delete(dead.keys().next().value)
      s.events = []
      s.hashes.clear()
    }
    s.fail = (e) => {
      if (s.closed) return
      s.error = String(e?.message || e)
      emit('error', { message: s.error })
      s.stream?.cancel()
      close()
    }
    s.cancel = () => {
      if (s.closed) return
      s.cancelled = true
      s.stream?.cancel()
      close()
    }
    s.timer = setTimeout(() => s.fail(Error('流式识别超时')), cap.timeoutMs)
    s.timer.unref?.()
    sessions.set(streamId, s)
    try {
      s.stream = open(p, {
        onPartial: (text) => emit('partial', { text }),
        onFinal: (text) => emit('final', { text }),
        onError: s.fail
      })
      if (s.closed) s.stream.cancel()
    } catch (e) {
      s.cancel()
      throw e
    }
    s.close = close
    s.emit = emit
    return { streamId, limits: cap }
  }
  const get = (id) => {
    const s = sessions.get(id)
    if (!s) throw Error(dead.get(id)?.error || '识别会话不存在或已经结束')
    return s
  }
  function subscribe(id, send) {
    const s = get(id)
    s.clients.add(send)
    send({ kind: 'ready', data: { streamId: id, ...s.cap } })
    for (const event of s.events) send(event)
    return () => {
      s.clients.delete(send)
      if (!s.closed) s.cancel()
    }
  }
  function push(p) {
    const s = get(p.streamId)
    if (!s.clients.size) throw Error('请先订阅识别事件')
    if (!Number.isSafeInteger(p.sequence) || p.sequence < 1)
      throw Error('非法分片序号')
    const bytes = Buffer.from(p.audioBase64 || '', 'base64')
    if (
      bytes.toString('base64') !== p.audioBase64 ||
      !bytes.length ||
      bytes.length > 6400 ||
      bytes.length % 2
    )
      throw Error('非法 PCM 分片')
    const hash = createHash('sha256').update(bytes).digest('hex')
    if (p.sequence <= s.seq) {
      if (s.hashes.get(p.sequence) !== hash) throw Error('重复分片内容不符')
      return { sequence: p.sequence, duplicate: true }
    }
    if (p.sequence !== s.seq + 1) throw Error('分片顺序不符')
    if (p.sequence > Math.ceil(s.cap.maxDurationSeconds * 5) + 2)
      throw Error('分片数量超过句长预算')
    if (
      s.bytes + bytes.length + 44 > s.cap.maxAudioBytes ||
      s.bytes + bytes.length > s.cap.maxDurationSeconds * 32000
    )
      throw Error('音频超过上限')
    s.stream.pushAudio(bytes)
    s.bytes += bytes.length
    s.seq = p.sequence
    s.hashes.set(s.seq, hash)
    return { sequence: s.seq }
  }
  async function stop(p) {
    if (dead.has(p.streamId)) {
      const d = dead.get(p.streamId)
      if (d.error) throw Error(d.error)
      if (d.cancelled) throw Error('识别已取消')
      return { text: d.text }
    }
    const s = get(p.streamId)
    if (p.lastSequence !== s.seq) throw Error('末块未完成')
    if (!s.stopping)
      s.stopping = (async () => {
        try {
          await s.stream.stop()
          if (!s.final) throw Error('没有正式最终结果')
          return { text: s.text }
        } finally {
          s.close()
        }
      })()
    return s.stopping
  }
  function cancel(p) {
    sessions.get(p.streamId)?.cancel()
    return { cancelled: true }
  }
  return {
    start,
    push,
    stop,
    cancel,
    subscribe,
    assertActive: get,
    active: () => sessions.size > 0,
    count:()=>sessions.size,
    dispose() {
      for (const s of [...sessions.values()]) s.cancel()
      dead.clear()
    }
  }
}
