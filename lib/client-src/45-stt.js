    // ── STT 客户端（需求 §3.2 / §8 / §9）─────────────────────────────
    //
    // 两条路径：
    //   流式：人声开始时打开一个宿主流式会话，持续 push PCM，partial 通过 SSE 回来；
    //   批量：本地累积整个 Utterance，结束时一次性上传 WAV。
    // 选择依据是 Provider capability（宿主 /status 下发）+ 用户配置。
    //
    // 无论哪条路径都会本地累积 PCM：流式连接中途出错时可以降级为批量，
    // 不会让用户白说一句话。

    const sttClient = {
      active: false,
      mode: 'batch',
      streamId: '',
      eventSource: null,
      seq: 0,
      pushQueue: [],
      pushing: false,
      utteranceChunks: [],
      utteranceBytes: 0,
      degraded: false,
      suppress: false,
      finalText: '',
      stopping: false,

      resetUtterance() {
        this.utteranceChunks = []
        this.utteranceBytes = 0
        this.degraded = false
        this.suppress = false
        this.finalText = ''
      },

      async openStream(language) {
        const payload = await postJson('/dsh-chatty/stt/stream/start', {
          language,
          sampleRate: TARGET_SAMPLE_RATE,
        })
        this.streamId = payload.streamId
        this.seq = 0
        this.pushQueue = []
        this.listenStreamEvents(payload.streamId)
        return payload
      },

      listenStreamEvents(streamId) {
        if (typeof EventSource === 'undefined') return
        this.closeStreamEvents()
        const source = new EventSource('/dsh-chatty/stt/stream/events?streamId=' + encodeURIComponent(streamId))
        this.eventSource = source
        source.addEventListener('partial', (event) => {
          const data = parseSseData(event)
          if (!data) return
          chatty.partial = data.text || ''
          if (chatty.sttPhase === 'TRANSCRIBING') setSttPhase('TRANSCRIBING')
          else chatty.notify()
        })
        source.addEventListener('final', (event) => {
          const data = parseSseData(event)
          if (data && data.text) this.finalText = data.text
        })
        source.addEventListener('error', (event) => {
          const data = parseSseData(event)
          if (data && data.message) chatty.sttError = data.message
        })
        source.addEventListener('closed', () => { /* 服务端收尾，无需处理 */ })
        source.onerror = () => {
          if (!this.active || this.streamId !== streamId) return
          // 连接断了就降级：当前 Utterance 改用批量上传，并提示正在重连。
          this.degraded = true
          setSttPhase('RECONNECTING')
        }
      },

      closeStreamEvents() {
        if (this.eventSource) {
          try { this.eventSource.close() } catch { /* 已关闭 */ }
        }
        this.eventSource = null
      },

      enqueuePush(pcm) {
        if (!this.streamId || this.degraded || this.suppress) return
        this.pushQueue.push(pcm)
        this.flushPush()
      },

      async flushPush() {
        if (this.pushing) return
        this.pushing = true
        try {
          while (this.pushQueue.length) {
            const pcm = this.pushQueue.shift()
            const streamId = this.streamId
            if (!streamId) break
            this.seq += 1
            try {
              await postJson('/dsh-chatty/stt/stream/push', {
                streamId,
                seq: this.seq,
                dataBase64: bytesToBase64(pcm),
              })
            } catch (error) {
              this.degraded = true
              setSttPhase('RECONNECTING')
              break
            }
          }
        } finally {
          this.pushing = false
        }
      },

      async closeStream(cancel) {
        const streamId = this.streamId
        this.streamId = ''
        this.closeStreamEvents()
        this.pushQueue = []
        if (!streamId) return ''
        try {
          const payload = await postJson('/dsh-chatty/stt/stream/stop', { streamId, cancel: !!cancel })
          return String(payload.text || this.finalText || '')
        } catch {
          return this.finalText || ''
        }
      },

      async transcribeBatch(language) {
        const pcm = concatPcm(this.utteranceChunks)
        if (!pcm.length) return ''
        const wav = pcm16ToWavClient(pcm, TARGET_SAMPLE_RATE)
        const payload = await postJson('/dsh-chatty/stt/transcribe', {
          dataBase64: bytesToBase64(wav),
          mimeType: 'audio/wav',
          language,
        })
        return String(payload.text || '')
      },
    }

    function parseSseData(event) {
      try { return JSON.parse(event.data) } catch { return null }
    }

    async function startListening() {
      if (sttClient.active) return
      const settings = chatty.settings || await refreshChattySettings()
      if (!settings) { setSttPhase('ERROR', chatty.sttError || t('error')); return }
      const capability = chattySetting('stt.capability', {}) || {}
      sttClient.mode = (chattySetting('stt.streaming', true) && capability.streaming) ? 'stream' : 'batch'
      try {
        await audioEngine.start({
          onSpeechStart: (preRoll) => handleSpeechStart(preRoll),
          onFrame: (pcm) => handleSpeechFrame(pcm),
          onSpeechEnd: (pcm, info) => { handleSpeechEnd(pcm, info).catch((error) => handleSttFailure(error)) },
          onSpeechDiscard: () => { if (sttClient.active) setSttPhase('LISTENING') },
          onLevel: () => { /* chatty.levels 已在引擎里更新 */ },
          onError: (error) => handleSttFailure(error),
        }, {
          vad: chattySetting('stt.vad', null),
          deviceId: chattySetting('mic_device_id', ''),
          noiseSuppression: chattySetting('noise_suppression', true),
          echoCancellation: chattySetting('echo_cancellation', true),
          autoGainControl: chattySetting('auto_gain_control', true),
        })
        sttClient.active = true
        setSttPhase('LISTENING')
        showNotice('')
      } catch (error) {
        sttClient.active = false
        const message = String(error && error.message || error)
        setSttPhase('ERROR', /denied|NotAllowed/i.test(message) ? t('micDenied') : message)
      }
    }

    async function stopListening() {
      if (!sttClient.active) return
      sttClient.stopping = true
      sttClient.active = false
      // Push-to-Talk：手动停止时当前这句还没被静音切分，先收尾再关麦克风，
      // 否则用户「说完点停止」的最后一句会被直接丢掉。
      const pendingUtterance = audioEngine.speaking
      if (pendingUtterance) {
        setSttPhase('TRANSCRIBING')
        // finishUtterance 同步把 PCM 交给 handleSpeechEnd，后者异步落地识别结果。
        audioEngine.finishUtterance('manual')
      } else {
        sttClient.closeStream(true)
        sttClient.resetUtterance()
      }
      audioEngine.stop()
      chatty.partial = ''
      if (!pendingUtterance) setSttPhase('OFF')
      sttClient.stopping = false
    }

    function pauseListening() {
      if (!sttClient.active) return
      audioEngine.pause()
      sttClient.closeStream(true)
      chatty.partial = ''
      setSttPhase('PAUSED')
    }

    function resumeListening() {
      if (!sttClient.active) return
      audioEngine.resume()
      setSttPhase('LISTENING')
    }

    function toggleListening() {
      if (!sttClient.active) startListening()
      else if (chatty.sttPhase === 'PAUSED') resumeListening()
      else stopListening()
    }

    function handleSpeechStart(preRoll) {
      sttClient.resetUtterance()
      chatty.partial = ''
      // 朗读期间检测到人声：先处理打断，再决定这一句要不要送远程识别（需求 §21）。
      if (chatty.ttsPhase === 'PLAYING' || chatty.ttsPhase === 'PREPARING') {
        if (chattySetting('tts.interrupt_on_speech', true)) interruptSpeaking('speech')
        else { sttClient.suppress = true; return }
      }
      if (preRoll && preRoll.length) {
        sttClient.utteranceChunks.push(preRoll)
        sttClient.utteranceBytes += preRoll.length
      }
      if (sttClient.mode === 'stream') {
        sttClient.openStream(chattySetting('stt.language', 'zh-CN'))
          .then(() => { for (const chunk of sttClient.utteranceChunks) sttClient.enqueuePush(chunk) })
          .catch(() => { sttClient.degraded = true; setSttPhase('RECONNECTING') })
      }
    }

    function handleSpeechFrame(pcm) {
      sttClient.utteranceChunks.push(pcm)
      sttClient.utteranceBytes += pcm.length
      if (sttClient.mode === 'stream' && !sttClient.suppress) sttClient.enqueuePush(pcm)
    }

    async function handleSpeechEnd(pcm, info) {
      if (pcm && pcm.length && (!sttClient.utteranceChunks.length)) {
        sttClient.utteranceChunks.push(pcm)
        sttClient.utteranceBytes += pcm.length
      }
      const suppressed = sttClient.suppress
      const useStream = sttClient.mode === 'stream' && !sttClient.degraded && !suppressed
      let text = ''
      try {
        if (useStream) {
          await sttClient.flushPush()
          text = await sttClient.closeStream(false)
        } else if (!suppressed) {
          text = await sttClient.transcribeBatch(chattySetting('stt.language', 'zh-CN'))
        }
      } finally {
        sttClient.resetUtterance()
        chatty.partial = ''
      }
      const clean = String(text || '').trim()
      if (clean) await addUtterance(clean)
      if (!sttClient.active) { setSttPhase('OFF'); return }
      if (chatty.sttPhase === 'RECONNECTING' || chatty.sttPhase === 'TRANSCRIBING' || chatty.sttPhase === 'SPEECH_DETECTED') {
        setSttPhase('LISTENING')
      } else {
        chatty.notify()
      }
    }

    function handleSttFailure(error) {
      const message = String(error && error.message || error)
      if (!sttClient.active) return
      setSttPhase('ERROR', message)
      sttClient.resetUtterance()
      chatty.partial = ''
      // 一次失败不结束长时间监听：短暂提示后回到 LISTENING（需求 §3.2）。
      setTimeout(() => {
        if (sttClient.active && chatty.sttPhase === 'ERROR') setSttPhase('LISTENING')
      }, 2500)
    }
