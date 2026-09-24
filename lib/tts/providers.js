/**
 * dsh-chatty — TTS Provider 注册表与 capability（契约见 docs/ARCHITECTURE.md §2.7）。
 *
 * 职责：
 *   1. 声明 Provider 键（TTS_PROVIDER_KEYS）、默认配置（TTS_DEFAULTS）、静态音色表（STATIC_VOICES）；
 *   2. 暴露 capability，UI 据此决定哪些配置项可用；
 *   3. 按名字创建 Provider 实例（volcano / siliconflow）。
 *
 * 本模块同时承载两个 Provider 共用的工具函数（凭据解析、取消/超时作用域、base64 解码、
 * 响应体读取、format/speed 归一化）。volcano.js 与 siliconflow.js 反向 import 这些函数，
 * 形成 ESM 循环导入：这里导出的都是「函数声明」，在模块实例化阶段即完成初始化，且两个
 * Provider 只在函数体内引用它们，因此不存在 TDZ 风险（不要在模块顶层读取这些绑定）。
 *
 * 硬性约束：纯 ESM；只 import 本地文件与 Node 内置模块；禁止 import 任何 npm 包。
 * `fetchImpl` / `resolveKey` / `WebSocketImpl` 全部通过参数注入，便于离线单测。
 */

import { createVolcanoTtsProvider } from './volcano.js'
import { createSiliconFlowTtsProvider } from './siliconflow.js'

/** 受支持的 TTS Provider 键（顺序即 UI 展示顺序）。 */
export const TTS_PROVIDER_KEYS = ['volcano', 'siliconflow']

/**
 * 每个 Provider 的默认配置。
 * 注意：`credential` 是 DSH Credentials 的「引用名」，不是密钥本身；
 * 真实密钥只允许经注入的 `resolveKey(name)` 在宿主端解析，禁止下发浏览器。
 * 字段形状由 ARCHITECTURE.md §2.7 精确约定，不要随意增删。
 * 凭据名用下划线大写：DSH Credentials 的引用名只接受 `[A-Za-z_][A-Za-z0-9_]*`，
 * 宿主侧会把需求文档里的连字符写法归一化到同一个引用。
 */
export const TTS_DEFAULTS = {
  // Agent Plan 语音合成 2.0（HTTP 单请求）：与 STT 同一把方舟 API Key（VOLCENGINE_AGENT_PLAN_API_KEY）。
  // 音色须用 2.0 代（*_uranus_bigtts）；1.0 代音色（*_moon_bigtts）会返回 55000000 音色不匹配。
  volcano: {
    credential: 'VOLCENGINE_AGENT_PLAN_API_KEY',
    model: '',
    voice: 'zh_female_shuangkuaisisi_uranus_bigtts',
    baseUrl: 'https://openspeech.bytedance.com/api/v3/plan/tts/unidirectional',
    resourceId: 'seed-tts-2.0',
    sampleRate: 24000,
    format: 'pcm',
  },
  siliconflow: {
    credential: 'SILICONFLOW_API_KEY',
    model: 'FunAudioLLM/CosyVoice2-0.5B',
    voice: 'FunAudioLLM/CosyVoice2-0.5B:alex',
    baseUrl: 'https://api.siliconflow.cn/v1',
    sampleRate: 24000,
    format: 'pcm',
  },
}

/**
 * 静态音色表（离线兜底 + 火山音色的唯一来源）。
 * 条目形状：{ provider, id, label }；`id` 是直接可传给 synthesize/createStream 的 voice。
 */
export const STATIC_VOICES = [
  // —— 火山引擎（Agent Plan 语音合成 2.0）预置音色：2.0 代音色（*_uranus_bigtts），
  //    来源：https://www.volcengine.com/docs/6561/97465（1.0 代 *_moon_bigtts 音色与
  //    seed-tts-2.0 资源不匹配，不可用）——
  { provider: 'volcano', id: 'zh_female_shuangkuaisisi_uranus_bigtts', label: '爽快思思（女声，2.0）' },
  { provider: 'volcano', id: 'zh_female_wanfengwanwan_uranus_bigtts', label: '晚风晚晚（女声，2.0）' },
  { provider: 'volcano', id: 'zh_male_dayuanxiaowang_uranus_bigtts', label: '大院小王（男声，2.0）' },
  { provider: 'volcano', id: 'zh_female_hongxingnongchang_uranus_bigtts', label: '红星农场（女声，2.0）' },
  { provider: 'volcano', id: 'zh_male_dongbeilaotie_uranus_bigtts', label: '东北老铁（男声，2.0）' },
  { provider: 'volcano', id: 'zh_female_yujie_uranus_bigtts', label: '御姐（女声，2.0）' },
  // —— 硅基流动 CosyVoice2-0.5B 系统预置音色，来源：https://docs.siliconflow.com/cn/userguide/capabilities/text-to-speech ——
  { provider: 'siliconflow', id: 'FunAudioLLM/CosyVoice2-0.5B:alex', label: 'alex（英文男声）' },
  { provider: 'siliconflow', id: 'FunAudioLLM/CosyVoice2-0.5B:benjamin', label: 'benjamin（英文男声）' },
  { provider: 'siliconflow', id: 'FunAudioLLM/CosyVoice2-0.5B:charles', label: 'charles（英文男声）' },
  { provider: 'siliconflow', id: 'FunAudioLLM/CosyVoice2-0.5B:david', label: 'david（英文男声）' },
  { provider: 'siliconflow', id: 'FunAudioLLM/CosyVoice2-0.5B:anna', label: 'anna（英文女声）' },
  { provider: 'siliconflow', id: 'FunAudioLLM/CosyVoice2-0.5B:bella', label: 'bella（英文女声）' },
  { provider: 'siliconflow', id: 'FunAudioLLM/CosyVoice2-0.5B:claire', label: 'claire（英文女声）' },
  { provider: 'siliconflow', id: 'FunAudioLLM/CosyVoice2-0.5B:diana', label: 'diana（英文女声）' },
]

/** 允许的输出音频格式。默认 pcm：浏览器 WebAudio 可直接消费 PCM16（见需求 §19/§20）。 */
export const TTS_FORMATS = ['pcm', 'mp3', 'wav']

/** HTTP 默认超时（毫秒）；可用 config.timeoutMs 覆盖。 */
export const TTS_DEFAULT_TIMEOUT_MS = 30000

/**
 * capability 表。字段含义：
 *   streaming —— createStream 是否可用（两家都是「分片流式」而非双向流式，见各 Provider 文件头说明）；
 *   voices    —— listVoices 是否可用；
 *   speed     —— 是否支持语速；
 *   emotion   —— V1 不实现情感参数透传，两家均为 false；
 *   formats   —— 支持的输出格式；
 *   sampleRate—— 默认输出采样率（Hz），单声道。
 */
const TTS_CAPABILITIES = {
  volcano: {
    streaming: true,
    voices: true,
    speed: true,
    emotion: false,
    formats: ['pcm', 'mp3', 'wav'],
    sampleRate: 24000,
  },
  siliconflow: {
    streaming: true,
    voices: true,
    speed: true,
    emotion: false,
    formats: ['pcm', 'mp3', 'wav'],
    sampleRate: 24000,
  },
}

/**
 * 归一化 Provider 名；未知 Provider 直接抛错（不静默回落，避免配置写错时跑到别的服务）。
 * @param {string} name
 * @returns {'volcano'|'siliconflow'}
 */
export function normalizeTtsProviderKey(name) {
  const key = String(name ?? '').trim().toLowerCase()
  if (!TTS_PROVIDER_KEYS.includes(key)) {
    throw new Error(`unknown TTS provider: ${name}`)
  }
  return key
}

/**
 * 读取某个 Provider 的 capability（返回副本，调用方改不动内部表）。
 * @param {string} name
 * @returns {{ streaming: boolean, voices: boolean, speed: boolean, emotion: boolean, formats: string[], sampleRate: number }}
 */
export function ttsCapability(name) {
  const key = normalizeTtsProviderKey(name)
  const source = TTS_CAPABILITIES[key]
  return { ...source, formats: [...source.formats] }
}

/**
 * 创建 TTS Provider 实例。
 * @param {string} name 'volcano' | 'siliconflow'
 * @param {object} [options]
 * @param {object} [options.config] 用户配置覆盖（voice/model/baseUrl/credential/timeoutMs…）
 * @param {(name: string) => Promise<string|undefined>} [options.resolveKey] DSH Credentials 解析器
 * @param {typeof fetch} [options.fetchImpl] 注入的 fetch（测试用假实现）
 * @param {object} [options.logger] 可选日志器（需要 warn/info 方法）
 * @returns {{ name: string, capability: object, listVoices: Function, synthesize: Function, createStream: Function }}
 */
export function createTtsProvider(name, options = {}) {
  const key = normalizeTtsProviderKey(name)
  const shared = {
    ...options,
    defaults: TTS_DEFAULTS[key],
    staticVoices: STATIC_VOICES,
  }
  return key === 'volcano'
    ? createVolcanoTtsProvider(shared)
    : createSiliconFlowTtsProvider(shared)
}

/* ------------------------------------------------------------------ *
 * 以下为两个 Provider 共用的工具函数（volcano.js / siliconflow.js 复用）
 * ------------------------------------------------------------------ */

/** 去掉 URL 末尾斜杠，避免拼出 `//audio/speech`。 */
export function trimUrl(url) {
  return String(url || '').replace(/\/+$/, '')
}

/**
 * 构造「凭据未配置」错误。契约要求 `error.code === 'credential'`。
 * @param {string} provider
 * @param {string} credentialName
 * @param {unknown} [cause]
 * @returns {Error & { code: string, provider: string, credential: string }}
 */
export function ttsCredentialError(provider, credentialName, cause) {
  const err = new Error(`${provider} TTS credential "${credentialName}" is not configured`)
  err.code = 'credential'
  err.provider = provider
  err.credential = credentialName
  if (cause !== undefined) err.cause = cause
  return err
}

/**
 * 经注入的 resolveKey 解析凭据；空值/未注入/解析失败一律转成 code='credential' 的 Error。
 * @param {string} provider
 * @param {(name: string) => Promise<string|undefined>} resolveKey
 * @param {string} credentialName
 * @returns {Promise<string>}
 */
export async function resolveTtsCredential(provider, resolveKey, credentialName) {
  const label = String(credentialName || '').trim()
  if (typeof resolveKey !== 'function') throw ttsCredentialError(provider, label)
  let value
  try {
    value = await resolveKey(label)
  } catch (err) {
    throw ttsCredentialError(provider, label, err)
  }
  const text = value === undefined || value === null ? '' : String(value).trim()
  if (!text) throw ttsCredentialError(provider, label)
  return text
}

/**
 * 取消作用域：把「外部 signal」与「内部超时」合并成一个可传递给 fetch 的 signal。
 * 返回的 abort() 供 createStream().cancel() 使用；dispose() 必须放在 finally 中调用。
 * @param {AbortSignal} [signal]
 * @param {number} [timeoutMs]
 */
export function createAbortScope(signal, timeoutMs) {
  const controller = new AbortController()
  const onAbort = () => { controller.abort(signal ? signal.reason : undefined) }
  if (signal && typeof signal.addEventListener === 'function') {
    if (signal.aborted) onAbort()
    else signal.addEventListener('abort', onAbort, { once: true })
  }
  let timer = null
  const ms = Number(timeoutMs)
  if (Number.isFinite(ms) && ms > 0) {
    timer = setTimeout(() => {
      controller.abort(new Error(`TTS request timed out after ${ms} ms`))
    }, ms)
    if (timer && typeof timer.unref === 'function') timer.unref()
  }
  return {
    signal: controller.signal,
    get aborted() { return controller.signal.aborted },
    abort(reason) {
      if (!controller.signal.aborted) controller.abort(reason)
    },
    dispose() {
      if (timer) { clearTimeout(timer); timer = null }
      if (signal && typeof signal.removeEventListener === 'function') {
        signal.removeEventListener('abort', onAbort)
      }
    },
  }
}

/**
 * 归一化输出格式；只允许 pcm / mp3 / wav，其余直接抛错（避免静默产出无法播放的数据）。
 * @param {string} [format]
 * @param {string} [fallback='pcm']
 * @returns {'pcm'|'mp3'|'wav'}
 */
export function normalizeTtsFormat(format, fallback = 'pcm') {
  const raw = format === undefined || format === null || format === '' ? fallback : format
  const value = String(raw || 'pcm').trim().toLowerCase()
  if (!TTS_FORMATS.includes(value)) {
    throw new Error(`unsupported TTS format: ${format} (expected one of ${TTS_FORMATS.join(', ')})`)
  }
  return value
}

/**
 * 归一化语速；缺省 1.0，非正数/非数字抛错。
 * @param {number|string} [speed]
 * @returns {number}
 */
export function normalizeTtsSpeed(speed) {
  if (speed === undefined || speed === null || speed === '') return 1
  const value = Number(speed)
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`invalid TTS speed: ${speed}`)
  }
  return value
}

/** 归一化采样率；非法值回落到 fallback。 */
export function normalizeSampleRate(sampleRate, fallback = 24000) {
  const value = Number(sampleRate)
  if (Number.isFinite(value) && value >= 8000 && value <= 192000) return Math.round(value)
  return fallback
}

/**
 * base64 音频解码为 Uint8Array。
 * 火山 v1 TTS 的 `data` 字段是纯 base64；部分实现会插入换行，这里先剔除空白。
 * @param {string} base64
 * @returns {Uint8Array}
 */
export function decodeBase64Audio(base64) {
  const clean = String(base64 || '').replace(/\s+/g, '')
  if (!clean) return new Uint8Array(0)
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(clean)) {
    throw new Error('TTS response contains malformed base64 audio data')
  }
  const buf = Buffer.from(clean, 'base64')
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
}

/** 把若干 Uint8Array 拼成一个 Uint8Array。 */
export function concatBytes(chunks) {
  const list = (chunks || []).filter((chunk) => chunk && chunk.length)
  if (!list.length) return new Uint8Array(0)
  if (list.length === 1) return list[0] instanceof Uint8Array ? list[0] : new Uint8Array(list[0])
  let total = 0
  for (const chunk of list) total += chunk.length
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of list) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

/**
 * 读取整个响应体为 Uint8Array。
 * 兼容三类实现：标准 Response（arrayBuffer）、仅有 body reader 的假实现、以及 bytes()。
 * @param {any} res
 * @returns {Promise<Uint8Array>}
 */
export async function readAllBytes(res) {
  if (res && typeof res.arrayBuffer === 'function') {
    return new Uint8Array(await res.arrayBuffer())
  }
  if (res && res.body && typeof res.body.getReader === 'function') {
    const chunks = []
    for await (const chunk of iterateResponseBody(res)) chunks.push(chunk)
    return concatBytes(chunks)
  }
  if (res && typeof res.bytes === 'function') {
    return new Uint8Array(await res.bytes())
  }
  throw new Error('TTS response has no audio body')
}

/**
 * 逐块读取响应体（用于 createStream）。
 * 优先走 `response.body.getReader()`；没有 reader 时退化为「整段读完后单块产出」。
 * @param {any} res
 * @returns {AsyncGenerator<Uint8Array>}
 */
export async function* iterateResponseBody(res) {
  const body = res && res.body
  if (body && typeof body.getReader === 'function') {
    const reader = body.getReader()
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        if (value && value.length) {
          yield value instanceof Uint8Array ? value : new Uint8Array(value)
        }
      }
    } finally {
      if (typeof reader.releaseLock === 'function') {
        try { reader.releaseLock() } catch { /* 已被取消，忽略 */ }
      }
    }
    return
  }
  const all = await readAllBytes(res)
  if (all.length) yield all
}

/**
 * 读取 JSON 响应体（兼容 json() / text()）。
 * @param {any} res
 * @returns {Promise<any>}
 */
export async function readJsonBody(res) {
  if (res && typeof res.json === 'function') return await res.json()
  if (res && typeof res.text === 'function') {
    const text = await res.text()
    return text ? JSON.parse(text) : null
  }
  return null
}

/**
 * 从非 2xx 响应中提取可读错误详情，统一成 `${label} HTTP <status> <detail>`。
 * @param {any} res
 * @param {string} label
 * @returns {Promise<string>}
 */
export async function readTtsErrorDetail(res, label) {
  const status = res && res.status !== undefined ? res.status : 'unknown'
  let detail = ''
  try {
    const text = typeof res.text === 'function' ? await res.text() : ''
    if (text) {
      try {
        const parsed = JSON.parse(text)
        const inner = parsed && parsed.error !== undefined ? parsed.error : parsed
        if (typeof inner === 'string') detail = inner
        else if (inner && typeof inner === 'object') detail = inner.message || inner.err_msg || inner.msg || ''
        if (!detail) detail = text
      } catch {
        detail = text
      }
    }
  } catch { /* 读取失败时只保留状态码 */ }
  const trimmed = String(detail).slice(0, 300).trim()
  return `${label} HTTP ${status}${trimmed ? ` ${trimmed}` : ''}`
}
