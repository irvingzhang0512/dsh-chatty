// 润色与语音摘要：都走 DSH 当前 Session / 当前配置的 LLM（需求 §6、§13）。
//
// 设计红线：润色与摘要都是「尽力而为」——任何失败都返回原文/返回 null，
// 绝不能让一次模型抖动把用户的语音输入卡住。
//
// 依赖全部注入，测试可以完全离线运行。

export const DEFAULT_POLISH_PROMPT = [
  '将以下语音识别内容整理为自然、通顺的文字。',
  '修正明显的语音识别错误和口语重复。',
  '不要改变原意。',
  '不要增加用户没有表达的信息。',
  '只输出整理后的正文，不要解释。',
].join('\n')

export const DEFAULT_SPEECH_SUMMARY_PROMPT = [
  '下面是一段即将被朗读出来的内容（可能是表格或列表）。',
  '请把它改写成适合口头表达的中文，保留关键数字与结论，',
  '不要逐行逐列念出结构符号，不要输出 Markdown 标记，',
  '控制在 120 字以内，只输出改写后的正文。',
].join('\n')

/**
 * @param {object} deps
 * @param {(ref: string) => Promise<string>} [deps.resolveKey]
 * @param {typeof fetch} [deps.fetchImpl]
 * @param {() => object} deps.getConfig 读取实时配置
 * @param {{ stream: Function }|null} [deps.llm] DSH LLM 服务
 * @param {() => ({provider: string, model: string}|null)} [deps.getAgentDefaultModel]
 * @param {Function} [deps.createUserMessage] 便于测试注入
 */
export function createLlmTextRunner(deps = {}) {
  const fetchImpl = deps.fetchImpl || globalThis.fetch
  const getConfig = typeof deps.getConfig === 'function' ? deps.getConfig : () => ({})

  return async function runLlmText(ask, options = {}, signal) {
    if (!ask) return null
    const cfg = getConfig() || {}
    // 配置是嵌套的（polish.provider / polish.model_id / …）；
    // 同时接受扁平写法，方便单测与旧配置直接调用。
    const polish = cfg.polish && typeof cfg.polish === 'object' ? cfg.polish : {}
    const baseUrl = options.baseUrl || polish.base_url || cfg.polishBaseUrl || ''
    const provider = options.provider || polish.provider || cfg.polishProvider || ''
    const model = options.model || polish.model_id || cfg.polishModelId || ''
    const credential = options.credential || polish.key_env || cfg.polishKeyEnv || ''

    // 1) 显式配置的 OpenAI 兼容端点优先，便于本地模型 / 私有网关。
    if (baseUrl) {
      try {
        const headers = { 'content-type': 'application/json' }
        if (credential && typeof deps.resolveKey === 'function') {
          const key = await deps.resolveKey(credential)
          if (key) headers.authorization = 'Bearer ' + key
        }
        const res = await fetchImpl(String(baseUrl).replace(/\/+$/, '') + '/chat/completions', {
          method: 'POST',
          headers,
          signal,
          body: JSON.stringify({ model: model || 'local-model', messages: [{ role: 'user', content: ask }] }),
        })
        if (!res.ok) return null
        const data = await res.json().catch(() => null)
        const text = data && data.choices && data.choices[0] && data.choices[0].message
          && data.choices[0].message.content
        return text ? String(text).trim() : null
      } catch {
        return null
      }
    }

    // 2) 否则用 DSH 当前模型（provider/model 取配置或 agentDefaultModel）。
    const llm = deps.llm
    if (!llm || typeof llm.stream !== 'function') return null
    try {
      const selected = typeof deps.getAgentDefaultModel === 'function' ? deps.getAgentDefaultModel() : null
      const useProvider = provider || (selected && selected.provider) || ''
      const useModel = model || (selected && selected.model) || ''
      if (!useProvider || !useModel) return null
      const createUserMessage = deps.createUserMessage
        || (await import('@deepseek-ai/dsh-llm')).createUserMessage
      let acc = ''
      for await (const chunk of llm.stream({
        provider: useProvider,
        model: useModel,
        messages: [createUserMessage({ content: [{ type: 'text', text: ask }], source: { kind: 'user' } })],
        signal,
      })) {
        if (chunk && chunk.type === 'text-delta' && typeof chunk.text === 'string') acc += chunk.text
      }
      const clean = acc.trim()
      return clean || null
    } catch {
      return null
    }
  }
}

/** 返回 async (text, options, signal) => string；失败时原样返回输入。 */
export function createPolishText(deps = {}) {
  const run = createLlmTextRunner(deps)
  const getConfig = typeof deps.getConfig === 'function' ? deps.getConfig : () => ({})
  return async function polishText(text, options = {}, signal) {
    const source = String(text == null ? '' : text)
    if (!source.trim()) return source
    const cfg = getConfig() || {}
    if (cfg.polish && cfg.polish.enabled === false) return source
    const prompt = options.prompt || (cfg.polish && cfg.polish.prompt) || DEFAULT_POLISH_PROMPT
    const out = await run(prompt + '\n\n' + source, options, signal)
    return out || source
  }
}

/**
 * Speech Renderer 的 LLM 摘要后端：返回 async (kind, raw, signal) => string|null。
 * null 表示「这次不要用模型」，Renderer 会回落到规则摘要。
 */
export function createSpeechSummarizer(deps = {}) {
  const run = createLlmTextRunner(deps)
  const getConfig = typeof deps.getConfig === 'function' ? deps.getConfig : () => ({})
  return async function summarizeBlock(kind, raw, signal) {
    const cfg = getConfig() || {}
    if (cfg.tts && cfg.tts.llm_summary === false) return null
    const source = String(raw == null ? '' : raw).trim()
    if (!source) return null
    // 太短的内容规则摘要就够，没必要花一次模型调用。
    if (source.length < 80) return null
    const prompt = (cfg.tts && cfg.tts.summary_prompt) || DEFAULT_SPEECH_SUMMARY_PROMPT
    const out = await run(`${prompt}\n\n[内容类型：${kind}]\n\n${source}`, {}, signal)
    return out || null
  }
}
