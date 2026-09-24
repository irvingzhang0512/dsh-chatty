# dsh-chatty 架构与模块契约

> 本文件是**实现契约**：所有模块必须按此处的导出名与数据形状实现。
> 需求来源见 [`REQUIREMENTS.md`](./REQUIREMENTS.md)。设计说明见 [`DESIGN.md`](./DESIGN.md)。

## 0. 硬性约束

1. 纯 ESM（`"type": "module"`），Node.js 20+，**不引入任何运行时 npm 依赖**（浏览器半边除外，只能 `require('react')` 与可选的 `@deepseek-ai/dsh-client-ui-primitives`）。
2. 宿主半边（`lib/*.js`、`lib/stt/`、`lib/tts/`、`lib/speech/`）只能 import 本地文件与 Node 内置模块。**禁止**在测试运行路径上 import `@deepseek-ai/*`（peer 依赖可能未安装）；只有 `lib/index.js` 允许 import `@deepseek-ai/schemastery`、`@deepseek-ai/dsh-tools`、`@deepseek-ai/dsh-credentials`、`@deepseek-ai/dsh-llm`。
3. 浏览器半边源码放在 `lib/client-src/NN-name.js`，按文件名排序拼接成 `lib/client.js`（`scripts/build-client.mjs`）。片段不是独立模块，共享同一个 `factory` 作用域：**不要写 `import`/`export`**，用 `const`/`function` 声明。
4. 测试用 `node --test test/*.test.mjs`，无网络、无真实麦克风、无真实 API Key：所有外部调用通过注入的 `fetchImpl` / `WebSocketImpl` 假实现。
5. 所有面向用户的文案默认中文（`docs/` 与代码注释中文），标识符英文。

## 1. 目录结构

```text
dsh-chatty/
├── docs/                 REQUIREMENTS.md ARCHITECTURE.md DESIGN.md CONFIG.md DEVELOPMENT.md CHANGELOG.md V1-COVERAGE.md
├── lib/
│   ├── index.js          插件入口（name / inject / Config / apply）
│   ├── config.js         schemastery Config 定义
│   ├── credential-name.js 凭据引用名归一化
│   ├── draft.js          Voice Draft 领域模型
│   ├── command-parser.js 语音指令解析
│   ├── reply-adapter.js  DSH session 事件 → 语音流水线事件
│   ├── http-util.js      writeJson / readBody / isTrustedCaller
│   ├── audio.js          wav/pcm 工具、格式探测
│   ├── polish.js         DSH LLM 润色 + 语音摘要
│   ├── pipeline.js       每会话语音流水线（buffer → renderer → queue）
│   ├── ws-client.js      最小 RFC6455 WebSocket 客户端（支持自定义 Header）
│   ├── speech/
│   │   ├── renderer.js   Speech Renderer（Markdown → 可朗读内容）
│   │   ├── buffer.js     Speech Buffer（流式增量 → 完整块）
│   │   └── queue.js      Speech Queue（排队 / 取消 / 打断）
│   ├── stt/
│   │   ├── providers.js  Provider 注册表 + capability
│   │   ├── volcano.js    火山引擎 STT
│   │   ├── siliconflow.js 硅基流动 STT
│   │   └── pseudo-stream.js 无原生流式 Provider 的分段伪流式
│   ├── tts/
│   │   ├── providers.js  Provider 注册表 + capability
│   │   ├── volcano.js    火山引擎 TTS
│   │   └── siliconflow.js 硅基流动 TTS
│   └── client-src/       浏览器半边片段（00-open … 90-close）
├── scripts/              build-client.mjs lint.mjs
└── test/                 node --test 单测
```

## 2. 宿主模块契约

### 2.1 `lib/draft.js` — Voice Draft

```js
export function composeDraftText(utterances)            // [{text}] -> string
export function createVoiceDraft(options = {})          // { maxUtterances = 200, separator = '\n' }
```

`createVoiceDraft()` 返回：

```js
{
  add(text, meta = {}) -> utterance,   // 空文本被忽略，返回 null；final 默认 true
  updateLast(patch) -> utterance|null, // 编辑最近一段
  replaceAll(text) -> utterance|null,  // 编辑整份草稿（作为单段替换）
  undo() -> utterance|null,            // 撤销最近一个 Utterance
  clear() -> number,                   // 清空，返回移除段数
  cancel() -> number,                  // 同 clear，语义为“取消本次输入”
  utterances() -> utterance[],         // 只读副本
  text() -> string,                    // composeDraftText(utterances)
  size() -> number,
  isEmpty() -> boolean,
  snapshot() -> { utterances: utterance[] },
  restore(snapshot) -> void,
  subscribe(listener) -> unsubscribe,
}
```

`utterance = { id: string, text: string, final: boolean, at: number, source: 'stt'|'edit'|'polish', provider?: string }`

### 2.2 `lib/command-parser.js` — 语音指令

```js
export const DEFAULT_COMMANDS          // { send: [...], undo: [...], clear: [...], cancel: [...], polish: [...], stop_listening: [...], pause: [...], resume: [...], read: [...], stop_reading: [...] }
export const COMMAND_ACTIONS           // 动作名数组，顺序即上表 key 顺序
export function normalizeCommandText(text)          // trim + 去尾部标点 + 全角转半角 + 小写
export function createCommandParser(options = {})   // { commands, mode = 'exact'|'wake'|'off', wakePrefix = 'DSH', wakeWords = ['DSH','小D'] }
```

`parse(text)` 返回 `null`（普通正文）或：

```js
{ command: 'send', phrase: '发送', mode: 'exact'|'wake', rest: '' }
```

判定规则（需求 §5.2）：**整段 Utterance 归一化后完全等于指令词**才算命令；`mode === 'wake'` 时要求前缀（`DSH，发送` / `dsh send`），前缀后剩余部分必须为空。绝不使用子串包含匹配。

### 2.3 `lib/speech/renderer.js` — Speech Renderer

```js
export const BLOCK_KINDS                 // ['paragraph','heading','list','table','code_block','inline_code','mermaid','ascii_diagram','url','image','math_block','tool_log','blockquote']
export const DEFAULT_RENDERER_POLICY     // 见需求 §12.2
export function parseBlocks(markdown) -> block[]        // block = { kind, raw, text }
export function classifyBlock(raw) -> kind
export function summarizeTable(raw, options = {}) -> string
export function renderSpeech(markdown, policy = {}, options = {}) -> { segments, skipped, speech }
export async function renderSpeechAsync(markdown, policy, options = {}) -> 同上
```

- `segments: [{ kind, text, source: 'block'|'hint' }]`，`text` 是可直接送 TTS 的纯文本；`skipped: [{ kind, reason }]`。
- 策略值：`read` / `skip` / `summarize` / `smart` / `label_only`。
- 代码块 `skip` 时若 `options.codeHint !== false`，插入一条 `{ kind: 'code_block', source: 'hint', text: options.codeHintText || '这里包含一段代码示例，请查看页面内容。' }`。
- `renderSpeechAsync` 在 `options.summarizeBlock(kind, raw) -> Promise<string|null>` 存在且策略为 `summarize`/`smart` 时优先用 LLM 摘要，失败回落到同步规则。
- 表格摘要必须产出自然中文口语句子（需求 §13），不得逐格朗读。

### 2.4 `lib/speech/buffer.js` — Speech Buffer

```js
export function createSpeechBuffer(options = {})
// options: { policy, minChars = 6, maxBlockChars = 400, mode = 'block'|'sentence', codeHint }
```

返回：

```js
{
  push(delta) -> segment[],   // 只吐已完整的内容（完整 Markdown Block 优先，其次完整句子）
  flush() -> segment[],       // 流结束，吐出剩余
  reset() -> void,
  pending() -> string,
}
```

- 代码围栏（```）未闭合时**不得**吐内容；表格行未遇到空行时不得吐（需求 §16/§17）。
- `mode === 'sentence'`：段落内按完整句子切分；`maxBlockChars` 超限时在逗号/空格处强制切分。
- 内部复用 `renderer.parseBlocks` / `renderer.renderSpeech`，保证与整体渲染一致。

### 2.5 `lib/speech/queue.js` — Speech Queue

```js
export function createSpeechQueue(options = {})
```

返回：

```js
{
  push(text, meta = {}) -> item,     // item = { id, seq, text, kind, status, meta }
  next() -> item|null,               // 取出下一个 queued 并置 playing
  peek() -> item|null,
  size() -> number,                  // 未完成条目数
  isEmpty() -> boolean,
  items() -> item[],
  markDone(id), markFailed(id, error),
  clear(reason = 'cleared') -> number,
  interrupt(reason = 'interrupted') -> number,
  generation() -> number,            // clear/interrupt 递增，消费者据此丢弃过期音频
  subscribe(listener) -> unsubscribe,
}
```

### 2.6 `lib/stt/providers.js` — STT Provider

```js
export const STT_PROVIDER_KEYS = ['volcano', 'volcano-classic', 'siliconflow']
export const STT_DEFAULTS = {
  // Agent Plan：一把方舟 API Key 两用（X-Api-App-Key / X-Api-Access-Key 同值），
  // 无批量 HTTP 端点：transcribe 内部走流式协议发完整音频。【实验性：账号需开通豆包语音授权】
  volcano:         { authMode: 'plan', credential: 'VOLCENGINE_AGENT_PLAN_API_KEY', model: 'doubao-seed-asr-2.0', baseUrl: '', streamUrl: 'wss://openspeech.bytedance.com/api/v3/plan/sauc/bigmodel_nostream', resourceId: 'volc.seedasr.sauc.duration', language: 'zh-CN' },
  // 经典鉴权：App ID + Access Token 两把钥匙（高级场景保留）。
  'volcano-classic': { authMode: 'classic', credential: 'VOLCANO_SPEECH', appIdCredential: 'VOLCANO_SPEECH_APPID', model: 'volc.bigasr.auc_turbo', baseUrl: 'https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash', streamUrl: 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel', resourceId: 'volc.bigasr.sauc.duration', batchResourceId: 'volc.bigasr.auc_turbo', language: 'zh-CN' },
  siliconflow:     { credential: 'SILICONFLOW_API_KEY', model: 'FunAudioLLM/SenseVoiceSmall', baseUrl: 'https://api.siliconflow.cn/v1', language: 'zh' },
}
export const STT_KNOWN_MODELS = { volcano: [{ id, label }], 'volcano-classic': [...], siliconflow: [...] }   // 设置卡下拉数据源
export function sttCapability(name) -> capability
export function createSttProvider(name, options = {}) -> provider
// options: { config, resolveKey(name) -> Promise<string>, fetchImpl = fetch, WebSocketImpl, logger }
```

> `STT_DEFAULTS` 是 **Provider 层**默认值，只在插件配置留空时兜底；插件配置的字段名与默认值见 [`CONFIG.md`](./CONFIG.md)。凭据名用大写 + 下划线（如 `SILICONFLOW_API_KEY`）是 DSH Credentials 的引用名要求，配置里写连字符变体会在宿主侧被归一化到同一个引用（见 §2.11）。装配时 `provider.name` 跟随 key（`volcano` / `volcano-classic`），返回值的 `provider` 字段同理。

`provider`：

```js
{
  name,
  capability: { streaming: boolean, batch: boolean, timestamps: boolean, languages: string[], partialResult: boolean },
  async transcribe({ audio, mimeType, language, signal }) -> { text, provider, tookMs, segments? },
  createStream({ language, sampleRate, signal, onPartial, onFinal, onError }) -> stream,
}
```

`stream = { pushAudio(bytes: Uint8Array) -> void, stop() -> Promise<void>, cancel() -> void, readonly closed: boolean }`

- 火山 `volcano-classic`：批量走 `recognize/flash`（HTTP，Header 认证），流式走 `sauc/bigmodel`（WebSocket 二进制协议）。
- 火山 `volcano`（Agent Plan）：无批量 HTTP 端点，`transcribe` 内部用流式协议发整段音频；协议与 classic 相同，鉴权为单把方舟 API Key 两用。【实验性：账号需开通豆包语音授权，见 `scripts/verify-volcano-plan.mjs`】
- 硅基流动：批量走 OpenAI 兼容 `POST {baseUrl}/audio/transcriptions`（multipart）；流式用 `pseudo-stream.js`（分段批量，产出 partial）。
- 任何 Provider 缺少 Key 时抛 `Error('... credential not configured')`，`code` 属性为 `'credential'`。

### 2.7 `lib/tts/providers.js` — TTS Provider

```js
export const TTS_PROVIDER_KEYS = ['volcano', 'siliconflow']
export const TTS_DEFAULTS = {
  // 火山 = Agent Plan 单向流式合成（HTTP POST unidirectional），
  // 鉴权与 STT 共用同一把方舟 API Key。【实验性：账号需开通豆包语音授权】
  volcano:     { credential: 'VOLCENGINE_AGENT_PLAN_API_KEY', model: '', voice: 'zh_female_shuangkuaisisi_moon_bigtts', baseUrl: 'https://openspeech.bytedance.com/api/v3/tts/unidirectional', resourceId: 'volc.bigtts', sampleRate: 24000, format: 'pcm' },
  siliconflow: { credential: 'SILICONFLOW_API_KEY', model: 'FunAudioLLM/CosyVoice2-0.5B', voice: 'FunAudioLLM/CosyVoice2-0.5B:alex', baseUrl: 'https://api.siliconflow.cn/v1', sampleRate: 24000, format: 'pcm' },
}
export const STATIC_VOICES            // [{ provider, id, label }]
export function ttsCapability(name) -> { streaming, voices, speed, emotion, formats, sampleRate }
export function createTtsProvider(name, options = {}) -> provider
```

`provider`：

```js
{
  name,
  capability,
  async listVoices({ signal }) -> voice[],
  async synthesize({ text, voice, speed, format, signal }) -> { audio: Uint8Array, format, sampleRate, channels },
  createStream({ text, voice, speed, format, signal }) -> { chunks: AsyncIterable<Uint8Array>, format, sampleRate, channels, cancel() },
}
```

### 2.8 `lib/pipeline.js` — 每会话语音流水线

```js
export function createSpeechPipeline(options = {})
// options: { policy, queue, renderer, summarizeBlock, onSegment(segment, sessionId), onEnd(sessionId), onCancel(sessionId) }
```

返回：

```js
{
  feed(sessionId, delta) -> void,   // LLM 文本增量
  finish(sessionId) -> void,
  cancel(sessionId) -> void,        // 打断：清空该会话队列并递增 generation
  render(sessionId, markdown) -> segment[],  // 手动朗读：整段渲染并入队
  queueFor(sessionId) -> queue,
  sessions() -> string[],
  reset() -> void,
}
```

### 2.9 `lib/polish.js`

```js
export function createPolishText({ resolveKey, fetchImpl, getConfig, llm, getAgentDefaultModel, createUserMessage }) 
// 返回 async (text, options, signal) -> string ；任何失败都原样返回
export function createSpeechSummarizer({ ...同上 }) 
// 返回 async (kind, raw, signal) -> string|null
export function DEFAULT_POLISH_PROMPT
```

### 2.10 `lib/audio.js`

```js
export function sniffAudioFormat(bytes) -> 'wav'|'mp3'|'ogg'|'webm'|'pcm'|'unknown'
export function pcm16ToWav(pcm, { sampleRate = 16000, channels = 1 }) -> Uint8Array
export function parseWavHeader(bytes) -> { sampleRate, channels, bitsPerSample, dataOffset } | null
export function concatBytes(chunks) -> Uint8Array
```

### 2.11 `lib/ws-client.js` 与 `lib/credential-name.js`（工具模块）

```js
// lib/ws-client.js —— 最小 RFC6455 客户端，供火山流式 STT 注入（Node 全局 WebSocket 不支持自定义 Header）
export function webSocketAccept(key) -> string
export function encodeClientFrame(data, opcode = 0x2) -> Buffer
export function createFrameParser() -> (chunk: Buffer) => Array<{ fin, opcode, payload }>
export class MinimalWebSocket            // new MinimalWebSocket(url, { headers })
export function createWebSocketImpl() -> MinimalWebSocket

// lib/credential-name.js —— 凭据引用名归一化
export const CREDENTIAL_REF_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/
export function toCredentialRef(name) -> string        // 'volcano-speech' -> 'VOLCANO_SPEECH'
export function credentialNameChanged(name) -> boolean  // 归一化后是否与输入不同
```

`MinimalWebSocket` 支持握手校验、文本 / 二进制 / 分片 / ping / pong / close 帧，以及 `onopen`/`onmessage`/`onerror`/`onclose` 与 `on(event, fn)` 两种绑定；不支持 permessage-deflate。宿主在 `makeSttProvider` 里把它作为 `WebSocketImpl` 注入。详见 [`DEVELOPMENT.md`](./DEVELOPMENT.md)。

## 3. 宿主 HTTP 契约（`lib/index.js`）

所有响应 JSON 形如 `{ ok: true, ... }` / `{ ok: false, error: { code, message } }`。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/dsh-chatty/status` | 配置摘要、Provider capability、凭据状态、UI 需要的字段 |
| GET | `/dsh-chatty/config-info` | Provider 列表、凭据配置状态、可选 LLM 模型 |
| GET / POST | `/dsh-chatty/draft` | v0.3 听写直写后仅 `polish` 仍被 UI 使用：POST `{ sessionId?, action: 'polish', text?, prompt? }` → `{ ok, action, draft }`（需可信来源）；`add` / `edit` / `undo` / `clear` / `cancel` / `command` 返回 410 `deprecated`（识别结果由浏览器直接写入 Session 输入框，composer 即草稿）；GET `?sessionId=` 保留兼容 |
| POST | `/dsh-chatty/stt/transcribe` | `{ dataBase64, mimeType, language?, provider? }` → `{ ok, text, provider, tookMs }` |
| POST | `/dsh-chatty/stt/stream/start` | `{ language?, sampleRate?, provider? }` → `{ ok, streamId, capability }` |
| POST | `/dsh-chatty/stt/stream/push` | `{ streamId, seq, dataBase64 }` → `{ ok: true }` |
| GET | `/dsh-chatty/stt/stream/events?streamId=` | SSE：`partial` / `final` / `error` / `closed` |
| POST | `/dsh-chatty/stt/stream/stop` | `{ streamId }` → `{ ok: true }` |
| POST | `/dsh-chatty/tts/synthesize` | `{ text, voice?, speed?, format? }` → 音频字节流，Header：`X-Audio-Format` `X-Audio-Sample-Rate` `X-Audio-Channels` |
| GET | `/dsh-chatty/tts/voices` | `{ ok, voices }` |
| GET | `/dsh-chatty/speech/events?sessionId=` | SSE：`speech.segment` / `speech.end` / `speech.cancel` |
| POST | `/dsh-chatty/speech/render` | `{ sessionId?, markdown? }` → `{ ok, segments }` |
| POST | `/dsh-chatty/speech/stop` | `{ sessionId }` → `{ ok: true }` |
| POST | `/dsh-chatty/draft/polish` | `{ text }` → `{ ok, text }` |
| GET | `/dsh-chatty/credentials/state` | 每把所需 Key 的 `{ name, requested, configured, source }` + 凭据文件路径 + 待添加行提示 |
| POST | `/dsh-chatty/credentials/open` | 用系统编辑器打开凭据文件（不存在时先创建 `refs: {}` 骨架）；需可信来源；测试用 `DSH_CHATTY_SKIP_OPEN=1` 跳过唤起 |

另注册工具 `transcribe_audio`（`file_path`，宿主侧 STT）。

## 4. 浏览器半边契约（`lib/client-src/`）

- 入口 `00-open.js`：`window.__ModuleLoader__.load({ id: '@irvingzhang0512/dsh-chatty', factory: (require) => { ... } })`，`90-close.js` 收尾并 `return module.exports`。
- `exports.inject = ['timer', 'slots', 'settingsScope', 'locale', 'uiSession']`。
- 注册的 slot：
  - `conversation.input.right`：Voice Bar（🎙 长语音 / ⏸ / ➤发送 / 🔊朗读 / ■停止 + 状态 + 可视化）。
  - `conversation.input.dock`：监听状态小条（状态 + 音量柱 + 实时预览 + 计时 + 撤销/润色/停止聆听）。v0.3 起**识别结果直接写入 Session 输入框（composer 即草稿）**，不再有独立草稿框。
  - `plugins.item`、`plugins.row.config`、`settings.plugin.item`：设置卡（Provider/Credentials/VAD/指令/TTS 渲染策略）。
- 发送到 Session：v0.3 听写直写——识别结果经 `lib/composer-text.js` 追加进 composer（`inputActions.setDraft`），用户编辑后按发送（`inputActions.submit()`）；撤销按**插入历史**在 composer 内回退。
- 状态机：STT `OFF → LISTENING → SPEECH_DETECTED → TRANSCRIBING → LISTENING`（扩展 `PAUSED` / `RECONNECTING` / `ERROR`）；TTS `IDLE → PREPARING → PLAYING → IDLE`（扩展 `INTERRUPTED` / `ERROR`）。
- TTS 播放期间本地 VAD 继续运行但**不提交远程识别**（需求 §21）；检测到用户真实说话时执行打断：停播 → 清空队列 → 回到 LISTENING。
