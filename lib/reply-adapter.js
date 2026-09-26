// 把 DSH 的 session 事件适配成语音流水线需要的最小事件集。
//
// 只关心三件事：
//   reply.delta   Assistant 文本（进入 Speech Buffer）
//   reply.end     一轮回复正常结束（flush Buffer）
//   reply.cancel  回复被打断（清空队列）
// 其余事件（工具调用、日志、调试信息）一律不进入语音通道（需求 §12.1）。
//
// 事件形状实测（DSH v3 会话格式，见 known-event-types.js）：
//   - v0 的 `assistant/chunk`（text-delta 增量）已退役，当前事件流里不存在；
//   - Assistant 输出为 `assistant/message`：data = { turn, step, message, usage, stream }，
//     正文在 data.message.content（内容块数组：{type:'text',text} 为正文、
//     {type:'reasoning',text} 为思考过程——思考不进语音）。
//   - `session/event` 总线名未变（dsh-session 内部同样使用）。

/** 从 message.content 里提取正文文本（只取 text 块，跳过 reasoning 等块）。 */
export function extractMessageText(message) {
  const content = message && Array.isArray(message.content) ? message.content : []
  return content
    .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('')
}

export function adaptSessionEvent(session, event) {
  if (!session || !event || !event.type || !event.data) return null
  const conversationId = String(session.id || '')
  const seq = Number(event.seq)
  if (!conversationId || !Number.isInteger(seq)) return null
  const base = { conversationId, eventId: `${conversationId}:${seq}`, seq }

  // v0 遗留格式（当前事件流不再出现，保留以兼容旧会话回放）。
  if (event.type === 'assistant/chunk') {
    const { turn, step, chunk } = event.data
    if (!chunk || chunk.type !== 'text-delta' || typeof chunk.text !== 'string' || !chunk.text) return null
    return { ...base, type: 'reply.delta', turnId: turn, stepId: step, channel: 'user-facing', text: chunk.text }
  }

  if (event.type === 'assistant/message') {
    const { turn, step, message, interrupted } = event.data
    if (interrupted) {
      return {
        ...base,
        type: 'reply.cancel',
        turnId: turn,
        stepId: step,
        messageId: message && message.id ? String(message.id) : `${conversationId}:${turn}:${step}`,
        channel: 'user-facing',
      }
    }
    const text = extractMessageText(message)
    if (!text) return null // 纯 reasoning / 无正文消息不进语音通道
    return { ...base, type: 'reply.delta', turnId: turn, stepId: step, channel: 'user-facing', text }
  }

  if (event.type === 'turn/end') {
    const { turn, reason } = event.data
    const successful = reason && (reason.kind === 'stop' || reason.kind === 'completed' || reason === 'stop' || reason === 'completed')
    return { ...base, type: successful ? 'reply.end' : 'reply.cancel', turnId: turn, finishScope: 'turn', reason }
  }

  return null
}
