// 宿主路由共用的纯 HTTP 工具：不依赖 cordis，不做网络请求。

export function writeJson(res, code, body) {
  try {
    res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify(body))
  } catch { /* socket 可能已经关闭 */ }
}

/**
 * 读取请求体，带硬性大小上限，防止把内存打满。
 * @param {import('node:stream').Readable} req
 * @param {number} maxBytes
 * @returns {Promise<Buffer>}
 */
export function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > maxBytes) { reject(new Error('body too large')); req.destroy(); return }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

/** 判断地址是否为本机回环地址。 */
export function isLoopback(addr) {
  if (!addr) return false
  const clean = String(addr).replace(/^::ffff:/, '')
  return clean === '127.0.0.1' || clean === '::1' || clean === 'localhost'
}

/**
 * 请求来源可信校验：回环地址或同源页面。
 * 消耗额度、改变状态的 POST 路由必须过这一关，失败即拒绝（fail-closed）。
 * @param {import('node:http').IncomingMessage} req
 * @returns {boolean}
 */
export function isTrustedCaller(req) {
  if (!req) return false
  const remote = (req.socket && req.socket.remoteAddress) || (req.connection && req.connection.remoteAddress) || ''
  if (isLoopback(remote)) return true

  const secSite = String((req.headers && req.headers['sec-fetch-site']) || '').toLowerCase()
  if (secSite === 'same-origin' || secSite === 'same-site') return true
  if (secSite === 'cross-site') return false

  const host = String((req.headers && req.headers.host) || '').toLowerCase()
  const origin = String((req.headers && req.headers.origin) || '').trim().toLowerCase()
  if (origin) {
    try {
      if (new URL(origin).host === host) return true
    } catch { /* 非法 URL 一律不可信 */ }
    return false
  }

  const referer = String((req.headers && req.headers.referer) || '').trim().toLowerCase()
  if (referer) {
    try {
      if (new URL(referer).host === host) return true
    } catch { /* 非法 URL 一律不可信 */ }
    return false
  }

  return false
}

/** SSE 响应头（供流式 STT 事件与语音片段事件复用）。 */
export function writeSseHead(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  try { res.write(': connected\n\n') } catch { /* 已关闭 */ }
}

/** 向 SSE 客户端发送一条事件，返回是否写入成功。 */
export function writeSse(res, event, data) {
  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    return true
  } catch {
    return false
  }
}

export function parseJsonBody(raw) {
  try {
    const value = JSON.parse(raw.toString('utf8') || '{}')
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return value
  } catch {
    return {}
  }
}
