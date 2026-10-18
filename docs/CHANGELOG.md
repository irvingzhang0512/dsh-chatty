# 0.2.1-rc.2+chatty.1 — 2026-10-17

## 0.2.1-rc.2+rev.1（2026-10-18）

- 按已确认方案统一中英文显示名称、简介、完整修订版本及分发元信息；办公成员支持套件接管，保留原运行身份和业务数据。
- 当前实现及验证状态见 docs/SPEC.md 与本版独立验收记录；未公开发布。

- 五个官方语音包与 Desktop 精确匹配 0.2.1-rc.2。为官方新增 vadOnsetPaddingSeconds 补中文说明并增加目标真实 schema 覆盖测试；修复新版设置接口因缺说明而失败。现为 Chatty74／speech2／api2／SenseVoice23，共101字段。官方输入设备控件保留，Chatty mic_device_id 仍只负责自身采集；未把两者冒充同一持久设置。
- build:client／lint及210项测试通过，实际范围见[升级验收](DSH-UPGRADE-20261017.md)。

# 0.2.0-rc.2+chatty.3 — 2026-10-14

- 配置移入官方语音详情原内容下方，保留官方原2项；增强74项五标签，底部折叠官方24项，三个下方所有者各自保存／弃稿／重载。
- 自身详情只保留跳转；官方配置和成员列表原样呈现，公开activity单槽遮蔽重复麦克风，解除增强时恢复。
- 公开语音状态流同步官方Provider／语言／准备状态，依赖稳定Remote容器、可选实验命名空间；更新不清空草稿。原配置键／默认／存储保持。
- 实际离线、carrier、原生与Git来源证据见[本版记录](VERIFICATION-0.2.0-rc.2+chatty.3.md)，日常及公开发布另按授权。

# 0.2.0-rc.2+chatty.2 — 2026-10-14

- Chatty 74 项与官方 26 项分区保存，原生分段标签与开关，宽窄响应布局，字段重置与完整中文问号说明。
- 可搜索模型／音色与手动刷新：火山公开正文、硅基用途文档与账户模型列表、DSH 公开模型发现、自定义兼容 models。独立缓存、取消、错误保留和未实测状态。
- 打开实际凭据文件，凭据管理按需展开；目录、凭据和模型准备操作保留未保存草稿，部分失败仅推进成功所有者。
- 配置键、默认、所有者不变；精确匹配 Bundle 0.2.0-rc.2。新增两个文件动作 optional peers，正常 Git 安装无需构建。
- 本版离线、原生与固定本地 Git 验收见 [VERIFICATION-0.2.0-rc.2+chatty.2.md](VERIFICATION-0.2.0-rc.2+chatty.2.md)；日常升级、公开推送／tag、真人与真实云端仍另记。

# 0.2.0-rc.2+chatty.1 — 2026-10-13

- 官方语音底座、持续听写、原生草稿 CAS，退役自动发送与语音对话。
- 真实火山流式终态、有界任务、取消，独立朗读与规则／可选模型摘要。
- 五标签 100 项配置、原生凭据、并发保存、迁移备份和回滚。
- 精确五包与整数修订、Git 仓库产物、Desktop 隔离工具和验收资料。
- 本地推理与原生链路已验；真人、云端和公开安装状态见独立记录。

# 变更记录

## 2026-10-13 PRD v4：持续听写与语音对话延期（不变更包版本）

- 用户明确本期采用持续听写、语音对话暂不用；目标为多句累计草稿，检查／润色后明确发送。保留现有听写／朗读布局和设置卡，语音对话按钮及组合模式本期不展示／启用，F009 保留旧实现事实并列为延期。
- 同步 PRD、SPEC、配置、UI／遗留字段、架构及升级验收；补旧 `draft.auto_send` 的备份迁移清理、voiceChat 状态／恢复分支及旧接口停用预期，独立 `tts.auto_read` 保持。原始需求保持只读，旧源码和旧验收事实不删除或伪造。
- 本轮仅文档，旧路径停用尚未实施；package.json 仍 0.1.0，无源码／测试实现／运行配置、安装、构建或发布变化。

## 2026-10-12 PRD v3：官方配置优先与 Git 仓库安装（不变更包版本）

- 按用户纠正将 CONFIG-UI 改为官方 26 项／固定行为先列、官方不支持的增强功能共同设计；旧 Chatty 72 项单列 CONFIG-LEGACY，仅用于迁移调查，不机械继承为新版需求。
- 正式安装改为 GitHub repo URL 固定 tag／完整 commit，撤回 v2 tgz 附件建议；同步 F015／F016、架构、README，兼容文件来自固定 Git ref，安装记录解析 commit，不要求文件包含自身提交 SHA。
- 只读运行 DSH 0.2.0-rc.2 原来源解析，对四种 GitHub URL 分类通过；原生 Git 兼容判断通常安装后裁定并恢复拒绝的 Profile manifest／lock，额外 Bundle 前检需另行设计。未发布标签、安装／更新／回退、改 package scripts／版本或运行配置。

## 2026-10-12 PRD v2：现有界面、全配置与 GitHub 分发（不变更包版本）

- 按用户补充将增强固定在现有 Chatty 三按钮、dock、原生输入框和五标签设置卡；新增 [CONFIG-UI](CONFIG-UI.md)，逐项覆盖当前 schema 72 项与官方配置 26 项，失效字段另列迁移处理。
- PRD／SPEC／架构／配置同步 GitHub 固定 Release 安装包、精确 Bundle 绑定和已选定的 `<bundleVersion>+chatty.<revision>` 规则；新增 F015／F016，说明构建元数据不参与 SemVer 排序，更新按 GitHub 清单中的整数修订号判断。
- 用户已明确界面和版本选择，整版生成文档与未决实施接口仍待确认。GitHub Releases 只读核对为空，未发布、推送、安装或新增工作流；package.json 仍 0.1.0，源码／测试实现／运行配置保持。

## 2026-10-12 官方语音增强 PRD 重写（不变更包版本）

- 新增 [PRD](PRD.md) 审阅稿 `native-voice-enhancement-20261012-v1`，按产品定位、现有功能、上游／增强分工、用户流程、配置、范围和验收组织；原始 REQUIREMENTS 保持只读。
- SPEC 保留稳定编号，补充当前缓冲全文回写、实际 7 类口令、Agent Plan Provider 与界面差异；新增 F012–F014 的官方输入链路、共用识别注册表和统一配置迁移预期。
- ARCHITECTURE／CONFIG 补充待确认接入边界和旧字段调查，README／DESIGN／V1-COVERAGE 增加当前入口与历史说明提示。单一入口、流式、编辑器操作和真实配置映射仍需固定实施契约。
- 本次仅修改文档，未改源码、测试实现、运行配置、安装或包版本；未运行产品测试、真人语音、GUI 或目标兼容验证，生成文档尚未获用户明确确认。

## 2026-10-03 补齐需求文档确认（不变更包版本）

- 功能任务先改规格与相关技术契约，用户明确确认该版文档后再开发；未确认不改对应源码／测试实现或运行配置，已确认同一版不重复询问。
- 新增语义差异重新确认；预期不变的 Bug 可直接修复。本次只修改维护文档。

## 2026-10-03 文档基线（不变更包版本）

- 新增 [当前功能规格](SPEC.md)，建立功能与 Bug 两条开发入口，记录实现依据、现有验证入口和待办。
- 本次只修改维护文档，不变更公开 API、数据格式或运行逻辑；静态核对不代替产品测试及 GUI 兼容验证。


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
- **图标按钮悬停提示**：全部语音按钮（🎙/🗣/🔊 与撤销/清空/润色/? 指令/停止聆听）悬停即时显示中文说明（自研 CSS tooltip，`data-tip` 实现，不依赖 PRIM.Tooltip 的跨版本属性名）。

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
