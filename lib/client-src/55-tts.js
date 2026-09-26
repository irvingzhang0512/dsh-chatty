    // ── TTS 播放（需求 §11 / §18 / §19 / §20 / §21）──────────────────
    //
    // 宿主把 Assistant 回复切成「可朗读片段」并通过 SSE 下发（自动朗读），
    // 或由 /speech/render 一次性返回（手动朗读）。这里负责：
    //   - 顺序播放（Speech Queue 的浏览器侧镜像）；
    //   - 停止 / 打断（递增 generation，丢弃在途音频）；
    //   - PCM 用 WebAudio 连续播放，mp3/wav 用 audio 元素兜底。

    const speech = {
      generation: 0,
      controllers: new Set(),
      audioCtx: null,
      gain: null,
      sources: new Set(),
      nextTime: 0,
      queue: [],
      pumping: false,
      activeStreams: 0,
      eventSource: null,
      connectedSessionId: '',
      element: null,
      elementUrl: '',
      totalQueued: 0,
      doneCount: 0,
    }

    function ensureSpeechAudio() {
      if (speech.audioCtx) {
        if (speech.audioCtx.state === 'suspended') speech.audioCtx.resume().catch(() => {})
        return speech.audioCtx
      }
      const Ctx = typeof AudioContext !== 'undefined' ? AudioContext
        : (typeof webkitAudioContext !== 'undefined' ? webkitAudioContext : null)
      if (!Ctx) return null
      speech.audioCtx = new Ctx()
      speech.gain = speech.audioCtx.createGain()
      const volume = Number(chattySetting('tts.volume', 1))
      speech.gain.gain.value = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 1
      speech.gain.connect(speech.audioCtx.destination)
      speech.nextTime = speech.audioCtx.currentTime
      return speech.audioCtx
    }

    function enqueueSpeechSegment(segment) {
      if (!segment || !String(segment.text || '').trim()) return
      speech.queue.push(segment)
      // 进度：total = 本次 generation 累计入队段数。
      if (!speech.totalQueued) speech.totalQueued = 0
      speech.totalQueued += 1
      chatty.ttsProgress = { index: speech.doneCount + 1, total: speech.totalQueued }
      pumpSpeechQueue()
    }

    async function pumpSpeechQueue() {
      if (speech.pumping) return
      speech.pumping = true
      try {
        let prefetch = null
        while (speech.queue.length) {
          const generation = speech.generation
          const segment = speech.queue.shift()
          // 播放当前段的同时预发起下一段的合成，段间停顿从「整段合成时间」缩到接近 0。
          const current = prefetch || startSynthesis(segment, generation)
          prefetch = speech.queue.length ? startSynthesis(speech.queue[0], generation) : null
          try {
            await playSpeechSegment(segment, generation, current)
            speech.doneCount += 1
            if (chatty.ttsProgress) chatty.ttsProgress.index = Math.min(speech.doneCount + 1, speech.totalQueued)
          } catch (error) {
            if (generation === speech.generation) {
              setTtsPhase('ERROR', String(error && error.message || error))
            }
          }
          if (generation !== speech.generation) break
        }
        prefetch = null
      } finally {
        speech.pumping = false
        if (speech.generation && speech.queue.length === 0 && chatty.ttsPhase !== 'ERROR') {
          if (chatty.ttsPhase === 'PLAYING' || chatty.ttsPhase === 'PREPARING') setTtsPhase('IDLE')
        }
      }
    }

    /** 发起一次合成请求（可被预取；controller 在 stopSpeaking 时统一 abort）。 */
    function startSynthesis(segment, generation) {
      void generation
      const controller = new AbortController()
      speech.controllers.add(controller)
      const promise = fetch('/dsh-chatty/tts/synthesize', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          text: segment.text,
          voice: chattySetting('tts.voice', ''),
          speed: chattySetting('tts.speed', 1),
        }),
      }).then((res) => {
        if (!res.ok) {
          return res.json().then((data) => {
            throw new Error((data && data.error && data.error.message) || `TTS HTTP ${res.status}`)
          }, () => { throw new Error(`TTS HTTP ${res.status}`) })
        }
        return res
      })
      return { controller, promise }
    }

    async function playSpeechSegment(segment, generation, started) {
      const { controller, promise } = started || startSynthesis(segment, generation)
      setTtsPhase('PREPARING')
      chatty.ttsStage = 'synth'
      try {
        const res = await promise
        if (generation !== speech.generation || controller.signal.aborted) return
        const format = String(res.headers.get('X-Audio-Format') || 'pcm').toLowerCase()
        const sampleRate = Number(res.headers.get('X-Audio-Sample-Rate')) || Number(chattySetting('tts.sample_rate', 24000)) || 24000
        if (format === 'pcm') await playPcmStream(res, sampleRate, generation, controller)
        else await playEncodedBlob(res, generation, controller)
        if (generation === speech.generation) setTtsPhase('IDLE')
      } finally {
        speech.controllers.delete(controller)
      }
    }

    async function playPcmStream(res, sampleRate, generation, controller) {
      const ctxAudio = ensureSpeechAudio()
      if (!ctxAudio) throw new Error(t('unsupported'))
      await ctxAudio.resume().catch(() => {})
      const reader = res.body && res.body.getReader ? res.body.getReader() : null
      if (!reader) throw new Error('TTS response is not streamable')
      let carry = new Uint8Array(0)
      speech.activeStreams += 1
      try {
        while (true) {
          if (generation !== speech.generation || controller.signal.aborted) return
          const part = await reader.read()
          if (part.done) break
          let bytes = part.value
          if (carry.length) {
            const joined = new Uint8Array(carry.length + bytes.length)
            joined.set(carry, 0); joined.set(bytes, carry.length)
            bytes = joined
            carry = new Uint8Array(0)
          }
          if (bytes.length % 2) { carry = bytes.slice(-1); bytes = bytes.slice(0, -1) }
          if (!bytes.length) continue
          const frames = bytes.length / 2
          const buffer = ctxAudio.createBuffer(1, frames, sampleRate)
          const channel = buffer.getChannelData(0)
          const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
          for (let i = 0; i < frames; i += 1) channel[i] = view.getInt16(i * 2, true) / 32768
          const source = ctxAudio.createBufferSource()
          source.buffer = buffer
          source.connect(speech.gain)
          const startAt = Math.max(ctxAudio.currentTime + 0.04, speech.nextTime)
          source.start(startAt)
          speech.nextTime = startAt + buffer.duration
          speech.sources.add(source)
          source.onended = () => { speech.sources.delete(source) }
          if (chatty.ttsPhase !== 'PLAYING') setTtsPhase('PLAYING')
        }
      } finally {
        speech.activeStreams = Math.max(0, speech.activeStreams - 1)
      }
    }

    async function playEncodedBlob(res, generation, controller) {
      const blob = await res.blob()
      if (generation !== speech.generation || controller.signal.aborted) return
      const url = URL.createObjectURL(blob)
      speech.elementUrl = url
      const element = new Audio(url)
      speech.element = element
      element.volume = Math.max(0, Math.min(1, Number(chattySetting('tts.volume', 1)) || 1))
      await new Promise((resolve, reject) => {
        const cleanup = () => {
          element.onended = null
          element.onerror = null
          try { URL.revokeObjectURL(url) } catch { /* 已释放 */ }
          if (speech.element === element) speech.element = null
          speech.elementUrl = ''
        }
        element.onended = () => { cleanup(); resolve() }
        element.onerror = () => { cleanup(); reject(new Error('audio playback failed')) }
        controller.signal.addEventListener('abort', () => {
          try { element.pause() } catch { /* 已暂停 */ }
          cleanup()
          resolve()
        }, { once: true })
        element.play().then(() => setTtsPhase('PLAYING')).catch((error) => { cleanup(); reject(error) })
      })
    }

    function stopSpeaking(silent) {
      speech.generation += 1
      for (const controller of speech.controllers) { try { controller.abort() } catch { /* 已结束 */ } }
      speech.controllers.clear()
      for (const source of speech.sources) { try { source.stop() } catch { /* 已结束 */ } }
      speech.sources.clear()
      if (speech.element) { try { speech.element.pause() } catch { /* 已暂停 */ } }
      if (speech.elementUrl) { try { URL.revokeObjectURL(speech.elementUrl) } catch { /* 已释放 */ } }
      speech.element = null
      speech.elementUrl = ''
      speech.queue = []
      speech.activeStreams = 0
      speech.totalQueued = 0
      speech.doneCount = 0
      chatty.ttsProgress = null
      chatty.ttsStage = ''
      if (speech.audioCtx) {
        speech.audioCtx.resume().catch(() => {})
        speech.nextTime = speech.audioCtx.currentTime
      }
      if (!silent) {
        postJson('/dsh-chatty/speech/stop', { sessionId: chatty.sessionId || 'default' }).catch(() => {})
      }
      setTtsPhase('IDLE')
    }

    /** 用户说话打断：停播 → 清空队列 → 回到监听（需求 §20 / §21）。 */
    function interruptSpeaking(reason) {
      stopSpeaking()
      setTtsPhase('INTERRUPTED')
      showNotice(t('interrupted'))
      setTimeout(() => {
        if (chatty.ttsPhase === 'INTERRUPTED') setTtsPhase('IDLE')
      }, 1200)
      if (reason === 'speech' && sttClient.active && chatty.sttPhase === 'PAUSED') resumeListening()
    }

    async function readLatestReply() {
      // 立即反馈：render（含表格 LLM 摘要）可能需要数秒，不能无状态等待。
      setTtsPhase('PREPARING')
      chatty.ttsStage = 'render'
      chatty.ttsProgress = null
      try {
        const payload = await postJson('/dsh-chatty/speech/render', { sessionId: chatty.sessionId || 'default' })
        const segments = Array.isArray(payload.segments) ? payload.segments : []
        if (!segments.length) { setTtsPhase('IDLE'); showNotice('没有可朗读的回复'); return }
        stopSpeaking(true)
        chatty.ttsStage = 'synth'
        speech.totalQueued = 0
        speech.doneCount = 0
        for (const segment of segments) enqueueSpeechSegment(segment)
      } catch (error) {
        setTtsPhase('ERROR', String(error && error.message || error))
      }
    }

    function connectSpeechEvents(sessionId) {
      const id = String(sessionId || '')
      if (speech.connectedSessionId === id) return
      disconnectSpeechEvents()
      if (!id) return
      if (typeof EventSource === 'undefined') return
      const source = new EventSource('/dsh-chatty/speech/events?sessionId=' + encodeURIComponent(id))
      speech.eventSource = source
      speech.connectedSessionId = id
      source.addEventListener('speech.segment', (event) => {
        const data = parseSseData(event)
        if (data) enqueueSpeechSegment(data)
      })
      source.addEventListener('speech.cancel', () => { stopSpeaking(true) })
      source.addEventListener('speech.end', () => { /* 队列自然播完 */ })
      source.onerror = () => { /* 断线由 EventSource 自动重连 */ }
    }

    function disconnectSpeechEvents() {
      if (speech.eventSource) {
        try { speech.eventSource.close() } catch { /* 已关闭 */ }
      }
      speech.eventSource = null
      speech.connectedSessionId = ''
    }
