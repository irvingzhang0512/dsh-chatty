// 最小 WebSocket 客户端（RFC 6455），只为实现「能带自定义 Header 的 ws 客户端」。
//
// 为什么需要它：火山引擎的流式 STT 依赖 X-Api-App-Key / X-Api-Access-Key 等
// 自定义请求头，而 Node 的全局 WebSocket（undici 实现）按 WHATWG 规范
// 不允许传 headers。为了不给插件引入运行时依赖，这里用 node:http(s) 的
// upgrade 请求 + 手写帧编解码实现一个够用的客户端。
//
// 支持范围（V1 只覆盖服务端→客户端 unmasked、客户端→服务端 masked 的常见场景）：
//   - 握手校验 Sec-WebSocket-Accept；
//   - 文本 / 二进制 / 分片（continuation）/ ping / pong / close 帧；
//   - 浏览器风格 onopen/onmessage/onerror/onclose 与 ws 风格 on(event, fn) 两种绑定；
//   - send(string | Uint8Array | ArrayBuffer)。
//
// 不支持：permessage-deflate 扩展、客户端作为服务端、超大消息的流式落盘。

import { randomBytes, createHash } from 'node:crypto'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'

// RFC 6455 §1.3 规定的握手魔术字符串（注意不是 258EAFA5-E914-47DA-95CA-5AB5ADF35F20，
// 那是另一个协议的 GUID，写错会让所有服务端拒绝握手）。
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
const MAX_PAYLOAD = 16 * 1024 * 1024

const OPCODE = { CONTINUATION: 0x0, TEXT: 0x1, BINARY: 0x2, CLOSE: 0x8, PING: 0x9, PONG: 0xa }

/** 计算握手响应里的 Sec-WebSocket-Accept。 */
export function webSocketAccept(key) {
  return createHash('sha1').update(String(key) + GUID).digest('base64')
}

/** 编码一个客户端帧（客户端发出的帧必须 mask）。 */
export function encodeClientFrame(data, opcode = OPCODE.BINARY) {
  const payload = typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data)
  const mask = randomBytes(4)
  const length = payload.length
  let header
  if (length < 126) {
    header = Buffer.alloc(2)
    header[1] = 0x80 | length
  } else if (length < 65536) {
    header = Buffer.alloc(4)
    header[1] = 0x80 | 126
    header.writeUInt16BE(length, 2)
  } else {
    header = Buffer.alloc(10)
    header[1] = 0x80 | 127
    header.writeBigUInt64BE(BigInt(length), 2)
  }
  header[0] = 0x80 | opcode
  const masked = Buffer.allocUnsafe(length)
  for (let i = 0; i < length; i += 1) masked[i] = payload[i] ^ mask[i & 3]
  return Buffer.concat([header, mask, masked])
}

/**
 * 创建一个增量帧解析器：把 TCP 分片还原成完整帧。
 * @returns {(chunk: Buffer) => Array<{ fin: boolean, opcode: number, payload: Buffer }>}
 */
export function createFrameParser() {
  let buffer = Buffer.alloc(0)
  return function push(chunk) {
    buffer = buffer.length ? Buffer.concat([buffer, chunk]) : Buffer.from(chunk)
    const frames = []
    while (buffer.length >= 2) {
      const fin = (buffer[0] & 0x80) !== 0
      const opcode = buffer[0] & 0x0f
      const masked = (buffer[1] & 0x80) !== 0
      let length = buffer[1] & 0x7f
      let offset = 2
      if (length === 126) {
        if (buffer.length < 4) break
        length = buffer.readUInt16BE(2)
        offset = 4
      } else if (length === 127) {
        if (buffer.length < 10) break
        const big = buffer.readBigUInt64BE(2)
        if (big > BigInt(MAX_PAYLOAD)) throw new Error('websocket frame too large')
        length = Number(big)
        offset = 10
      }
      let mask = null
      if (masked) {
        if (buffer.length < offset + 4) break
        mask = buffer.subarray(offset, offset + 4)
        offset += 4
      }
      if (buffer.length < offset + length) break
      const payload = Buffer.from(buffer.subarray(offset, offset + length))
      if (mask) for (let i = 0; i < payload.length; i += 1) payload[i] ^= mask[i & 3]
      buffer = buffer.subarray(offset + length)
      frames.push({ fin, opcode, payload })
    }
    return frames
  }
}

export class MinimalWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  constructor(url, options = {}) {
    this.url = String(url || '')
    this.readyState = MinimalWebSocket.CONNECTING
    this.onopen = null
    this.onmessage = null
    this.onerror = null
    this.onclose = null
    this._listeners = new Map()
    this._socket = null
    this._parser = createFrameParser()
    this._fragments = []
    this._fragmentOpcode = null
    this._closed = false
    this._connect(options && options.headers ? options.headers : {})
  }

  /** ws 风格事件绑定，便于同时兼容两种调用方式。 */
  on(event, handler) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set())
    this._listeners.get(event).add(handler)
    return this
  }

  off(event, handler) {
    const set = this._listeners.get(event)
    if (set) set.delete(handler)
    return this
  }

  send(data) {
    if (this.readyState !== MinimalWebSocket.OPEN || !this._socket) return false
    try {
      this._socket.write(encodeClientFrame(data, typeof data === 'string' ? OPCODE.TEXT : OPCODE.BINARY))
      return true
    } catch (error) {
      this._fail(error)
      return false
    }
  }

  close(code = 1000, reason = '') {
    if (this._closed) return
    this.readyState = MinimalWebSocket.CLOSING
    try {
      const body = Buffer.alloc(2 + Buffer.byteLength(reason))
      body.writeUInt16BE(code, 0)
      body.write(reason, 2)
      if (this._socket) this._socket.write(encodeClientFrame(body, OPCODE.CLOSE))
    } catch { /* 对端可能已经断开 */ }
    this._finish(code, reason)
  }

  _connect(headers) {
    let target
    try {
      target = new URL(this.url)
    } catch {
      this._fail(new Error(`invalid websocket url: ${this.url}`))
      return
    }
    if (target.protocol !== 'ws:' && target.protocol !== 'wss:') {
      this._fail(new Error(`unsupported websocket protocol: ${target.protocol}`))
      return
    }
    const key = randomBytes(16).toString('base64')
    const isSecure = target.protocol === 'wss:'
    const send = isSecure ? httpsRequest : httpRequest
    const path = `${target.pathname || '/'}${target.search || ''}`
    const request = send({
      host: target.hostname,
      port: target.port || (isSecure ? 443 : 80),
      path,
      method: 'GET',
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Key': key,
        'Sec-WebSocket-Version': '13',
        ...headers,
      },
    })
    request.on('upgrade', (response, socket, head) => {
      const accept = String(response.headers['sec-websocket-accept'] || '')
      if (accept !== webSocketAccept(key)) {
        socket.destroy()
        this._fail(new Error('websocket handshake failed: bad Sec-WebSocket-Accept'))
        return
      }
      this._socket = socket
      this.readyState = MinimalWebSocket.OPEN
      socket.on('data', (chunk) => this._onData(chunk))
      socket.on('error', (error) => this._fail(error))
      socket.on('close', () => this._finish(1006, 'socket closed'))
      this._emit('open', { type: 'open' })
      if (head && head.length) this._onData(head)
    })
    request.on('response', (response) => {
      this._fail(new Error(`websocket handshake rejected: HTTP ${response.statusCode}`))
    })
    request.on('error', (error) => this._fail(error))
    request.end()
  }

  _onData(chunk) {
    let frames
    try {
      frames = this._parser(chunk)
    } catch (error) {
      this._fail(error)
      return
    }
    for (const frame of frames) {
      if (frame.opcode === OPCODE.PING) {
        try { this._socket.write(encodeClientFrame(frame.payload, OPCODE.PONG)) } catch { /* 已断开 */ }
        continue
      }
      if (frame.opcode === OPCODE.PONG) continue
      if (frame.opcode === OPCODE.CLOSE) {
        const code = frame.payload.length >= 2 ? frame.payload.readUInt16BE(0) : 1005
        this._finish(code, 'peer closed')
        return
      }
      if (frame.opcode === OPCODE.CONTINUATION) {
        this._fragments.push(frame.payload)
      } else {
        this._fragments = [frame.payload]
        this._fragmentOpcode = frame.opcode
      }
      if (!frame.fin) continue
      const payload = Buffer.concat(this._fragments)
      this._fragments = []
      const opcode = this._fragmentOpcode
      this._fragmentOpcode = null
      if (opcode === OPCODE.TEXT) this._emit('message', { type: 'message', data: payload.toString('utf8') })
      else this._emit('message', { type: 'message', data: new Uint8Array(payload) })
    }
  }

  _fail(error) {
    this._emit('error', { type: 'error', message: String(error && error.message || error), error })
    this._finish(1006, String(error && error.message || error))
  }

  _finish(code, reason) {
    if (this._closed) return
    this._closed = true
    this.readyState = MinimalWebSocket.CLOSED
    if (this._socket) {
      try { this._socket.end() } catch { /* 已断开 */ }
      this._socket = null
    }
    this._emit('close', { type: 'close', code, reason })
  }

  _emit(event, payload) {
    const property = this[`on${event}`]
    if (typeof property === 'function') {
      try { property(payload) } catch { /* 回调自己的异常不吞掉后续事件 */ }
    }
    const listeners = this._listeners.get(event)
    if (!listeners) return
    for (const listener of listeners) {
      try { listener(payload) } catch { /* 同上 */ }
    }
  }
}

/** 供宿主注入的工厂：返回一个可 `new Impl(url, { headers })` 的类。 */
export function createWebSocketImpl() {
  return MinimalWebSocket
}

export default MinimalWebSocket
