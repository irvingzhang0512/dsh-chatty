# dsh-chatty

当前功能与验收以 [docs/SPEC.md](docs/SPEC.md) 为入口；原始需求保留为历史来源，技术契约见规格内的文档索引。功能任务先改规格再实现，Bug 按已有预期查源码修复。


> A voice interaction plugin for DeepSeek Harness, providing long-running speech input, voice commands, speech-friendly response rendering, and interruptible text-to-speech playback.

> 为 DSH 提供长期语音输入、语音指令、语音草稿、语音友好内容渲染和可打断 TTS 的统一语音交互插件。

`dsh-chatty`（包名 `@irvingzhang0512/dsh-chatty`）把语音做成 DSH 的一种**长期可用的人机交互方式**，而不是一次性的「录音转文字」或「文字转语音」。语音输入先进 Voice Draft、由用户明确提交；Assistant 回复分成「页面显示的完整 Markdown」与「适合听的 Speech Text」两条线。

> **状态**：`0.1.0`。模块清单、导出名与数据形状以 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) 为实现契约；能力范围以 [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) 第 25 / 26 节为准。

---

## 三类核心能力

### 1. STT（Speech-to-Text）

- 麦克风录音，支持 **Push-to-Talk** 与 **Continuous Listening**（长时间监听）。
- **本地 VAD** 判断是否有人声，无人声不调用远程 STT。
- **Pre-roll Buffer** 保留触发前约 400 ms 音频，避免句首丢字。
- STT Provider 抽象同时支持**流式**与**批量**：火山引擎、硅基流动。
- 识别结果先进入 **Voice Draft**，不自动发送到当前 Session。
- Streaming 下可显示 **Partial Result**，只有 **Final Result** 才成为正式 Utterance。

### 2. Voice Control（语音指令）

- 发送 / 提交、撤销 / 重说、清空、取消、润色、停止录音、暂停、继续听、朗读、停止朗读。
- 普通语音内容与指令分离：**整段 Utterance 归一化后完全等于指令词**才算命令，绝不做子串包含匹配。
- 可选唤醒前缀模式（`DSH，发送`）；V1 不做完整 Wake Word Engine（见下）。
- 润色调用 DSH 当前 Session / 当前配置的 LLM，润色后仍然不自动发送。

### 3. TTS（Text-to-Speech）

- 手动朗读单条 Assistant 回复，或按配置自动朗读。
- 随时打断播放（Stop / Interrupt），打断只清 Speech Queue，**不修改原始 Assistant Message**。
- **Speech Renderer** 把 Markdown / 表格 / 代码转换成适合朗读的内容：代码块跳过、表格摘要、链接只读文字。
- **Speech Buffer** 以完整 Markdown Block（其次完整句子）为最小单位，不按 Token 送 TTS。
- TTS 播放期间本地 VAD 继续运行但**不提交远程识别**，避免「自己和自己对话」。

---

## 交互示意

Voice Bar 常驻在输入区右侧（`conversation.input.right`）：

```text
┌───────────────────────────────────────────────────────────────┐
│ 🎙 长语音   ⏸   ➤发送   🔊朗读   ■停止    ▁▂▅▇▃▂   正在聆听   │
└───────────────────────────────────────────────────────────────┘
```

Voice Draft 面板可随时展开（`conversation.input.dock`）：

```text
Voice Draft ───────────────────────────────────────────────
今天我们讨论一下 DSH 的语音插件。
我觉得它首先应该支持长时间监听……
                     ↑ Partial Result（流式中，尚未进入正式草稿）
───────────────────────────────────────────────────────────
[撤销] [清空] [润色] [发送]
```

状态提示（需求 §23.3）：未开启 / 正在监听 / 检测到语音 / 正在识别 / 等待继续说话 / 正在润色 / 正在发送 / 正在朗读 / 已暂停 / 正在重连 / 错误。

---

## 安装

环境要求：**Node.js 20+**、可执行的 `dsh`。

```powershell
# 安装到 web profile（路径替换为本仓库所在目录）
dsh plugin --profile web add F:\irving-dsh-plugins\dsh-chatty

# 重启 DSH Web 后刷新浏览器
dsh web
```

安装为 profile bundle 时会自动应用 [cordis.patch.yml](cordis.patch.yml)。该文件里的包名 `@irvingzhang0512/dsh-chatty` **不可改成短名**：浏览器 bundle 按 loader 入口名解析，改名会让 UI 半边静默失效。

---

## 配置与凭据约定

- **API Key 只存 DSH Credentials**，插件配置里只写 **credential 引用名**，禁止把真实密钥写进项目配置文件或 `cordis.patch.yml`。
- 约定的凭据名（DSH Credentials 的引用名只接受 `[A-Za-z_][A-Za-z0-9_]*`，所以规范形式是大写 + 下划线）：

  | 规范凭据名 | 用途 |
  |---|---|
  | `VOLCANO_SPEECH` | 火山引擎语音（STT / TTS）Access Token |
  | `VOLCANO_SPEECH_APPID` | 火山引擎语音的 App ID |
  | `SILICONFLOW` | 硅基流动 API Key（STT / TTS） |

- 配置里写连字符（`volcano-speech` / `volcano-speech-appid` / `siliconflow`）也能用：宿主会归一化成同一个引用；**但 DSH Credentials 里保存的名字必须是 `VOLCANO_SPEECH` 这种形式**，环境变量兜底也按归一化后的大写名（`process.env.VOLCANO_SPEECH`）查。归一化规则见 [lib/credential-name.js](lib/credential-name.js)。
- 密钥只在**宿主半边**经 `ctx.credentials` 解析，绝不下发浏览器。
- STT 与 TTS 可以选择不同的 Provider、各自配置 Model / Voice；注意 `stt.credential` 的默认值固定是 `VOLCANO_SPEECH`，切到硅基流动时要显式改成 `SILICONFLOW`。

最小配置示例（完整字段见 [docs/CONFIG.md](docs/CONFIG.md)）：

```yaml
stt:
  provider: volcano
  credential: VOLCANO_SPEECH

tts:
  provider: siliconflow
  credential: SILICONFLOW
  auto_read: false
```

---

## V1 范围

V1 实现（需求 §25）：麦克风录音、Push-to-Talk、Continuous Listening、本地 VAD、Pre-roll Buffer、Streaming / Batch STT Provider 抽象、火山 STT、硅基流动 STT、Voice Draft、Partial / Final Result、发送 / 撤销 / 清空 / 取消 / 润色、Voice Bar、音频 Waveform / 音量条、TTS Provider 抽象、火山 TTS、硅基流动 TTS、手动朗读、自动朗读、Speech Renderer、Code Skip、Table Summary、Speech Buffer、Speech Queue、Stop / Interrupt、DSH Credentials 集成、Provider / Model / Voice / VAD / TTS 配置。

**V1 暂不实现**（需求 §26，接口预留但不实现）：

- 完整 Wake Word Engine
- Acoustic Echo Cancellation（AEC）
- 真正 Full Duplex
- Speech-to-Speech 大模型
- 多人声源区分
- Speaker Identification
- 本地 STT 大模型
- 本地 TTS 大模型

V1 对「避免 TTS 被 STT 再识别」采用简化策略：TTS 播放期间不提交远程识别，但保留本地 VAD 用于判断用户是否想打断（需求 §21）。

---

## 目录结构

```text
dsh-chatty/
├── docs/                 REQUIREMENTS.md ARCHITECTURE.md DESIGN.md CONFIG.md DEVELOPMENT.md CHANGELOG.md V1-COVERAGE.md
├── lib/
│   ├── index.js          插件入口（name / inject / Config / apply）+ /dsh-chatty/* 路由 + transcribe_audio 工具
│   ├── config.js         schemastery Config 定义（配置字段与默认值的唯一权威）
│   ├── credential-name.js 凭据引用名归一化（toCredentialRef）
│   ├── draft.js          Voice Draft 领域模型
│   ├── command-parser.js 语音指令解析
│   ├── reply-adapter.js  DSH session 事件 → 语音流水线事件
│   ├── http-util.js      writeJson / readBody / isTrustedCaller / SSE 工具
│   ├── audio.js          wav/pcm 工具、格式探测
│   ├── polish.js         DSH LLM 润色 + 语音摘要
│   ├── pipeline.js       每会话语音流水线（buffer → renderer → queue）
│   ├── ws-client.js      自带的最小 RFC6455 WebSocket 客户端（火山流式 STT 需要自定义认证头）
│   ├── speech/           renderer.js buffer.js queue.js
│   ├── stt/              providers.js volcano.js siliconflow.js pseudo-stream.js
│   ├── tts/              providers.js volcano.js siliconflow.js
│   └── client-src/       浏览器半边片段（00-open 10-locale 20-css 30-core 40-audio 45-stt 50-draft 55-tts 60-ui 70-settings 90-close）
├── scripts/              build-client.mjs lint.mjs
└── test/                 node --test 单测（client-bundle / core / host / pipeline / speech / stt / tts / ws-client）
```

宿主 HTTP 路由统一挂在 `/dsh-chatty/` 前缀下（`/status`、`/config-info`、`/draft`、`/draft/polish`、`/stt/*`、`/tts/*`、`/speech/*`），另注册 `transcribe_audio` 工具。完整路由表见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) 第 3 节。

---

## 常用命令

```bash
npm test                 # 重建 lib/client.js 并运行 node --test 单测（pretest 自动构建）
npm run build:client     # 由 lib/client-src/ 片段拼接生成 lib/client.js
npm run lint             # ESM 语法检查 + 片段/生成物结构检查
```

本仓库**不引入任何运行时 npm 依赖**，因此单测无需 `npm install` 即可运行：宿主依赖全部通过 `peerDependencies` 提供，只有 `lib/index.js` 会 import 它们，而 `test/host.test.mjs` 在 peer 依赖缺失时**整体 skip**，`npm test` 仍然全绿。详见 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)。

---

## 文档

| 文件 | 内容 |
|---|---|
| [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) | 需求说明书全文（项目目标、架构、V1 范围、后续阶段） |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 模块契约：导出名、数据形状、HTTP 路由、浏览器半边约定 |
| [docs/DESIGN.md](docs/DESIGN.md) | 设计说明：核心中间对象、数据流、状态机、关键取舍 |
| [docs/CONFIG.md](docs/CONFIG.md) | 完整配置参考与凭据约定 |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | 开发流程、目录职责、新增 Provider、测试约定、常见坑 |
| [docs/V1-COVERAGE.md](docs/V1-COVERAGE.md) | 需求 §25 的 V1 能力逐项对照到实现文件与验证方式 |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | 变更记录（Keep a Changelog） |
| [AGENTS.md](AGENTS.md) | 仓库协作约定（中文交流、提交规范、开发红线） |

## License

MIT © 2026 irvingzhang0512
