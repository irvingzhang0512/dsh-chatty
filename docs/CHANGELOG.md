# 变更记录

本文件遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 风格，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。
改动分节使用 `Added` / `Changed` / `Deprecated` / `Removed` / `Fixed` / `Security`。

## [Unreleased]

### Added

- 暂无。新改动按分节追加在本节下，并在发版时整体移入对应版本。

## [0.1.0] - 2026-09-23

### Added

- **插件骨架**：纯 ESM（`"type": "module"`）、Node 20+、零运行时依赖的 `package.json`；bundle 层 `cordis.patch.yml`；`scripts/build-client.mjs`（片段拼接生成浏览器 bundle）与 `scripts/lint.mjs`（语法与结构检查）。
- **STT Provider 抽象**：`lib/stt/providers.js` 的注册表、默认值与 capability（`streaming` / `batch` / `timestamps` / `languages` / `partialResult`）；火山引擎与硅基流动两个实现；`lib/stt/pseudo-stream.js` 为无原生流式的 Provider 提供分段伪流式。
- **TTS Provider 抽象**：`lib/tts/providers.js` 的注册表、默认值与 capability（`streaming` / `voices` / `speed` / `emotion` / `formats` / `sampleRate`）；火山引擎与硅基流动两个实现；静态音色表 `STATIC_VOICES`。
- **Speech Renderer / Speech Buffer / Speech Queue**：`lib/speech/renderer.js` 把 Markdown 转成可朗读内容（策略 `read` / `skip` / `summarize` / `smart` / `label_only`，代码块跳过并可插口播提示、表格摘要）；`lib/speech/buffer.js` 以完整 Markdown Block（其次完整句子）为最小单位；`lib/speech/queue.js` 支持排队、取消与打断，并以 `generation` 让消费者丢弃在途音频。`lib/pipeline.js` 把三者串成每会话一条流水线。
- **Voice Draft**：`lib/draft.js` 领域模型 —— 添加 Utterance、编辑最近一段、整体替换、撤销、清空 / 取消、快照与恢复、订阅变更；核心语义是「一次说完不等于一次发送」。
- **语音指令**：`lib/command-parser.js` 支持发送 / 撤销 / 清空 / 取消 / 润色 / 停止录音 / 暂停 / 继续听 / 朗读 / 停止朗读；整段 Utterance 归一化后完全相等才判定为命令，另支持唤醒前缀模式（`DSH，发送`）。
- **Web Voice Bar 与设置卡**：`lib/client-src/` 片段与生成的 `lib/client.js` —— 输入区 Voice Bar（🎙 长语音 / ⏸ / ➤发送 / 🔊朗读 / ■停止 + 状态 + 音频可视化）、Voice Draft 面板，以及 Provider / 凭据 / VAD / 指令 / TTS 渲染策略设置卡。
- **Draft 润色**：`lib/polish.js` 使用 DSH 当前 Session / 当前配置的 LLM 润色 Voice Draft，并提供 Speech Renderer 的语音摘要后端；两者都是尽力而为，失败时原样返回输入或回落到规则摘要。
- **DSH Credentials 集成**：插件配置只保存 credential 引用名（`VOLCANO_SPEECH` / `VOLCANO_SPEECH_APPID` / `SILICONFLOW`），密钥仅在宿主半边经 `ctx.credentials` 解析，绝不下发浏览器。
- **自带最小 WebSocket 客户端**：`lib/ws-client.js` 用 `node:http(s)` 的 `upgrade` + 手写帧编解码实现 RFC6455 客户端，解决火山流式 STT 需要自定义认证头（`X-Api-App-Key` / `X-Api-Access-Key`）而 Node 全局 `WebSocket` 不支持 headers 的问题；配套单测 `test/ws-client.test.mjs`（`node:http` 手写回声服务端）。
- **凭据名归一化**：`lib/credential-name.js` 把 `volcano-speech`、`Volcano Speech` 等写法统一归一化成 `VOLCANO_SPEECH`，避免 DSH Credentials 的 `credentialRef()` 因非法引用名抛错。
- **测试**：`test/core.test.mjs`（Voice Draft / 指令 / 音频工具 / 事件适配）、`test/pipeline.test.mjs`、`test/speech.test.mjs`、`test/stt.test.mjs`、`test/tts.test.mjs`、`test/ws-client.test.mjs`、`test/client-bundle.test.mjs`（vm + React 桩跑浏览器 bundle）、`test/host.test.mjs`（假 ctx 驱动真实路由与工具，需要 peer 依赖，缺失时整体跳过）。
- **文档**：`README.md`、`AGENTS.md`、`docs/DESIGN.md`、`docs/CONFIG.md`、`docs/DEVELOPMENT.md`、`docs/ARCHITECTURE.md`、`docs/V1-COVERAGE.md`、`docs/CHANGELOG.md`，与 `docs/REQUIREMENTS.md` 互相引用。

### Changed

- **凭据引用名统一为大写 + 下划线规范形式**（`VOLCANO_SPEECH` / `VOLCANO_SPEECH_APPID` / `SILICONFLOW`）：`lib/config.js`、`STT_DEFAULTS`、`TTS_DEFAULTS` 的默认值与文档示例全部对齐；配置里写连字符（`volcano-speech`）仍然可用，会在宿主侧自动归一化（DSH Credentials 的引用名只接受 `[A-Za-z_][A-Za-z0-9_]*`）。

### Fixed

- `lib/polish.js` 改为读取嵌套的 `polish.*` 配置（此前只读扁平的 `polishProvider` / `polishModelId` / `polishBaseUrl` / `polishKeyEnv` 旧键，导致润色与语音摘要拿不到配置）；扁平旧键保留为兜底。
- 手动朗读在未开启自动朗读（`tts.auto_read: false`）时也能拿到最近一次 Assistant 回复：`/dsh-chatty/speech/render` 未传 `markdown` 时回落到宿主记录的最近一次回复文本。
- Push-to-Talk 收尾：点击停止监听时，正在说的那一句会先完成识别再关麦克风，不再被直接丢弃。

> 注：`0.1.0` 是 V1 首个版本，模块清单与 [docs/ARCHITECTURE.md](ARCHITECTURE.md) 的契约一一对应；逐项覆盖对照见 [docs/V1-COVERAGE.md](V1-COVERAGE.md)；需求中标注「V1 暂不实现」的能力（Wake Word 引擎、AEC、Full Duplex、本地大模型等）只预留接口。
