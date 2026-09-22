// 音频工具：格式探测、WAV 解析/封装、字节拼接。
//
// 用途：
//  - 浏览器把录音以 webm/ogg/wav 上传，Provider 需要知道真实格式；
//  - 流式 STT 传的是裸 PCM16，需要按采样率换算字节数与分段长度；
//  - 伪流式与 TTS 需要把分片拼成一个 Buffer。

export function sniffAudioFormat(input) {
  const bytes = toUint8(input)
  if (!bytes || bytes.length < 4) return 'unknown'
  const ascii = (start, length) => String.fromCharCode(...bytes.slice(start, start + length))
  if (ascii(0, 4) === 'RIFF' && bytes.length >= 12 && ascii(8, 4) === 'WAVE') return 'wav'
  if (ascii(0, 4) === 'OggS') return 'ogg'
  if (bytes.length >= 3 && ascii(0, 3) === 'ID3') return 'mp3'
  if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return 'mp3'
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return 'webm'
  if (bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0x00 && (bytes[3] === 0x18 || bytes[3] === 0x1c || bytes[3] === 0x20)) return 'mp4'
  if (bytes.length >= 12 && ascii(4, 4) === 'ftyp') return 'mp4'
  return 'unknown'
}

export function parseWavHeader(input) {
  const bytes = toUint8(input)
  if (!bytes || bytes.length < 44 || sniffAudioFormat(bytes) !== 'wav') return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const channels = view.getUint16(22, true)
  const sampleRate = view.getUint32(24, true)
  const bitsPerSample = view.getUint16(34, true)
  // 顺序扫描 chunk，找到 data 的偏移，避免遇到 LIST/fact 等额外 chunk 时读错。
  let offset = 12
  while (offset + 8 <= bytes.length) {
    const id = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3])
    const size = view.getUint32(offset + 4, true)
    if (id === 'data') {
      return { sampleRate, channels, bitsPerSample, dataOffset: offset + 8, dataSize: size }
    }
    offset += 8 + size + (size % 2)
  }
  return { sampleRate, channels, bitsPerSample, dataOffset: 44, dataSize: Math.max(0, bytes.length - 44) }
}

export function concatBytes(chunks) {
  const list = (Array.isArray(chunks) ? chunks : []).map(toUint8).filter((item) => item && item.length)
  const total = list.reduce((sum, item) => sum + item.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const item of list) { out.set(item, offset); offset += item.length }
  return out
}

/** 把 PCM16（默认单声道 16k）封装成带 44 字节头的 WAV，供只接受容器格式的 Provider 使用。 */
export function pcm16ToWav(input, options = {}) {
  const pcm = toUint8(input)
  const sampleRate = Math.max(8000, Number(options.sampleRate) || 16000)
  const channels = Math.max(1, Number(options.channels) || 1)
  const byteRate = sampleRate * channels * 2
  const header = new Uint8Array(44)
  const view = new DataView(header.buffer)
  const writeAscii = (offset, text) => {
    for (let i = 0; i < text.length; i += 1) header[offset + i] = text.charCodeAt(i)
  }
  writeAscii(0, 'RIFF')
  view.setUint32(4, 36 + pcm.length, true)
  writeAscii(8, 'WAVE')
  writeAscii(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)          // PCM
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, channels * 2, true)
  view.setUint16(34, 16, true)
  writeAscii(36, 'data')
  view.setUint32(40, pcm.length, true)
  return concatBytes([header, pcm])
}

/** 16bit 单声道下，一段毫秒数对应多少字节。 */
export function pcm16BytesForMs(ms, sampleRate = 16000, channels = 1) {
  return Math.max(0, Math.round((Number(ms) || 0) * sampleRate * channels * 2 / 1000))
}

function toUint8(input) {
  if (!input) return null
  if (input instanceof Uint8Array) return input
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(input)) return new Uint8Array(input)
  if (input instanceof ArrayBuffer) return new Uint8Array(input)
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
  if (Array.isArray(input)) return Uint8Array.from(input)
  return null
}
