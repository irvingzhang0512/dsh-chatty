const sttClient = {
  active: false,
  generation: 0,
  current: null,
  tasks: new Set(),
  order: Promise.resolve()
}
async function consumeSse(url, onEvent, signal, ready) {
  const response = await fetch(url, { signal, cache: 'no-store' })
  if (!response.ok) throw Error('识别事件连接失败')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    for (;;) {
      const result = await reader.read()
      if (result.done) break
      buffer += decoder.decode(result.value, { stream: true })
      let index
      while ((index = buffer.indexOf('\n\n')) >= 0) {
        const event = buffer.slice(0, index)
        buffer = buffer.slice(index + 2)
        const kind = event.match(/^event: (.+)$/m)?.[1]
        const value = event.match(/^data: (.+)$/m)?.[1]
        if (!kind || !value) continue
        const data = JSON.parse(value)
        if (kind === 'ready') ready?.()
        onEvent(kind, data)
      }
    }
  } finally {
    reader.releaseLock()
  }
}
async function startListening() {
  if (sttClient.active || sttClient.starting) return
  const request = {},
    before = sttClient.generation
  sttClient.starting = request
  chatty.notify()
  try {
    const cfg = await refreshChattySettings()
    if (before !== sttClient.generation) return
    if (cfg?.migrationPending) {
      showNotice('请先在高级设置迁移旧配置')
      return
    }
    if (!cfg?.compatibility?.matched) {
      showNotice('请先匹配官方语音 Bundle')
      return
    }
    if (!chatty.sessionId || !chatty.ledger) {
      showNotice('请先选择会话')
      return
    }
    if (
      Math.min(
        cfg.limits.maxAudioBytes - 44,
        cfg.limits.maxDurationSeconds * 32000
      ) < Math.max(4096, cfg.stt.vad.min_speech_ms * 32)
    ) {
      showNotice('音频上限太短，请调整官方上限或最短人声参数')
      return
    }
    const gen = ++sttClient.generation
    sttClient.active = true
    sttClient.counter = 0
    chatty.listenStartedAt = Date.now()
    try {
      await audioEngine.start(
        {
          onSpeechStart: beginUtterance,
          onFrame: feedUtterance,
          onSpeechEnd: endUtterance,
          onSpeechDiscard: () => discardUtterance(),
          onError: handleSttFailure
        },
        {
          vad: cfg.stt.vad,
          deviceId: cfg.mic_device_id,
          noiseSuppression: cfg.noise_suppression,
          echoCancellation: cfg.echo_cancellation,
          autoGainControl: cfg.auto_gain_control
        }
      )
      if (gen !== sttClient.generation) return
      setSttPhase('LISTENING')
    } catch (error) {
      if (gen !== sttClient.generation) return
      sttClient.active = false
      audioEngine.stop()
      setSttPhase('ERROR', String(error.message))
    }
  } finally {
    if (sttClient.starting === request) {
      sttClient.starting = null
      chatty.notify()
    }
  }
}
async function stopListening() {
  if (!sttClient.active) return
  sttClient.active = false
  if (audioEngine.speaking) audioEngine.finishUtterance('manual')
  audioEngine.stop()
  if (!sttClient.tasks.size) setSttPhase('OFF')
}
function cancelListening() {
  sttClient.starting = null
  chatty.polishController?.abort()
  for (const controller of sttClient.retries || []) controller.abort()
  sttClient.retries?.clear()
  sttClient.active = false
  sttClient.generation++
  audioEngine.stop()
  for (const task of sttClient.tasks) {
    cancelBatchCapture(task)
    task.controller.abort()
    task.eventController.abort()
    task.settle('')
    if (task.streamId)
      postJson('/dsh-chatty/stt/stream/cancel', {
        streamId: task.streamId
      }).catch(() => {})
  }
  sttClient.tasks.clear()
  sttClient.current = null
  chatty.partial = ''
  setSttPhase('OFF')
}
function pauseListening() {
  cancelListening()
}
function resumeListening() {
  return startListening()
}
function toggleListening() {
  return sttClient.active ? stopListening() : startListening()
}
function beginUtterance(preRoll) {
  const cfg = chatty.settings
  if (
    sttClient.tasks.size + chatty.pendingResults.length >=
    cfg.stt.max_pending
  ) {
    sttClient.active = false
    audioEngine.stop()
    showNotice('待处理句已满，请先处理结果后重新开始')
    return
  }
  if (['PLAYING', 'PREPARING'].includes(chatty.ttsPhase)) {
    if (cfg.tts.interrupt_on_speech) interruptSpeaking('speech')
    else return
  }
  const task = {
    id:
      globalThis.crypto?.randomUUID?.() ||
      Date.now().toString(36) + '-' + Math.random().toString(36).slice(2),
    generation: sttClient.generation,
    sessionId: chatty.sessionId,
    utteranceSeq: ++sttClient.counter,
    anchor: chatty.ledger.capture(),
    cfg: JSON.parse(JSON.stringify(cfg)),
    chunks: [],
    bytes: 0,
    push: Promise.resolve(),
    sequence: 0,
    controller: new AbortController(),
    eventController: new AbortController(),
    partial: '',
    final: false
  }
  task.done = new Promise((resolve) => {
    task.settle = resolve
  })
  sttClient.current = task
  sttClient.tasks.add(task)
  sttClient.order = sttClient.order
    .then(async () => {
      try {
        const text = await task.done
        if (
          task.generation === sttClient.generation &&
          task.sessionId === chatty.sessionId &&
          text
        )
          await handleRecognizedText(text, task)
      } finally {
        sttClient.tasks.delete(task)
        if (!sttClient.active && !sttClient.tasks.size) setSttPhase('OFF')
      }
    })
    .catch((error) => showNotice(String(error.message)))
  task.timer = setTimeout(() => {
    cancelBatchCapture(task)
    task.controller.abort()
    task.eventController.abort()
    task.error = Error('识别超时')
    if (sttClient.current === task) audioEngine.finishUtterance('timeout')
    task.settle('')
    if (task.streamId)
      postJson('/dsh-chatty/stt/stream/cancel', {
        streamId: task.streamId
      }).catch(() => {})
  }, cfg.timeout_ms)
  if (cfg.stt.streaming && cfg.stt.capability.streaming) {
    task.open = (async () => {
      const result = await postJson(
        '/dsh-chatty/stt/stream/start',
        {
          sessionId: task.sessionId,
          recordingGeneration: task.generation,
          utteranceId: task.id,
          utteranceSeq: task.utteranceSeq,
          providerId: cfg.stt.provider,
          language: cfg.stt.language,
          sampleRate: 16000
        },
        { signal: task.controller.signal }
      )
      task.streamId = result.streamId
      await new Promise((resolve, reject) => {
        task.events = consumeSse(
          '/dsh-chatty/stt/stream/events?streamId=' +
            encodeURIComponent(task.streamId),
          (kind, data) => {
            if (
              data.recordingGeneration !== undefined &&
              data.recordingGeneration !== task.generation
            )
              return
            if (kind === 'partial') {
              task.partial = data.text
              chatty.partial = data.text
              chatty.notify()
            }
            if (kind === 'final') {
              task.final = true
              task.finalText = data.text
            }
            if (kind === 'error') task.error = Error(data.message)
          },
          task.eventController.signal,
          resolve
        ).catch(reject)
      })
      if (task.controller.signal.aborted) throw Error('识别已取消')
    })()
    task.open.catch((error) => {
      task.error = error
      if (error.code === 'compatibility') handleSttFailure(error)
    })
  } else {
    task.capture = postJson(
      '/dsh-chatty/stt/capture/start',
      {
        sessionId: task.sessionId,
        recordingGeneration: task.generation,
        utteranceId: task.id,
        utteranceSeq: task.utteranceSeq,
        providerId: cfg.stt.provider,
        language: cfg.stt.language
      },
      { signal: task.controller.signal }
    ).then((info) => {
      task.captureId = info.captureId
      task.cfg = {
        ...info.config,
        stt: { ...info.config.stt, capability: task.cfg.stt.capability },
        limits: info.limits || task.cfg.limits
      }
      if (task.controller.signal.aborted) cancelBatchCapture(task)
      return info
    })
    task.capture.catch((error) => {
      task.error = error
      if (error.code === 'compatibility') handleSttFailure(error)
    })
  }
  if (preRoll?.length) feedUtterance(preRoll)
}
function cancelBatchCapture(task) {
  if (task.open) return
  postJson('/dsh-chatty/stt/capture/cancel', {
    captureId: task.captureId,
    sessionId: task.sessionId,
    recordingGeneration: task.generation,
    utteranceId: task.id
  }).catch(() => {})
}
function feedUtterance(pcm) {
  const task = sttClient.current
  if (!task) return
  if (
    task.bytes + pcm.length + 44 > task.cfg.limits.maxAudioBytes ||
    task.bytes + pcm.length > task.cfg.limits.maxDurationSeconds * 32000
  ) {
    audioEngine.finishUtterance('limit')
    return
  }
  task.chunks.push(pcm)
  task.bytes += pcm.length
  if (task.open) {
    queueStreamAudio(task, pcm)
  }
}
function queueStreamAudio(task, pcm, flush = false) {
  let combined = concatPcm([task.uploadBuffer || new Uint8Array(0), pcm])
  let offset = 0
  while (
    combined.length - offset >= 6400 ||
    (flush && combined.length > offset)
  ) {
    const part = combined.slice(offset, offset + 6400)
    offset += part.length
    task.push = task.push
      .then(async () => {
        await task.open
        if (task.error) throw task.error
        await postJson(
          '/dsh-chatty/stt/stream/push',
          {
            streamId: task.streamId,
            sequence: ++task.sequence,
            audioBase64: bytesToBase64(part)
          },
          { signal: task.controller.signal }
        )
      })
      .catch((error) => {
        task.error = error
        if (error.code === 'compatibility') handleSttFailure(error)
      })
  }
  task.uploadBuffer = combined.slice(offset)
}
function discardUtterance() {
  const task = sttClient.current
  sttClient.current = null
  if (!task) return
  clearTimeout(task.timer)
  task.controller.abort()
  task.eventController.abort()
  task.settle('')
  cancelBatchCapture(task)
  if (task.streamId)
    postJson('/dsh-chatty/stt/stream/cancel', {
      streamId: task.streamId
    }).catch(() => {})
}
async function endUtterance() {
  const task = sttClient.current
  sttClient.current = null
  if (!task) return
  try {
    let text = ''
    if (task.open) {
      queueStreamAudio(task, new Uint8Array(0), true)
      await task.push
      await task.open
      if (task.error) throw task.error
      const result = await postJson(
        '/dsh-chatty/stt/stream/stop',
        { streamId: task.streamId, lastSequence: task.sequence },
        { signal: task.controller.signal }
      )
      text = result.text
      if (!text && !task.final) throw Error('没有正式最终结果')
    } else {
      await task.capture
      if (task.error) throw task.error
      const wav = pcm16ToWavClient(concatPcm(task.chunks), 16000)
      const result = await postJson(
        '/dsh-chatty/stt/transcribe',
        {
          sessionId: task.sessionId,
          captureId: task.captureId,
          providerId: task.cfg.stt.provider,
          language: task.cfg.stt.language,
          audioBase64: bytesToBase64(wav)
        },
        { signal: task.controller.signal }
      )
      text = result.text
    }
    task.settle(String(text || ''))
  } catch (error) {
    task.error = error
    task.settle('')
    cancelBatchCapture(task)
    if (task.generation === sttClient.generation) {
      showNotice(String(error.message))
      chatty.pendingResults.push({
        id: task.id,
        text: task.partial || '识别失败，可重试本句',
        unconfirmed: true,
        retry: task
      })
    }
    if (task.streamId)
      postJson('/dsh-chatty/stt/stream/cancel', {
        streamId: task.streamId
      }).catch(() => {})
  } finally {
    clearTimeout(task.timer)
    task.eventController.abort()
    task.chunks = task.error ? task.chunks : []
    chatty.partial = ''
    chatty.notify()
    if (sttClient.active) setSttPhase('LISTENING')
  }
}
function handleSttFailure(error) {
  showNotice(String(error.message || error))
  cancelListening()
}
