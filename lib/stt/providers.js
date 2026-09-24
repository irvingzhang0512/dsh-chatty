// STT Provider 注册表与能力声明（实现契约 docs/ARCHITECTURE.md §2.6）。
//
// 本模块只做四件事：声明默认配置、查询 capability、按名字装配 Provider、
// 把注入依赖（config / resolveKey / fetchImpl / WebSocketImpl / logger）原样传给实现。
// 真正的协议细节在 volcano.js / siliconflow.js / pseudo-stream.js。
//
// 约定：
// - 未知 Provider 抛 Error（`code = 'provider'`）。
// - 缺少凭据由具体 Provider 抛 Error（`code = 'credential'`），本模块不预先检查，
//   因为凭据解析是异步的。
// - 不 import 任何 npm 包，不读环境变量；凭据一律通过 `resolveKey` 注入。

import { createVolcanoStt, VOLCANO_STT_CAPABILITY } from './volcano.js'
import { createSiliconflowStt, SILICONFLOW_STT_CAPABILITY } from './siliconflow.js'

/** 受支持的 STT Provider 名单，顺序即 UI 展示顺序。 */
export const STT_PROVIDER_KEYS = ['volcano', 'siliconflow']

/**
 * 各 Provider 默认配置。
 *
 * - `volcano`：火山 **Agent Plan**（方舟 API Key，一把钥匙两用）。识别走 plan
 *   专用流式端点，默认模型 doubao-seed-asr-2.0；没有批量 HTTP 端点，
 *   transcribe 内部复用流式协议发完整音频。凭据名对齐凭据文件里的常用名。
 *   【实验性：账号需在火山控制台开通豆包语音授权，见 scripts/verify-volcano-plan.mjs】
 * - `siliconflow`：OpenAI 兼容批量 + 伪流式。
 * - 凭据名用大写下划线：DSH Credentials 的引用名只接受 `[A-Za-z_][A-Za-z0-9_]*`，
 *   宿主侧会把连字符写法归一化到同一个引用。
 */
export const STT_DEFAULTS = {
  volcano: {
    authMode: 'plan',
    credential: 'VOLCENGINE_AGENT_PLAN_API_KEY',
    model: 'doubao-seed-asr-2.0',
    baseUrl: '',
    // nostream 变体：实测 bigmodel（流式）路径 404，nostream 存在（见 scripts/verify-volcano-plan.mjs）。
    streamUrl: 'wss://openspeech.bytedance.com/api/v3/plan/sauc/bigmodel_nostream',
    resourceId: 'volc.seedasr.sauc.duration',
    language: 'zh-CN',
  },
  siliconflow: {
    credential: 'SILICONFLOW_API_KEY',
    model: 'FunAudioLLM/SenseVoiceSmall',
    baseUrl: 'https://api.siliconflow.cn/v1',
    language: 'zh',
  },
}

/** 各 Provider 的已知模型（设置卡下拉数据源；用户仍可自定义覆盖）。 */
export const STT_KNOWN_MODELS = {
  volcano: [
    { id: 'doubao-seed-asr-2.0', label: '豆包声音识别 2.0（Seed ASR，Agent Plan 默认）' },
  ],
  siliconflow: [
    { id: 'FunAudioLLM/SenseVoiceSmall', label: 'SenseVoice Small（默认，速度快）' },
  ],
}

const CAPABILITIES = {
  volcano: VOLCANO_STT_CAPABILITY,
  siliconflow: SILICONFLOW_STT_CAPABILITY,
}

function unknownProviderError(name) {
  const error = new Error(`未知的 STT Provider：${name}（可用：${STT_PROVIDER_KEYS.join(', ')}）`)
  error.code = 'provider'
  return error
}

/**
 * 返回 Provider 能力声明（每次返回新对象，调用方可以安全修改）。
 * @param {'volcano'|'siliconflow'} name
 * @returns {{ streaming: boolean, batch: boolean, timestamps: boolean, languages: string[], partialResult: boolean }}
 */
export function sttCapability(name) {
  const capability = CAPABILITIES[name]
  if (!capability) throw unknownProviderError(name)
  return { ...capability, languages: [...capability.languages] }
}

/**
 * 把外部传入的 config 合并到默认值上。
 * 同时接受扁平的 provider 配置与整个插件配置（`{ stt: { ... } }`）。
 */
function normalizeConfig(name, raw) {
  const merged = { ...STT_DEFAULTS[name] }
  if (!raw || typeof raw !== 'object') return merged
  const layers = []
  if (raw.stt && typeof raw.stt === 'object') layers.push(raw.stt)
  layers.push(raw)
  for (const layer of layers) {
    for (const [key, value] of Object.entries(layer)) {
      if (key === 'stt' || value === undefined || value === null) continue
      merged[key] = value
    }
  }
  return merged
}

/**
 * 迁移旧默认值：settings 里可能持久化了切换前的字段值（如经典模式的模型名），
 * 换 provider 后这些值语义已变，这里做防御性纠正。
 */
function adaptLegacyDefaults(name, merged) {
  if (name === 'volcano' && merged.model === 'volc.bigasr.auc_turbo') {
    merged.model = STT_DEFAULTS.volcano.model
  }
  return merged
}

/**
 * 装配 STT Provider。
 *
 * @param {'volcano'|'siliconflow'} name
 * @param {object} [options]
 * @param {object} [options.config] Provider 配置（可传整个插件配置，会自动取 `stt`）
 * @param {(name: string) => Promise<string>} [options.resolveKey] 凭据解析（DSH Credentials）
 * @param {Function} [options.fetchImpl] 默认全局 `fetch`
 * @param {Function} [options.WebSocketImpl] 默认全局 `WebSocket`（Node 22+ 自带）
 * @param {{ warn?: Function, debug?: Function }} [options.logger]
 * @returns {{ name: string, capability: object, transcribe: Function, createStream: Function }}
 */
export function createSttProvider(name, options = {}) {
  if (!STT_PROVIDER_KEYS.includes(name)) throw unknownProviderError(name)
  const deps = {
    config: adaptLegacyDefaults(name, normalizeConfig(name, options.config)),
    resolveKey: typeof options.resolveKey === 'function' ? options.resolveKey : async () => '',
    fetchImpl: options.fetchImpl,
    WebSocketImpl: options.WebSocketImpl,
    logger: options.logger,
  }
  if (name === 'volcano') return createVolcanoStt(deps)
  return createSiliconflowStt(deps)
}
