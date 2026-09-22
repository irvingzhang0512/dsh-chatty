// 伪流式（分段批量）STT 适配层。
//
// 用途：给「只有批量识别、没有原生流式」的 Provider（例如硅基流动的 OpenAI 兼容
// `/audio/transcriptions`）提供 partial 体验。做法是把累积的 PCM16 音频按 chunkMs
// 切成固定时长的片段，每满一段就调用一次批量转录并作为 partial 回调；stop() 时对
// 剩余音频做最后一次转录作为 final。
//
// 协议来源：无外部协议，纯本地分段策略。WAV 封装与 `lib/audio.js` 的
// `pcm16ToWav(pcm, { sampleRate, channels })` 语义一致；这里保留一份本地实现是因为
// 它额外支持 `bitsPerSample`（伪流式需要按位深换算分段字节数），改动 lib/audio.js
// 会牵动其它调用方，因此 V1 允许这处有意的重复实现。
//
// 已知限制 / 取舍：
// 1. 每个片段独立识别，段与段之间不共享上下文，词语可能被切断（「语音」被切成「语」+「音」）。
// 2. 上一次转录尚未返回时会并发发起下一段；若某个分段的结果返回时已经有更新的分段结果
//    交付过，该过期结果被丢弃（保证 partial 单调前进，旧文本不会覆盖新文本）。
// 3. final 文本是「最后一段」的识别结果（剩余音频的转录；若没有剩余音频则复用最后
//    一次 partial 的文本），不是整段 utterance 的拼接。调用方应当用 final 覆盖最后
//    一次 partial，而不是把它追加到 partial 之后。
// 4. 除 WAV 头外不做重采样/重封装，调用方必须保证输入是 PCM16 单声道。

/**
 * 把 PCM16 裸数据包成 WAV 容器（44 字节标准头）。
 * @param {Uint8Array|ArrayBuffer} pcm 裸 PCM 数据
 * @param {{ sampleRate?: number, channels?: number, bitsPerSample?: number }} [options]
 * @returns {Uint8Array}
 */
export function pcm16ToWav(pcm, options = {}) {
  const sampleRate = Number(options.sampleRate) > 0 ? Number(options.sampleRate) : 16000
  const channels = Number(options.channels) > 0 ? Number(options.channels) : 1
  const bitsPerSample = Number(options.bitsPerSample) > 0 ? Number(options.bitsPerSample) : 16
  const data = toBytes(pcm)
  const header = Buffer.alloc(44)
  const blockAlign = (channels * bitsPerSample) / 8
  header.write('RIFF', 0, 'ascii')
  header.writeUInt32LE(36 + data.length, 4)
  header.write('WAVE', 8, 'ascii')
  header.write('fmt ', 12, 'ascii')
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20) // PCM
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * blockAlign, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(bitsPerSample, 34)
  header.write('data', 36, 'ascii')
  header.writeUInt32LE(data.length, 40)
  return new Uint8Array(Buffer.concat([header, Buffer.from(data)]))
}

/**
 * 创建伪流式 STT 流。
 *
 * @param {object} options
 * @param {(request: { audio: Uint8Array, mimeType: string, language: string, signal?: AbortSignal, final: boolean, index: number }) => Promise<string|{text?: string}>} options.transcribe
 *   批量转录函数（可注入假实现以便测试）；返回值可以是字符串或 `{ text }`。
 * @param {number} [options.sampleRate=16000] 输入 PCM 采样率
 * @param {number} [options.channels=1] 声道数
 * @param {number} [options.bitsPerSample=16] 位深
 * @param {number} [options.chunkMs=1200] 分段时长（毫秒）
 * @param {string} [options.language] 语言
 * @param {string} [options.mimeType='audio/wav'] 送给 transcribe 的 MIME
 * @param {(bytes: Uint8Array, meta: object) => Uint8Array} [options.wrapChunk] 自定义封装函数
 * @param {AbortSignal} [options.signal]
 * @param {(text: string) => void} [options.onPartial]
 * @param {(text: string) => void} [options.onFinal]
 * @param {(error: Error) => void} [options.onError]
 * @param {{ warn?: Function, debug?: Function }} [options.logger]
 * @returns {{ pushAudio: Function, stop: () => Promise<void>, cancel: Function, readonly closed: boolean, readonly state: string }}
 */
export function createPseudoStream(options = {}) {
  const transcribe = options.transcribe
  if (typeof transcribe !== 'function') {
    throw new TypeError('createPseudoStream 需要注入 transcribe 函数')
  }
  const sampleRate = Number(options.sampleRate) > 0 ? Number(options.sampleRate) : 16000
  const channels = Number(options.channels) > 0 ? Number(options.channels) : 1
  const bitsPerSample = Number(options.bitsPerSample) > 0 ? Number(options.bitsPerSample) : 16
  const chunkMs = Number(options.chunkMs) > 0 ? Number(options.chunkMs) : 1200
  const language = typeof options.language === 'string' ? options.language : ''
  const mimeType = typeof options.mimeType === 'string' && options.mimeType ? options.mimeType : 'audio/wav'
  const signal = options.signal
  const logger = options.logger
  const wrapChunk = typeof options.wrapChunk === 'function'
    ? options.wrapChunk
    : (bytes, meta) => pcm16ToWav(bytes, meta)

  // 每段字节数：sampleRate * 声道 * (位深/8) * chunkMs / 1000
  const chunkBytes = Math.max(1, Math.round((sampleRate * channels * (bitsPerSample / 8) * chunkMs) / 1000))

  let buffer = new Uint8Array(0)
  let generation = 0 // 每次发起转录递增；结果回来时用序号判断是否已被更新
  let lastDeliveredGen = 0 // 已交付的最大分段序号，用于丢弃过期结果
  let inFlight = null // { gen, promise } 最近一次 partial 转录
  let lastPartial = ''
  let state = 'open' // open | stopping | closed
  let cancelled = false
  let stopPromise = null

  const emitPartial = (text) => {
    try { options.onPartial?.(text) } catch { /* 回调异常不应中断音频流 */ }
  }
  const emitFinal = (text) => {
    try { options.onFinal?.(text) } catch { /* 同上 */ }
  }
  const emitError = (error) => {
    try { options.onError?.(error) } catch { /* 同上 */ }
  }

  function removeAbort() {
    signal?.removeEventListener?.('abort', cancel)
  }

  function normalizeText(value) {
    if (typeof value === 'string') return value.trim()
    if (value && typeof value.text === 'string') return value.text.trim()
    return ''
  }

  /** 发起一次转录；已被更新的结果取代（或已取消）时返回 stale=true。 */
  async function runTranscribe(raw, isFinal) {
    const gen = ++generation
    const payload = wrapChunk(raw, { sampleRate, channels, bitsPerSample, final: isFinal })
    let promise
    try {
      promise = Promise.resolve(transcribe({
        audio: payload,
        mimeType,
        language,
        signal,
        final: isFinal,
        index: gen,
      }))
    } catch (error) {
      promise = Promise.reject(error)
    }
    if (!isFinal) inFlight = { gen, promise }
    let text = ''
    let error = null
    try {
      text = normalizeText(await promise)
    } catch (caught) {
      error = caught instanceof Error ? caught : new Error(String(caught))
    }
    // 已经有更新的分段结果交付过 → 本结果是过期结果，丢弃。
    if (cancelled || gen < lastDeliveredGen) return { stale: true, gen, text: '', error: null }
    return { stale: false, gen, text, error }
  }

  async function flushPartial(segment) {
    const result = await runTranscribe(segment, false)
    if (result.stale || cancelled || state !== 'open') return
    if (result.error) {
      logger?.warn?.(`伪流式 STT 分段转录失败：${result.error.message}`)
      emitError(result.error)
      return
    }
    lastDeliveredGen = result.gen
    lastPartial = result.text
    if (result.text) emitPartial(result.text)
  }

  function pushAudio(bytes) {
    if (cancelled || state !== 'open') return
    const chunk = toBytes(bytes)
    if (!chunk.length) return
    buffer = buffer.length ? concatBytes([buffer, chunk]) : chunk
    while (!cancelled && state === 'open' && buffer.length >= chunkBytes) {
      const segment = buffer.slice(0, chunkBytes)
      buffer = buffer.slice(chunkBytes)
      void flushPartial(segment)
    }
  }

  function stop() {
    if (stopPromise) return stopPromise
    stopPromise = (async () => {
      if (cancelled || state === 'closed') return
      state = 'stopping'
      const tail = buffer
      buffer = new Uint8Array(0)
      let text = ''
      if (tail.length > 0) {
        const result = await runTranscribe(tail, true)
        if (cancelled) return
        if (result.error) {
          emitError(result.error)
          state = 'closed'
          removeAbort()
          return
        }
        if (result.stale) return
        text = result.text
      } else if (inFlight) {
        // 没有剩余音频：等最后一次 partial 回来，并让它只以 final 形式交付
        // （此时 state 已是 stopping，flushPartial 不会再作为 partial 回调）。
        const pending = inFlight
        try {
          text = normalizeText(await pending.promise)
        } catch (error) {
          if (cancelled) return
          emitError(error instanceof Error ? error : new Error(String(error)))
          state = 'closed'
          removeAbort()
          return
        }
        if (cancelled) return
      } else {
        text = lastPartial
      }
      state = 'closed'
      removeAbort()
      emitFinal(text)
    })()
    return stopPromise
  }

  function cancel() {
    if (state === 'closed') return
    cancelled = true
    state = 'closed'
    buffer = new Uint8Array(0)
    inFlight = null
    removeAbort()
  }

  if (signal) {
    if (signal.aborted) cancel()
    else signal.addEventListener?.('abort', cancel, { once: true })
  }

  return {
    pushAudio,
    stop,
    cancel,
    get closed() { return state === 'closed' },
    get state() { return state },
  }
}

function toBytes(input) {
  if (!input) return new Uint8Array(0)
  if (input instanceof Uint8Array) return input
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
  if (input instanceof ArrayBuffer) return new Uint8Array(input)
  if (Array.isArray(input)) return Uint8Array.from(input)
  throw new TypeError('音频数据必须是 Uint8Array / ArrayBuffer')
}

function concatBytes(chunks) {
  let total = 0
  for (const chunk of chunks) total += chunk.length
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}
