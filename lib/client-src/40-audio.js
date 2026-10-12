// ── 音频采集 + 本地 VAD + Pre-roll（需求 §3.2 / §3.3 / §3.4 / §10）──
//
// 设计要点：
//  - 麦克风常开，本地判断是否有人声；没有人声就不调用远程 STT；
//  - 维护 pre_roll_ms 的环形缓冲，人声触发时把它一起送出去，避免句首丢字；
//  - 静音达到 silence_timeout_ms 判定一个 Utterance 结束，随后自动进入下一次监听；
//  - 采集统一重采样到 16k PCM16，Provider 侧不需要关心浏览器采样率。
//
// 回调（由 45-stt.js 提供）：
//   onSpeechStart(preRollPcm)  人声开始，携带前置缓冲
//   onFrame(pcm)               说话过程中的每一帧（流式 STT 持续推送）
//   onSpeechEnd(pcm, info)     一个 Utterance 结束，携带完整 PCM
//   onSpeechDiscard(info)      太短的人声片段，丢弃
//   onLevel(levels)            可视化用的音量柱
//   onError(error)

const TARGET_SAMPLE_RATE = 16000

const audioEngine = {
  running: false,
  requestGeneration: 0,
  paused: false,
  stream: null,
  audioCtx: null,
  source: null,
  analyser: null,
  processor: null,
  callbacks: {},
  vad: {
    enabled: true,
    sensitivity: 0.6,
    silence_timeout_ms: 1200,
    min_speech_ms: 200,
    pre_roll_ms: 400
  },
  sampleRate: TARGET_SAMPLE_RATE,
  levels: [],
  noiseFloor: 0.005,
  speaking: false,
  speechFrames: 0,
  silenceMs: 0,
  speechMs: 0,
  preRoll: [],
  preRollBytes: 0,
  utterance: [],
  utteranceBytes: 0,
  lastFrameAt: 0,

  configure(vad) {
    if (!vad) return
    const next = {
      enabled: vad.enabled !== false,
      sensitivity: Number(vad.sensitivity ?? 0.6),
      silence_timeout_ms: Number(vad.silence_timeout_ms ?? 1200),
      min_speech_ms: Number(vad.min_speech_ms ?? 200),
      pre_roll_ms: Number(vad.pre_roll_ms ?? 400)
    }
    this.vad = next
    this.preRollLimit = Math.max(
      0,
      Math.round((next.pre_roll_ms * TARGET_SAMPLE_RATE * 2) / 1000)
    )
  },

  async start(callbacks, options = {}) {
    if (this.running) return true
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      throw new Error(t('unsupported'))
    }
    const requestGeneration = ++this.requestGeneration
    this.callbacks = callbacks || {}
    this.configure(options.vad)
    this.preRollLimit = Math.max(
      0,
      Math.round((this.vad.pre_roll_ms * TARGET_SAMPLE_RATE * 2) / 1000)
    )

    const constraints = {
      audio: {
        deviceId: options.deviceId ? { exact: options.deviceId } : undefined,
        noiseSuppression: options.noiseSuppression !== false,
        echoCancellation: options.echoCancellation !== false,
        autoGainControl: options.autoGainControl !== false,
        channelCount: 1
      },
      video: false
    }
    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints)
    } catch (error) {
      // 设备 ID 失效时退回到系统默认设备，否则用户会被卡死在错误上。
      if (
        options.deviceId &&
        ['NotFoundError', 'OverconstrainedError'].includes(error.name)
      )
        stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false
        })
      else throw error
    }
    if (requestGeneration !== this.requestGeneration) {
      stream.getTracks().forEach((t) => t.stop())
      throw Error('录音请求已取消')
    }
    this.stream = stream

    const Ctx =
      typeof AudioContext !== 'undefined'
        ? AudioContext
        : typeof webkitAudioContext !== 'undefined'
          ? webkitAudioContext
          : null
    if (!Ctx) {
      this.stop()
      throw new Error(t('unsupported'))
    }
    let ctx
    try {
      ctx = new Ctx({ sampleRate: TARGET_SAMPLE_RATE })
    } catch {
      ctx = new Ctx()
    }
    this.audioCtx = ctx
    this.sampleRate = ctx.sampleRate || TARGET_SAMPLE_RATE
    this.resampleTail = new Float32Array(0)
    this.resamplePosition = 0

    this.source = ctx.createMediaStreamSource(stream)
    this.analyser = ctx.createAnalyser()
    this.analyser.fftSize = 1024
    this.source.connect(this.analyser)

    // ScriptProcessorNode 已标记废弃，但所有当前浏览器都还支持，
    // 且不需要额外的 worklet 资源文件；后续可平滑迁移到 AudioWorklet。
    this.processor = ctx.createScriptProcessor(2048, 1, 1)
    this.processor.onaudioprocess = (event) => this.handleFrame(event)
    this.source.connect(this.processor)
    // 某些浏览器只有在 processor 连到 destination 时才会触发回调，
    // 用 0 增益节点避免把麦克风声音放出来造成啸叫。
    const mute = ctx.createGain()
    mute.gain.value = 0
    this.processor.connect(mute)
    mute.connect(ctx.destination)

    this.running = true
    this.paused = false
    this.resetUtterance()
    chatty.levels = []
    return true
  },

  stop() {
    this.requestGeneration++
    this.running = false
    this.paused = false
    this.speaking = false
    if (this.processor) {
      try {
        this.processor.disconnect()
      } catch {
        /* 已断开 */
      }
      this.processor.onaudioprocess = null
    }
    if (this.source) {
      try {
        this.source.disconnect()
      } catch {
        /* 已断开 */
      }
    }
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        try {
          track.stop()
        } catch {
          /* 已停止 */
        }
      }
    }
    if (this.audioCtx) {
      try {
        this.audioCtx.close()
      } catch {
        /* 已关闭 */
      }
    }
    this.stream = null
    this.audioCtx = null
    this.source = null
    this.analyser = null
    this.processor = null
    this.resetUtterance()
    chatty.levels = []
    chatty.notify()
  },

  pause() {
    if (!this.running || this.paused) return
    this.paused = true
    this.finishUtterance('paused')
    setSttPhase('PAUSED')
  },

  resume() {
    if (!this.running || !this.paused) return
    this.paused = false
    this.resetUtterance()
    setSttPhase('LISTENING')
  },

  resetUtterance() {
    if (this.pendingVad) {
      this.configure(this.pendingVad)
      this.pendingVad = null
    }
    this.speaking = false
    this.speechFrames = 0
    this.silenceMs = 0
    this.speechMs = 0
    this.preRoll = []
    this.preRollBytes = 0
    this.utterance = []
    this.utteranceBytes = 0
  },

  threshold() {
    const sensitivity = Math.max(
      0,
      Math.min(1, Number(this.vad.sensitivity ?? 0.6))
    )
    return Math.max(
      this.noiseFloor * (1.6 + (1 - sensitivity) * 2.4),
      0.003 + (1 - sensitivity) * 0.02
    )
  },

  handleFrame(event) {
    if (!this.running || this.paused) return
    const input = event.inputBuffer.getChannelData(0)
    const pcm = this.toPcm16(input)
    const rms = Math.sqrt(
      input.reduce((sum, value) => sum + value * value, 0) /
        Math.max(1, input.length)
    )
    const frameMs = (input.length / this.sampleRate) * 1000
    const speech = this.vad.enabled === false ? true : rms > this.threshold()

    if (!this.speaking) {
      this.noiseFloor = this.noiseFloor * 0.95 + rms * 0.05
      if (this.vad.enabled !== false) {
        if (speech) this.speechFrames += 1
        else this.speechFrames = 0
        // 连续两帧超过阈值才算人声开始，避免单帧尖峰误触发。
        if (this.speechFrames >= 2) {
          this.speaking = true
          this.silenceMs = 0
          this.speechMs = 0
          this.utterance = this.preRoll.slice()
          this.utteranceBytes = this.preRollBytes
          this.preRoll = []
          this.preRollBytes = 0
          setSttPhase('SPEECH_DETECTED')
          this.emit('onSpeechStart', concatPcm(this.utterance))
        }
      } else if (this.vad.enabled === false) {
        if (!this.speaking) {
          this.speaking = true
          this.silenceMs = 0
          this.speechMs = 0
          setSttPhase('SPEECH_DETECTED')
          this.emit('onSpeechStart', new Uint8Array(0))
        }
      }
      if (!this.speaking) {
        this.pushPreRoll(pcm)
        this.pushLevel(rms)
        return
      }
    }

    // 在采集帧内切句，保留跨上限的剩余 PCM，避免每次切句丢掉帧尾。
    const limits = sttClient.current?.cfg?.limits || chatty.settings?.limits
    const bound =
      Math.floor(
        Math.min(
          limits?.maxAudioBytes - 44 || 4194260,
          (limits?.maxDurationSeconds || 30) * 32000
        ) / 2
      ) * 2
    const available = Math.max(0, bound - this.utteranceBytes),
      accepted = pcm.subarray(0, available),
      remainder = pcm.subarray(accepted.length)
    this.utterance.push(accepted)
    this.utteranceBytes += accepted.length
    this.speechMs += accepted.length / 32
    if (accepted.length) this.emit('onFrame', accepted)
    if (speech) this.silenceMs = 0
    else this.silenceMs += frameMs
    this.pushLevel(rms)

    if (this.utteranceBytes >= bound) {
      this.finishUtterance('limit')
      if (this.running && sttClient.active && remainder.length) {
        this.speaking = true
        this.emit('onSpeechStart', new Uint8Array(0))
        if (this.running) {
          this.utterance = [remainder]
          this.utteranceBytes = remainder.length
          this.speechMs = remainder.length / 32
          this.emit('onFrame', remainder)
        }
      }
      return
    }

    if (
      this.vad.enabled !== false &&
      this.silenceMs >= this.vad.silence_timeout_ms
    ) {
      this.finishUtterance('silence')
    }
  },

  finishUtterance(reason) {
    if (!this.speaking) return
    const pcm = concatPcm(this.utterance)
    const durationMs = this.speechMs
    const wasSpeech = durationMs >= this.vad.min_speech_ms
    this.resetUtterance()
    if (wasSpeech) {
      setSttPhase('TRANSCRIBING')
      this.emit('onSpeechEnd', pcm, { durationMs, reason })
    } else {
      this.emit('onSpeechDiscard', { durationMs, reason })
      if (this.running && !this.paused) setSttPhase('LISTENING')
    }
  },

  pushPreRoll(pcm) {
    const cap = chatty.settings?.limits
    const limit = Math.min(
      this.preRollLimit || 0,
      cap?.maxAudioBytes - 44 || 4194260,
      (cap?.maxDurationSeconds || 30) * 32000
    )
    if (limit <= 0) return
    this.preRoll.push(pcm)
    this.preRollBytes += pcm.length
    while (this.preRollBytes > limit && this.preRoll.length > 1) {
      const dropped = this.preRoll.shift()
      this.preRollBytes -= dropped.length
    }
    if (this.preRollBytes > limit) {
      const trim = this.preRollBytes - limit
      this.preRoll[0] = this.preRoll[0].subarray(Math.ceil(trim / 2) * 2)
      this.preRollBytes = this.preRoll[0].length
    }
  },

  pushLevel(rms) {
    const level = Math.max(0, Math.min(1, rms * 12))
    this.levels.push(level)
    if (this.levels.length > 24) this.levels.shift()
    chatty.levels = this.levels.slice()
    this.emit('onLevel', chatty.levels)
  },

  emit(name, ...args) {
    const handler = this.callbacks && this.callbacks[name]
    if (typeof handler !== 'function') return
    try {
      handler(...args)
    } catch (error) {
      if (typeof this.callbacks.onError === 'function')
        this.callbacks.onError(error)
    }
  },

  /** Float32 [-1,1] → PCM16 小端字节。 */
  toPcm16(input) {
    if (this.sampleRate !== TARGET_SAMPLE_RATE) {
      const tail = this.resampleTail || new Float32Array(0),
        merged = new Float32Array(tail.length + input.length)
      merged.set(tail)
      merged.set(input, tail.length)
      const values = [],
        step = this.sampleRate / TARGET_SAMPLE_RATE
      let position = this.resamplePosition || 0
      while (position + 1 < merged.length) {
        const i = Math.floor(position),
          fraction = position - i
        values.push(merged[i] * (1 - fraction) + merged[i + 1] * fraction)
        position += step
      }
      const used = Math.min(merged.length, Math.floor(position))
      this.resampleTail = merged.slice(used)
      this.resamplePosition = position - used
      input = Float32Array.from(values)
    }
    const out = new Uint8Array(input.length * 2)
    const view = new DataView(out.buffer)
    for (let i = 0; i < input.length; i += 1) {
      const value = Math.max(-1, Math.min(1, input[i]))
      view.setInt16(i * 2, value < 0 ? value * 0x8000 : value * 0x7fff, true)
    }
    return out
  }
}

function concatPcm(chunks) {
  const list = (chunks || []).filter((item) => item && item.length)
  const total = list.reduce((sum, item) => sum + item.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const item of list) {
    out.set(item, offset)
    offset += item.length
  }
  return out
}
