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
 * 与契约 §2.6 相比，volcano 额外补了两个字段（纯增量，不改变契约既有字段语义）：
 * - `appIdCredential`：火山批量/流式的 `X-Api-App-Key` 需要单独的 appId 凭据，
 *   与 tts 的 `VOLCANO_SPEECH_APPID` 保持同名，避免同一份凭据存两遍。
 * - `batchResourceId`：批量 recognize/flash 的 resource id（`volc.bigasr.auc_turbo`）
 *   与流式 sauc 的 `resourceId`（`volc.bigasr.sauc.duration`）不是同一个值。
 *
 * 凭据名用下划线大写：DSH Credentials 的引用名只接受 `[A-Za-z_][A-Za-z0-9_]*`，
 * 宿主侧会把需求文档里的连字符写法归一化到同一个引用。
 */
export const STT_DEFAULTS = {
  volcano: {
    credential: 'VOLCANO_SPEECH',
    appIdCredential: 'VOLCANO_SPEECH_APPID',
    model: 'volc.bigasr.auc_turbo',
    baseUrl: 'https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash',
    streamUrl: 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel',
    resourceId: 'volc.bigasr.sauc.duration',
    batchResourceId: 'volc.bigasr.auc_turbo',
    language: 'zh-CN',
  },
  siliconflow: {
    credential: 'SILICONFLOW',
    model: 'FunAudioLLM/SenseVoiceSmall',
    baseUrl: 'https://api.siliconflow.cn/v1',
    language: 'zh',
  },
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
    config: normalizeConfig(name, options.config),
    resolveKey: typeof options.resolveKey === 'function' ? options.resolveKey : async () => '',
    fetchImpl: options.fetchImpl,
    WebSocketImpl: options.WebSocketImpl,
    logger: options.logger,
  }
  if (name === 'volcano') return createVolcanoStt(deps)
  return createSiliconflowStt(deps)
}
