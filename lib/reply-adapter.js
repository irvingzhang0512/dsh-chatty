// 把 DSH 的 session 事件适配成语音流水线需要的最小事件集。
//
// 只关心三件事：
//   reply.delta   Assistant 文本增量（进入 Speech Buffer）
//   reply.end     一轮回复正常结束（flush Buffer）
//   reply.cancel  回复被打断（清空队列）
// 其余事件（工具调用、日志、调试信息）一律不进入语音通道（需求 §12.1）。

export function adaptSessionEvent(session, event) {
  if (!session || !event || !event.type || !event.data) return null
  const conversationId = String(session.id || '')
  const seq = Number(event.seq)
  if (!conversationId || !Number.isInteger(seq)) return null
  const base = { conversationId, eventId: `${conversationId}:${seq}`, seq }

  if (event.type === 'assistant/chunk') {
    const { turn, step, chunk } = event.data
    if (!chunk || chunk.type !== 'text-delta' || typeof chunk.text !== 'string' || !chunk.text) return null
    return { ...base, type: 'reply.delta', turnId: turn, stepId: step, channel: 'user-facing', text: chunk.text }
  }

  if (event.type === 'assistant/message') {
    const { turn, step, message, interrupted } = event.data
    return {
      ...base,
      type: interrupted ? 'reply.cancel' : 'reply.message',
      turnId: turn,
      stepId: step,
      messageId: message && message.id ? String(message.id) : `${conversationId}:${turn}:${step}`,
      channel: 'user-facing',
    }
  }

  if (event.type === 'turn/end') {
    const { turn, reason } = event.data
    const successful = reason && (reason.kind === 'stop' || reason.kind === 'completed' || reason === 'stop' || reason === 'completed')
    return { ...base, type: successful ? 'reply.end' : 'reply.cancel', turnId: turn, finishScope: 'turn', reason }
  }

  return null
}
