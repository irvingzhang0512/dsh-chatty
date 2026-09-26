# 变更记录

本文件遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 风格，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。
改动分节使用 `Added` / `Changed` / `Deprecated` / `Removed` / `Fixed` / `Security`。

## [Unreleased]

### Added

- **peer 依赖落地脚本** `scripts/link-peer-deps.mjs`（`npm run link:peers`）：把 `peerDependencies` 从本机 DSH 宿主安装链接到 `node_modules/@deepseek-ai/`，`--check` 可做装前自检。原因：DSH 从 profile 加载插件时 Node 按 realpath 解析符号链接，插件必须能**从自己目录**解析到 `@deepseek-ai/*`，而 profile 的 `node_modules` 通常不提供这批包；链接到宿主那一份可保证与宿主加载的是同一个模块实例。
- **凭据体验**：新路由 `GET /dsh-chatty/credentials/state`（每把 Key 的配置状态 + 凭据文件路径）与 `POST /dsh-chatty/credentials/open`（用系统编辑器打开凭据文件，首次自动生成 `refs: {}` 骨架，测试可用 `DSH_CHATTY_SKIP_OPEN=1` 跳过唤起）；设置卡顶部固定凭据区（✓/✗ 状态、打开文件、重新检查、可复制片段）。
- **设置卡子页签**：展开后分为「语音输入 / 语音输出 / 指令与草稿 / 界面 / 高级」五个页签，一次只渲染一屏；provider、模型、语言、音频格式、指令模式、可视化全部改为下拉（模型下拉数据来自 `/config-info` 的 per-provider `models`），音色用 `datalist`（静态音色 ∩ 当前 provider，允许自定义 ID）。
- **Agent Plan 连通验证脚本**：`scripts/verify-volcano-plan.mjs`（STT，支持 `--auth dual/bearer/bearer+dual/appkey-only`、`--url`、`--seconds`）与 `scripts/verify-tts-plan.mjs`（TTS，`--text/--format/--voice/--endpoint/--resource-id`，成功时音频落盘可直接试听）。
- **设置卡试用功能**：语音输入页签「试一下」——录 3.5 秒并按当前 provider 识别，显示识别结果与耗时；语音输出页签「试听」——按当前 provider 合成一句固定文案并播放。
- **ws-client 握手失败诊断**：握手被 HTTP 4xx/5xx 拒绝时把响应体带进错误信息（火山返回 JSON 错误原因），并销毁响应避免进程挂起。
- **语音对话模式移到界面（Voice Bar 🗣）**：输入框旁新增 🗣 按钮——开启后进入语音对话闭环：说话 → 听写进输入框 → **自动发送** → 回复自动朗读（朗读中开口自动打断进监听）；再点退出回到听写模式。运行时状态存宿主内存（`POST /dsh-chatty/voice-chat`，`/status` 回报 `tts.voice_chat`），不持久化，重启后默认关闭；宿主语音流水线的推进条件由 `tts.auto_read` 扩展为 `auto_read || voice_chat`。设置卡保留独立的「自动朗读所有回复」开关（朗读模式的自动朗读）。
- **朗读进度与段间预取**：多段朗读显示「朗读中 x/N」进度；播放当前段的同时预发起下一段合成（段间停顿从整段合成时间缩到接近 0）；手动朗读入口立即显示「正在整理朗读内容…」（表格 LLM 摘要耗时数秒不再无反馈），合成阶段显示「正在合成语音…」。

### Changed

- **听写直写 v0.4：插件自持「语音文本缓冲」作为唯一事实源**。查实 DSH 契约：composer 文本存在 Lexical 编辑器里，插件 slot 拿到的 `props.input` 是提交状态机（不含文本），`InputActions` 只有 `setDraft`（整段替换）/attachments/`submit`——没有读取接口。此前「读输入框 → 追加」读到的恒为空，导致**第二句覆盖第一句**、撤销基准错乱。现在：插件维护 `voiceBuffer` 与分段插入历史——追加 = `appendSegment(buffer, text)` 后 `setDraft(buffer)`；撤销 = 按历史回退 buffer；清空 = buffer 清空 + `setDraft('')`；润色对 buffer 全文生效；发送 = `submit()` 后清空 buffer；重新开始监听也会清空 buffer（旧内容不写回新一段）。已知取舍：监听中手动点发送且不停止监听就继续说，旧内容会被重新写回——请用语音指令「发送」或停止监听后手动发送。
- **语音指令精简为 7 个**：发送 / 撤销 / 清空 / 润色 / 停止录音 / 朗读 / 朗读停止。删除 `cancel`（与清空重复）与 `pause` / `resume`（主按钮即开关）；`DEFAULT_COMMANDS`、设置卡说明、dock 条按钮（撤销/清空/润色/停止聆听/? 指令）同步。
- **Provider 精简为两个（STT/TTS 均为 Agent Plan + 硅基流动）**：删除「火山经典（App ID + Access Token）」整条链路（STT 批量 recognize/flash、TTS v1 HTTP、`app_id_credential` / `cluster` 配置字段与设置卡输入）。`STT_PROVIDER_KEYS` 回到 `['volcano', 'siliconflow']`，volcano 只保留 plan 鉴权与流式协议。
- **TTS 的火山 Provider 重写为 Agent Plan 语音合成 2.0**：`POST /api/v3/plan/tts/unidirectional`（HTTP 单请求，`X-Api-Key` 鉴权，resource `seed-tts-2.0`，2.0 代音色 `*_uranus_bigtts`；响应为单个 JSON `{code:0, data:base64}`）。实测打通（45KB MP3 落盘）。音色代次不匹配返回 55000000。删除经典 v1 HTTP 实现。
- **STT 的火山 Provider 细节修正**：流式端点确认为 `plan/sauc/bigmodel_nostream`；鉴权为单一 `X-Api-Key` 头（`X-Api-App-Key` / `X-Api-Access-Key` 双头是经典账号体系，plan Key 下返回 401 grant not found）；`transcribe` 一律内部走流式协议发整段音频。
- **默认 provider 切回火山（Agent Plan）**：`stt.provider` / `tts.provider` 默认 `volcano`，`stt.credential` / `tts.credential` 默认 `VOLCENGINE_AGENT_PLAN_API_KEY`；硅基流动保留为可选项。

### Fixed

- **火山 Agent Plan TTS 大音频失败（PCM）**：plan 端点响应实为 **JSON 行流**（每行一个 `{code, message, data: base64}`，大音频分多行，以 `{code:20000000, message:'OK'}` 结束行收尾）——此前按「单个 JSON」整包解析，撞到第二行报 `response is not valid JSON`（小 mp3 只有一行所以验证脚本侥幸通过）。现在按行解析：收集全部 data 块按序拼接，`code 20000000` 结束行跳过，其它非 0 code 报错（55000000 附音色代次提示）。真实 Key 实测 PCM 104KB 合成成功。
- 设置卡（`plugins.item` / `plugins.row.config` / `settings.plugin.item`）的折叠头部与 DSH 原生设置卡对齐：标题一行、描述一行（`dch-card-text` 上下堆叠），右侧可旋转的展开箭头（优先用 `@deepseek-ai/dsh-client-ui-primitives` 的 ChevronDown 图标），`14px 16px` 内边距、12px 圆角与 body 顶部分隔线。修复此前标题与描述挤在同一行、卡片高度异常偏小、看不出可展开的问题。

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
