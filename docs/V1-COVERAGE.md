# V1 覆盖对照表

> 需求 §25 的 V1 范围逐项对照到**实现文件**与**验证方式**。
> 测试统计以 `npm test` 的实际输出为准；本表只做映射，不重复描述功能。

| 需求 §25 能力 | 实现位置 | 验证 |
|---|---|---|
| 麦克风录音 | `lib/client-src/40-audio.js`（getUserMedia + ScriptProcessorNode → PCM16 16k） | `test/client-bundle.test.mjs` 冒烟渲染；真机需浏览器实测 |
| Push-to-Talk | `lib/client-src/45-stt.js`（`stopListening()` 先 `finishUtterance('manual')` 收尾再关麦） | 同上 |
| Continuous Listening | `lib/client-src/40-audio.js`（VAD 切分 + 自动进入下一次监听）、`45-stt.js` | `test/pipeline.test.mjs`、`test/host.test.mjs`（流式会话） |
| 本地 VAD | `lib/client-src/40-audio.js`（噪声底噪自适应 + 阈值/最短人声/静音时长） | 真机实测；配置项见 `test/host.test.mjs` 的 `/status` 断言 |
| Pre-roll Buffer | `lib/client-src/40-audio.js`（`preRollLimit` 环形缓冲） | 同上 |
| Streaming / Batch STT Provider 抽象 | `lib/stt/providers.js`（capability + `transcribe` / `createStream`） | `test/stt.test.mjs` |
| 火山 STT | `lib/stt/volcano.js`（批量 `recognize/flash` + 流式 `sauc/bigmodel` 二进制协议） | `test/stt.test.mjs`（帧编解码 + 假 WS 端到端） |
| 硅基流动 STT | `lib/stt/siliconflow.js`（OpenAI 兼容 multipart）+ `lib/stt/pseudo-stream.js` | `test/stt.test.mjs`、`test/host.test.mjs`（流式路由走伪流式） |
| Voice Draft | `lib/draft.js`（领域模型）、`lib/client-src/50-draft.js`（浏览器侧动作）、`/dsh-chatty/draft` 路由 | `test/core.test.mjs`、`test/host.test.mjs` |
| Partial / Final Result | `lib/stt/pseudo-stream.js`、`lib/stt/volcano.js`、`/stt/stream/events` SSE、`lib/client-src/45-stt.js` | `test/stt.test.mjs`、`test/host.test.mjs` |
| 发送 | `lib/client-src/50-draft.js`（`setDraft` + `inputActions.submit()`） | `test/host.test.mjs`（`send` 指令返回 `effects: ['submit']`） |
| 撤销 | `lib/draft.js`（`undo`）、`/draft` action `undo` | `test/core.test.mjs`、`test/host.test.mjs` |
| 清空 | `lib/draft.js`（`clear`）、`/draft` action `clear` | 同上 |
| 取消 | `lib/draft.js`（`cancel` 语义）、`/draft` action `cancel` | `test/host.test.mjs` |
| 润色 | `lib/polish.js`（DSH 当前模型）、`/draft` action `polish` 与 `/draft/polish` | `test/host.test.mjs`（注入 LLM 流） |
| Voice Bar | `lib/client-src/60-ui.js`（`conversation.input.right`） | `test/client-bundle.test.mjs` |
| 音频 Waveform / 音量条 | `lib/client-src/60-ui.js`（`LevelBars`）+ `40-audio.js` 的 `levels` | `test/client-bundle.test.mjs` 冒烟 |
| TTS Provider 抽象 | `lib/tts/providers.js`（capability + `synthesize` / `createStream` / `listVoices`） | `test/tts.test.mjs` |
| 火山 TTS | `lib/tts/volcano.js`（v1 HTTP + base64 分片流式） | `test/tts.test.mjs`、`test/host.test.mjs` |
| 硅基流动 TTS | `lib/tts/siliconflow.js`（OpenAI 兼容 `/audio/speech`） | `test/tts.test.mjs` |
| 手动朗读 | `/dsh-chatty/speech/render` + `lib/client-src/55-tts.js` | `test/host.test.mjs` |
| 自动朗读 | `session/event` → `lib/pipeline.js` → `/speech/events` SSE | `test/host.test.mjs` |
| Speech Renderer | `lib/speech/renderer.js`（策略表见需求 §12.2） | `test/speech.test.mjs` |
| Code Skip | `lib/speech/renderer.js`（`code_block: skip` + 可选口播提示） | `test/speech.test.mjs`、`test/pipeline.test.mjs` |
| Table Summary | `lib/speech/renderer.js`（`summarizeTable` + 可选 LLM 摘要） | `test/speech.test.mjs`、`test/pipeline.test.mjs` |
| Speech Buffer | `lib/speech/buffer.js`（完整块 > 完整句子，围栏未闭合不吐） | `test/speech.test.mjs`、`test/pipeline.test.mjs` |
| Speech Queue | `lib/speech/queue.js`（排队 / 取消 / 打断 / generation） | `test/speech.test.mjs`、`test/pipeline.test.mjs` |
| Stop / Interrupt | `/dsh-chatty/speech/stop` + `lib/client-src/55-tts.js`（`stopSpeaking` / `interruptSpeaking`） | `test/host.test.mjs` |
| DSH Credentials 集成 | `lib/credential-name.js` + `lib/index.js`（`resolveKey` 只走 `ctx.credentials`） | `test/host.test.mjs`（凭据归一化与 `/config-info`） |
| Provider / Model / Voice / VAD / TTS 配置 | `lib/config.js`、`lib/client-src/70-settings.js` | `test/host.test.mjs`（`/status`）、设置卡冒烟 |

## 需求 §26「V1 暂不实现」

Wake Word Engine、AEC、真正 Full Duplex、Speech-to-Speech 大模型、多人声源区分、Speaker Identification、本地 STT / TTS 大模型：**均未实现**，只在接口与配置上预留（`stt.wake_word`、`tts.interrupt_on_speech`、`lib/stt/providers.js` 的 capability、`lib/tts/providers.js` 的 capability）。

## 已知简化（诚实记录）

1. **TTS 流式是「分片流式」**：火山 v1 HTTP 返回完整 base64 后按片产出，不是 `ws_binary` 双向流式；接口形状已按 `createStream` 预留。
2. **视觉化只有音量柱**：`ui.visualizer` 接受 `bars` / `wave` / `off`，`wave` 目前与 `bars` 渲染一致。
3. **无 AEC**：TTS 播放期间不提交远程识别（需求 §21 允许的第一阶段策略），本地 VAD 仍运行用于打断。
4. **webm 不做转码**：批量路径把浏览器录音原样上传，火山 bigmodel 对 webm 的支持未验证；流式路径统一送 16k PCM16，不受影响。
5. **`lib/ws-client.js` 是最小实现**：只覆盖客户端场景（握手、文本/二进制/分片/ping/close），不支持 permessage-deflate。
