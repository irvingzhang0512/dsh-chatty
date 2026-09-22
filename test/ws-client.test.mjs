// 最小 WebSocket 客户端单测：握手、帧编解码、真实本地服务端回环。
// 用 node:http 的 upgrade 事件手写一个只做回声的服务端，不引入任何依赖。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import {
  MinimalWebSocket,
  createWebSocketImpl,
  createFrameParser,
  encodeClientFrame,
  webSocketAccept,
} from '../lib/ws-client.js'

function encodeServerFrame(payload, opcode = 0x2) {
  const body = typeof payload === 'string' ? Buffer.from(payload, 'utf8') : Buffer.from(payload)
  let header
  if (body.length < 126) {
    header = Buffer.alloc(2)
    header[1] = body.length
  } else if (body.length < 65536) {
    header = Buffer.alloc(4)
    header[1] = 126
    header.writeUInt16BE(body.length, 2)
  } else {
    header = Buffer.alloc(10)
    header[1] = 127
    header.writeBigUInt64BE(BigInt(body.length), 2)
  }
  header[0] = 0x80 | opcode
  return Buffer.concat([header, body])
}

/** 起一个回声 WebSocket 服务端，返回 { url, close, headersSeen }。 */
async function startEchoServer(options = {}) {
  const headersSeen = []
  const sockets = new Set()
  const server = createServer((req, res) => { res.writeHead(400); res.end() })
  server.on('upgrade', (req, socket) => {
    headersSeen.push(req.headers)
    if (options.reject) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
      return
    }
    const accept = webSocketAccept(req.headers['sec-websocket-key'])
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n'
      + 'Upgrade: websocket\r\n'
      + 'Connection: Upgrade\r\n'
      + `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
    )
    sockets.add(socket)
    const parse = createFrameParser()
    socket.on('data', (chunk) => {
      for (const frame of parse(chunk)) {
        if (frame.opcode === 0x8) {
          socket.write(encodeServerFrame(frame.payload, 0x8))
          socket.end()
          continue
        }
        if (frame.opcode === 0x9) { socket.write(encodeServerFrame(frame.payload, 0xa)); continue }
        const opcode = frame.opcode === 0x1 ? 0x1 : 0x2
        socket.write(encodeServerFrame(frame.payload, opcode))
      }
    })
    socket.on('error', () => { /* 客户端主动断开 */ })
    socket.on('close', () => sockets.delete(socket))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const { port } = server.address()
  return {
    url: `ws://127.0.0.1:${port}/stream`,
    headersSeen,
    async close() {
      for (const socket of sockets) { try { socket.destroy() } catch { /* 已关闭 */ } }
      server.close()
      await once(server, 'close').catch(() => {})
    },
  }
}

function waitFor(socket, event, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeoutMs)
    socket.on(event, (payload) => { clearTimeout(timer); resolve(payload) })
  })
}

test('Sec-WebSocket-Accept 与 RFC 6455 示例一致', () => {
  assert.equal(webSocketAccept('dGhlIHNhbXBsZSBub25jZQ=='), 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=')
})

test('客户端帧编码是 masked 的，且能被解析器还原', () => {
  for (const size of [0, 5, 125, 126, 300, 70000]) {
    const payload = Buffer.alloc(size, 7)
    const frame = encodeClientFrame(payload, 0x2)
    assert.equal((frame[0] & 0x80) !== 0, true, 'FIN 必须置位')
    assert.equal((frame[1] & 0x80) !== 0, true, '客户端帧必须 mask')
    const parse = createFrameParser()
    const frames = parse(frame)
    assert.equal(frames.length, 1)
    assert.equal(frames[0].opcode, 0x2)
    assert.equal(frames[0].payload.length, size)
    assert.deepEqual(Array.from(frames[0].payload), Array.from(payload))
  }
})

test('解析器能跨 TCP 分片还原帧', () => {
  const payload = Buffer.from('分片测试 payload 一二三')
  const frame = encodeClientFrame(payload, 0x1)
  const parse = createFrameParser()
  assert.deepEqual(parse(frame.subarray(0, 3)), [])
  assert.deepEqual(parse(frame.subarray(3, 9)), [])
  const frames = parse(frame.subarray(9))
  assert.equal(frames.length, 1)
  assert.equal(frames[0].payload.toString('utf8'), payload.toString('utf8'))
})

test('端到端：自定义 Header 随握手发出，二进制/文本消息回环，close 触发 onclose', async () => {
  const server = await startEchoServer()
  try {
    const socket = new MinimalWebSocket(server.url, {
      headers: { 'X-Api-App-Key': 'app-123', 'X-Api-Access-Key': 'secret-456' },
    })
    const opened = waitFor(socket, 'open')
    await opened
    assert.equal(socket.readyState, MinimalWebSocket.OPEN)
    assert.equal(server.headersSeen.length, 1)
    assert.equal(server.headersSeen[0]['x-api-app-key'], 'app-123')
    assert.equal(server.headersSeen[0]['x-api-access-key'], 'secret-456')
    assert.equal(server.headersSeen[0].upgrade.toLowerCase(), 'websocket')

    const binary = new Uint8Array([1, 2, 3, 250, 251])
    const messagePromise = waitFor(socket, 'message')
    assert.equal(socket.send(binary), true)
    const message = await messagePromise
    assert.equal(message.data instanceof Uint8Array, true)
    assert.deepEqual(Array.from(message.data), Array.from(binary))

    const textPromise = waitFor(socket, 'message')
    socket.send('你好，语音')
    const textMessage = await textPromise
    assert.equal(textMessage.data, '你好，语音')

    const closed = waitFor(socket, 'close')
    socket.close(1000, 'done')
    const closeEvent = await closed
    assert.equal(socket.readyState, MinimalWebSocket.CLOSED)
    assert.equal(closeEvent.code, 1000)
    assert.equal(socket.send(new Uint8Array([9])), false, '关闭后 send 必须失败')
  } finally {
    await server.close()
  }
})

test('端到端：握手被拒时触发 onerror 且状态为 CLOSED', async () => {
  const server = await startEchoServer({ reject: true })
  try {
    const socket = new MinimalWebSocket(server.url, { headers: {} })
    const error = await waitFor(socket, 'error')
    assert.equal(String(error.message).includes('401'), true)
    assert.equal(socket.readyState, MinimalWebSocket.CLOSED)
  } finally {
    await server.close()
  }
})

test('createWebSocketImpl 返回可直接 new 的类', () => {
  const Impl = createWebSocketImpl()
  assert.equal(typeof Impl, 'function')
  assert.equal(Impl, MinimalWebSocket)
  const socket = new Impl('ws://127.0.0.1:1/none', { headers: {} })
  const closed = waitFor(socket, 'close')
  assert.equal(socket.readyState, MinimalWebSocket.CONNECTING)
  return closed
})
