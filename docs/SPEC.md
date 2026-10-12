# dsh-chatty 当前功能规格

本次产品审阅版：`native-voice-enhancement-20261012-v3`（2026-10-12，待用户确认），入口为 [重写 PRD](PRD.md)。建议将 F001–F009 接入官方语音基础，并新增 F012–F016 的集成、UI、GitHub 分发与版本规则；配置先以当前官方 26 项为基线，增强方案另行讨论，安装改为仓库 URL 固定 ref；相关变化待实现，技术接入未决项见 PRD 第 11 节。F010 继续待确认，F011 的历史规划不整体纳入本次开发。仅确认产品方向不等于未决接口方案已获开发确认。

本轮明确需求：以官方配置为起点，不支持的功能共同设计；所有最终有效配置提供 UI，沿用现有 Chatty 的三个按钮、dock、原生输入框与五标签设置卡；安装直接用 GitHub repo URL，v2 的 tgz 附件建议撤回。版本规则保持 `<bundleVersion>+chatty.<revision>`。这些需求已明确，不将其倒推为整版生成文档或源码开发已获确认。

本次升级文档版：`dsh-upgrade-20261011-v1`（2026-10-11，待用户确认）。F001–F009；F010／F011 保持原状态 的目标宿主适配与迁移验收见 [DSH 升级适配契约](DSH-UPGRADE-20261011.md)；本次变更待实现，尚未通过目标版本验证。其余功能与原有待确认设计保持原状态，下面的历史证据不自动证明 DSH 0.2.0-rc.2 兼容。

基线日期：2026-10-03；包版本：0.1.0；核对的源码提交：`8b5d3610e360f4fcdd769acfd5e82670f135c039`。此提交是首次整理前的实现基线，后续文档提交不提高包版本。

本规格可编辑，功能任务先改预期与验收及相关技术契约，交用户明确确认该版文档后再开发；确认前不得修改对应源码／测试实现或运行配置。用户已明确要求按同一版文档实现且含义未变时，不重复询问；新增语义差异须重新确认，确认范围写入规格变更或任务交付记录。Bug 按已有且不变的预期直接定位源码。流程见 [根文档驱动开发规范](../../docs/DOC-DRIVEN-DEVELOPMENT.md)。原始需求保持只读，技术文档保留现有名称。

依据与技术入口：[REQUIREMENTS.md](REQUIREMENTS.md)、[ARCHITECTURE.md](ARCHITECTURE.md)、[CONFIG.md](CONFIG.md)、[DEVELOPMENT.md](DEVELOPMENT.md)、[V1-COVERAGE.md](V1-COVERAGE.md)。

实现状态与验证状态分别记录。“已实现”表示有当前源码依据，不表示本次已通过运行测试。下面的测试链接是核对过的现有验证入口；2026-10-03 本次只静态核对源码、测试与文档，没有运行产品测试、构建、GUI 或外部服务验证。具体遗漏见条目与末尾待办。

## F001 麦克风与本地分句

- 实现状态：已实现。
- 场景与预期：浏览器采集音频并转为 16k PCM16，提供按住说话及连续听写，本地 VAD 依据阈值、最短语音、静音与预留片段分句。
- 边界与异常：录音权限失败反馈；停止按住说话先提交末句再关闭；TTS 播放阶段按本地策略暂停识别，不等于声学回声消除。
- 验收条件：末句不丢；静音不重复产生文本；停止后释放音频资源；实际麦克风仍需真实验证。
- 2026-10-12 实现差异：当前主按钮是点击开始／停止，没有物理按住录音的界面；旧文档的 Push-to-Talk 名称不能作为该操作已实现的依据。新集成方案采用 PRD 的一次听写与持续听写流程，待确认／待实现。
- 实现依据：[../lib/audio.js](../lib/audio.js)、[../lib/client-src/40-audio.js](../lib/client-src/40-audio.js)、[../lib/client-src/45-stt.js](../lib/client-src/45-stt.js)。
- 验证记录：2026-10-03 静态核对；已有测试入口：[../test/core.test.mjs](../test/core.test.mjs)、[../test/client-bundle.test.mjs](../test/client-bundle.test.mjs)（覆盖范围以用例为准，本次未执行）。

## F002 语音识别 Provider

- 实现状态：已实现。
- 场景与预期：火山 Agent Plan 通过二进制 WebSocket 协议识别，完整录音转写也复用该协议；硅基流动用 OpenAI 格式转写与快照伪流式。浏览器保留 partial／final 处理路径，预览不进入正式草稿。
- 边界与异常：伪流式不是供应商原生实时协议；空配置不覆盖默认端点；凭据只在宿主解析；失败返回可读状态。
- 2026-10-12 核对：当前火山默认端点为 `plan/sauc/bigmodel_nostream`，源码有 partial 处理不证明该端点实际返回中间结果；经典火山 HTTP 快速识别已不在当前 Provider 路径。目标版接入官方注册表见 F013，不能把本次静态核对记为云端验收。
- 验收条件：协议帧／multipart 符合适配器；partial 不重复追加 final；终止关闭连接，转写失败不自动发送消息。
- 实现依据：[../lib/stt/providers.js](../lib/stt/providers.js)、[../lib/stt/volcano.js](../lib/stt/volcano.js)、[../lib/stt/siliconflow.js](../lib/stt/siliconflow.js)、[../lib/stt/pseudo-stream.js](../lib/stt/pseudo-stream.js)、[../lib/ws-client.js](../lib/ws-client.js)。
- 验证记录：2026-10-03 静态核对；已有测试入口：[../test/stt.test.mjs](../test/stt.test.mjs)、[../test/ws-client.test.mjs](../test/ws-client.test.mjs)（覆盖范围以用例为准，本次未执行）。

## F003 语音草稿与输入同步

- 实现状态：已实现。
- 场景与预期：多个识别句进入 pending 草稿，默认不自动发送；支持追加、撤销、清空、替换，并与宿主输入框同步，显式提交发送。
- 边界与异常：撤销不能破坏用户先前手写内容；外部修改使不可靠区间失效；防止双向草稿同步反馈循环。
- 验收条件：识别多句只累计一次；撤销只去掉可追溯语音片段；提交通过宿主 inputActions 一次发送。
- 2026-10-12 实现差异：当前 `50-draft.js` 使用插件 `voiceBuffer` 累积，再通过 `setDraft` 整段覆盖输入框；未读取原生手写编辑，普通发送后也可能把旧缓冲写回。因而“不破坏手写内容／安全同步”的既有验收尚未满足，不能由“已实现”推导为通过。目标版通过 F012 的原生编辑器接入解决；本轮只记录，不修改源码。
- 实现依据：[../lib/draft.js](../lib/draft.js)、[../lib/composer-text.js](../lib/composer-text.js)、[../lib/client-src/50-draft.js](../lib/client-src/50-draft.js)。
- 验证记录：2026-10-03 静态核对；已有测试入口：[../test/composer-text.test.mjs](../test/composer-text.test.mjs)、[../test/core.test.mjs](../test/core.test.mjs)、[../test/client-bundle.test.mjs](../test/client-bundle.test.mjs)（覆盖范围以用例为准，本次未执行）。

## F004 精确口令与唤醒前缀

- 实现状态：已实现。
- 场景与预期：命令模式按整句精确匹配配置口令，默认支持发送、撤销、清空、润色、停止听写、朗读、停止朗读；可要求文字唤醒前缀。
- 边界与异常：command_mode 关闭时当普通文本；包含口令的长句不触发；文字前缀不是声学唤醒引擎。
- 验收条件：口令整句才触发；带剩余内容按草稿处理；关闭命令模式不截走用户文本。
- 2026-10-12 核对：当前可执行动作共 7 类，以上清单完整；取消、暂停、继续听不是当前口令。目标接入需在 final 文字插入前解析，不能假定官方 UI 提供结果拦截 Hook。
- 实现依据：[../lib/command-parser.js](../lib/command-parser.js)、[../lib/config.js](../lib/config.js)、[../lib/client-src/50-draft.js](../lib/client-src/50-draft.js)。
- 验证记录：2026-10-03 静态核对；已有测试入口：[../test/core.test.mjs](../test/core.test.mjs)、[../test/client-bundle.test.mjs](../test/client-bundle.test.mjs)（覆盖范围以用例为准，本次未执行）。

## F005 可选润色

- 实现状态：已实现。
- 场景与预期：用户请求润色时生成替换草稿，可配置模型与提示词；显式 OpenAI 兼容端点优先，否则使用 DSH 配置／当前模型；普通转写不自动发起润色。
- 边界与异常：失败保留原草稿；仅润色不等于发送或修改外部文档；启用朗读的 llm_summary 时，语音摘要可单独调用模型。
- 验收条件：开启且显式请求才调用润色模型；失败草稿不变；成功可在发送前继续编辑；关闭 llm_summary 回落规则摘要。
- 本次优化待确认／待实现：以可追溯语音区间作为润色范围；回写时核对编辑器版本，冲突保留草稿并展示结果供选择。当前插件缓冲全文回写不是此验收的实现证据。
- 实现依据：[../lib/polish.js](../lib/polish.js)、[../lib/pipeline.js](../lib/pipeline.js)、[../lib/client-src/50-draft.js](../lib/client-src/50-draft.js)。
- 验证记录：2026-10-03 静态核对；已有测试入口：[../test/pipeline.test.mjs](../test/pipeline.test.mjs)（覆盖范围以用例为准，本次未执行）。

## F006 回复分段与朗读队列

- 实现状态：已实现。
- 场景与预期：读取助手文本增量与轮次结束，按 Markdown 策略过滤代码／概述表格，分成可朗读段并进入可取消队列。
- 边界与异常：只处理助手文本事件；未闭合结构按缓冲规则处理；停止或新代次使旧音频失效，不能继续播放过期片段。
- 验收条件：分块拼接不重复朗读；代码跳过；表格策略符合测试；取消后队列不播放旧代次。
- 实现依据：[../lib/reply-adapter.js](../lib/reply-adapter.js)、[../lib/speech/renderer.js](../lib/speech/renderer.js)、[../lib/speech/buffer.js](../lib/speech/buffer.js)、[../lib/speech/queue.js](../lib/speech/queue.js)。
- 验证记录：2026-10-03 静态核对；已有测试入口：[../test/speech.test.mjs](../test/speech.test.mjs)、[../test/pipeline.test.mjs](../test/pipeline.test.mjs)（覆盖范围以用例为准，本次未执行）。

## F007 语音合成与打断

- 实现状态：已实现。
- 场景与预期：火山 HTTP 分块／音频结果与硅基流动音频接口提供 TTS；支持自动朗读回复、手动朗读以及停止／打断播放。
- 边界与异常：HTTP 分块不宣称完整双向实时语音；供应商音色与能力各自限制；播放期间的暂停识别策略不是 AEC。
- 验收条件：TTS 失败可取消并反馈；手动停止清队列／音频；新回复不混入已取消播放。
- 实现依据：[../lib/tts/providers.js](../lib/tts/providers.js)、[../lib/tts/volcano.js](../lib/tts/volcano.js)、[../lib/tts/siliconflow.js](../lib/tts/siliconflow.js)、[../lib/client-src/55-tts.js](../lib/client-src/55-tts.js)。
- 验证记录：2026-10-03 静态核对；已有测试入口：[../test/tts.test.mjs](../test/tts.test.mjs)、[../test/speech.test.mjs](../test/speech.test.mjs)（覆盖范围以用例为准，本次未执行）。

## F008 设置、凭据与宿主入口

- 实现状态：已实现。
- 场景与预期：input.right Voice Bar 和设置卡配置 STT／TTS／VAD／口令；宿主提供转写工具 transcribe_audio、HTTP／SSE，并从 Credentials 解析规范引用名。
- 边界与异常：零运行时依赖；密钥不下发浏览器；可信写请求与连接清理；配置 visualizer wave 当前仍为条形投影，真实波形见待确认项。
- 验收条件：路由和一个工具可注册；凭据名归一化；跨站请求拒绝；SSE 断开清资源；配置保存按字段作用域生效。
- 2026-10-12 核对：当前 STT／TTS 默认是火山 Agent Plan，默认引用 `VOLCENGINE_AGENT_PLAN_API_KEY`；硅基流动默认引用 `SILICONFLOW_API_KEY`。设置卡仍渲染 `tts.app_id_credential`／`tts.cluster`，与现行 Provider 路径存在残留差异，具体处理见 CONFIG 目标迁移表；本轮不清理持久配置。
- 实现依据：[../lib/index.js](../lib/index.js)、[../lib/http-util.js](../lib/http-util.js)、[../lib/credential-name.js](../lib/credential-name.js)、[../lib/client-src/60-ui.js](../lib/client-src/60-ui.js)、[../lib/client-src/70-settings.js](../lib/client-src/70-settings.js)。
- 验证记录：2026-10-03 静态核对；已有测试入口：[../test/host.test.mjs](../test/host.test.mjs)、[../test/client-bundle.test.mjs](../test/client-bundle.test.mjs)（覆盖范围以用例为准，本次未执行）。

## F009 语音对话模式

- 实现状态：已实现。
- 场景与预期：显式开启语音对话后开始监听，说完自动发送，回复自动进入朗读流水线；普通听写仍默认手动发送。
- 边界与异常：这是 STT→文本对话→TTS 串接，不等于实时双向语音模型；开关为宿主运行时状态而非永久配置，失败恢复开关；关闭停止播放和监听。
- 验收条件：切换模式后宿主 status 反映状态；对话模式识别句自动提交，普通听写不自动提交；关闭后不再由该模式自动朗读。
- 本次优化待确认／待实现：模式限制在当前会话，切换会话停止监听与播放；锁定时保留识别文字待处理；普通发送后不复活旧缓冲。当前宿主运行时开关与共享浏览器状态不能作为多会话隔离通过的依据。
- 实现依据：[../lib/index.js](../lib/index.js)、[../lib/client-src/60-ui.js](../lib/client-src/60-ui.js)、[../lib/client-src/50-draft.js](../lib/client-src/50-draft.js)。
- 验证记录：2026-10-03 静态核对；已有测试入口：[../test/host.test.mjs](../test/host.test.mjs)（覆盖范围以用例为准，本次未执行）。

## F010 wave 可视化含义

- 实现状态：待确认。
- 场景与差异：配置允许 wave，但当前界面渲染复用条形可视化；若用户期望真正波形，现实现尚不满足该含义。
- 边界与异常：确认要提供真实波形还是明确把该选项作为样式别名；不能通过修改规格认可错误行为。
- 验收条件：wave 与 bars 的可观察区别需明确后再实现／回归。
- 冲突依据：[../lib/config.js](../lib/config.js)、[../lib/client-src/60-ui.js](../lib/client-src/60-ui.js)。
- 验证记录：2026-10-03 静态差异登记；未修运行代码，不声称已通过此项验收。

## F011 独立唤醒与完整双向语音

- 实现状态：待实现。
- 历史场景：原始需求中的真正声学唤醒、AEC、完整双向语音、说话人识别及本地识别／合成并未作为当前能力交付。
- 边界与异常：仅保留历史规划来源，不代表已承诺本次开发；尚无对应完整运行实现。
- 验收条件：逐项确定设备、Provider 和资源边界；需要真实音频／噪声／打断验证，不能仅以配置项或 Mock 测试宣称通过。
- 来源依据：[REQUIREMENTS.md](REQUIREMENTS.md)。
- 验证记录：未实现，暂无运行验证；实际开发时先拆分规格并明确异常反馈。
- 本版范围说明：复用官方 SenseVoice 的本地 STT 单列为 F013 待实现；不由此宣称 Chatty 自建本地推理、其他 F011 规划或本地 TTS 已实现。

## F012 基于官方语音链路的输入增强

- 实现状态：待实现；需求确认：待用户确认本次 PRD 与接入方案。
- 场景与预期：一次听写复用官方转写与原生编辑器插入规则；持续听写由 Chatty 提供采集／分句增强，正式结果经同一输入 API 写入。语音与键盘共用原生草稿，Chatty 只保留待插入结果、预览及可追溯操作记录。
- 边界与异常：沿用现有 Chatty 按钮与 dock，不迁移到官方 UI；官方 UI 同时启用时需先固定麦克风互斥和公开组合方案。草稿版本冲突保留结果，切换会话／取消／卸载使迟到结果失效；不能用私有编辑器状态或 DOM 操作绕过契约。
- 验收条件：手写草稿后插入语音不丢原文；录音期间修改草稿后不强制覆盖；连续三句按序累计一次；普通发送后下一句不带回旧文字；撤销／清空只影响可追溯语音区间，失去追踪时提示而不覆盖；停止与取消有明确区别；两个会话结果不串。
- 实现依据：尚无官方语音接入实现；现行 [50-draft.js](../lib/client-src/50-draft.js) 只作为迁移来源，不作为本条通过证据。
- 验证记录：2026-10-12 读取上游固定文档及已提取的 0.2.0-rc.2 客户端，静态核对 `captureInsertion()`／`insertText()` 路径；未执行目标 GUI、真人音频或新集成测试。

## F013 共用识别注册表与能力明确的扩展

- 实现状态：待实现；需求确认：待用户确认。
- 场景与预期：沿用官方 `speechToText` 的具名 Provider、语言偏好及 SenseVoice 准备状态；Chatty 在同一注册表贡献火山 Agent Plan 与硅基流动云端 Provider。官方只支持完整录音，持续分句和流式扩展留在 Chatty 包内。
- 边界与异常：处理位置明确为 Host 本地或云端；一次任务固定 Provider／语言，失败不换供应商。没有流式能力时使用完整句识别；快照预览不称原生流式；火山中间结果需实测才能宣称。准备、注册注销、取消和音频上限沿用上游契约。
- 验收条件：既有本地模型不重复下载；本地／云端从同一列表选择；语言来自 Provider 支持范围；普通录音可调用新增云端 Provider；失败不跨 Provider 上传；重复 final／取消后的迟到事件不重复落字；注销后拒绝新任务并结束在途工作。
- 实现依据：尚无官方注册表接入；旧 [stt/providers.js](../lib/stt/providers.js) 与 [45-stt.js](../lib/client-src/45-stt.js) 是适配来源。
- 验证记录：2026-10-12 只读核对上游服务与包声明；本机目标服务签名、云端鉴权、实时 partial 与音频品质尚未运行验证。

## F014 全部增强集中交付与配置迁移

- 实现状态：待实现；需求确认：待用户确认。
- 场景与预期：所有自研语音增强由同一个 Chatty 包提供；保留当前五个设置标签，先为官方 26 项补齐入口，再按共同确定的增强行为配置新增项，全部最终有效字段均有控件。官方偏好和准备状态保持原所有权，现有卡统一读取／写入原公开服务；见 [CONFIG-UI](CONFIG-UI.md)。旧 72 项移至 [CONFIG-LEGACY](CONFIG-LEGACY.md) 供迁移引用调查，不自动沿用为新版设置。
- 边界与异常：不复制模型缓存、凭据或原生草稿，不另拆自研 Provider／TTS 插件；本机只有 0.2.0-rc.2，不能假定 0.2.1 的设备控件存在。旧字段迁移先预览、备份、核对引用，未知字段保留，配置所有权冲突明示处理。
- 验收条件：保留当前三个按钮、dock、原生正文输入框和设置卡；所有有效字段从 UI 可看／可改／可校验／可保存／可重新加载／可恢复默认，明确生效时机；不留只靠手改配置文件的有效字段。同一识别偏好两处观察一致；切 Provider 不串用凭据；已确认失效字段清理且再保存不复活；有效和未知字段保留；重复迁移结果一致；迁移失败可回滚；原生包依赖、安装组合及文档只在实现验证后同步为可用状态。
- 实现依据：尚无统一增强设置或新迁移实现；现行 [70-settings.js](../lib/client-src/70-settings.js) 是旧字段核对入口。
- 验证记录：2026-10-12 只读检查当前字段引用，未读取／修改用户凭据或执行真实配置迁移。

## F015 GitHub 仓库 URL 固定 ref 安装

- 实现状态：待实现；需求确认：用户明确要求 GitHub repo URL，具体固定 tag／产物／安装契约待确认。
- 场景与预期：正式安装从 `git+https://github.com/irvingzhang0512/dsh-chatty.git#<已发布tag或完整SHA>` 获取，经当前 desktop 自带安装器完成启用；发布 tag 包含完整可运行文件和兼容信息，用户无需先下载 tgz、手动克隆或现场编译。
- 边界与异常：裸 URL 可识别但会漂移到默认分支，正式安装固定远端已存在的 ref；版本示例 tag 尚未创建。DSH 对 Git 包的原生兼容裁定通常发生在安装后，额外 Bundle 前检须从固定 ref 读取兼容信息；不能虚称原生必定先检后下载。不自动升级或豁免；需验证 Git 生命周期脚本／peer，失败核对 Profile 恢复，磁盘下载文件可能保留。
- 验收条件：在隔离 desktop 直接使用仓库 URL 首装／更新／回退，不依赖 tgz 附件或额外现场构建许可；tag／完整 SHA／实装版本／兼容信息一致；版本拒绝、下载失败与 Profile manifest／lock 恢复有实际证据，既有配置不丢失。
- 实现依据：当前 `lib/client.js` 已被 Git 追踪，尚无新版 tag、兼容文件和 Git 安装验收；[package.json](../package.json) 的旧 peer 与 prepack 不是本条通过证据。
- 验证记录：2026-10-12 读取固定 DSH 0.2.0-rc.2 的来源解析／安装检查代码，只读运行原 parseInstallSpec 区域，裸 URL、git+https、带 tag 和带 SHA 四种均识别为 Git。未获取／安装插件、发布或推送；v2 Releases 空列表只是历史观察，不是新版安装阻碍。

## F016 Bundle 基线加 Chatty 修订号

- 实现状态：待实现；需求确认：用户本轮明确选择版本规则 `<bundleVersion>+chatty.<revision>`，实施接口与整版文档仍待确认。
- 场景与预期：例如针对 `0.2.0-rc.2` 发布 `0.2.0-rc.2+chatty.1`，同基线修复发布 `chatty.2`；Bundle 基线变化后重新适配与验证。发布清单精确记录五个语音包及 DSH 版本，现有设置卡展示目标／实际版本和匹配状态。
- 边界与异常：build metadata 不参与 SemVer 排序；读取 Git tag 所指兼容信息，用完整 Bundle 基线和整数修订号比较，以仓库 URL 固定完整 commit 安装。不能靠版本编号宣称兼容，不能用范围自动接受另一预发布或基线；发布过的同标签不可移动。本轮不改变当前 package.json 的 0.1.0。
- 验收条件：同基线从修订 1 到 2 可准确发现并用 Git ref 安装；五包任一完整版本不符时停止该基线增强并反馈，不自动换版本；界面显示版本事实，兼容声明有实际证据；固定 ref 的元数据、运行文件、实装版本与解析 commit 一致。
- 实现依据：尚无对应版本清单／匹配检查／GitHub 修订比较实现；当前包版本 0.1.0 保持。
- 验证记录：2026-10-12 只读核对官方 Bundle 和四子包版本关系、SemVer 构建元数据规则；未执行新版包或更新机制验证。

## 差异与验证待办

- 本次产品范围与未决接入见 [PRD](PRD.md)；F012–F016 尚无运行实现。F001–F009 有旧代码不代表已完成官方链路增强或 desktop 适配。
- README、DESIGN、CONFIG 的历史段落和 V1-COVERAGE 的旧映射仍有陈旧说明；已补提示和本版入口，不据其宣称物理按住录音、独立草稿框、经典 Provider 或安全全文同步已经可用。
- lib/ 是本插件的实际源码；lib/client.js 是必须提交的生成物。本次只改 Markdown，不运行会重建生成物的 pretest。
- 已有测试使用假 fetch／WebSocket／宿主，不等于真实音频、供应商鉴权、识别质量或浏览器权限通过。
- 技术约束差异（单独待修）：[polish.js](../lib/polish.js) 的 DSH 模型兜底路径动态导入 @deepseek-ai/dsh-llm，而 AGENTS 约定仅 lib/index.js 可导入宿主包。当前宿主没有传入 createUserMessage 替代此导入；后续代码任务需将宿主依赖注入并回归润色。本次不改运行代码或放宽该约束。

## 规格变更记录

- 2026-10-12（v3）：按用户纠正将配置主清单改为官方 26 项＋增强设计讨论；旧 72 项单列迁移参考，不能视为新版必需字段。F015 改为 GitHub repo URL 固定 ref 安装，撤回 tgz 附件依赖，记录原生 Git 来源解析与安装后兼容检查边界。界面与版本规则保持，未改源码或运行配置。
- 2026-10-12（v2）：按用户补充将 UI 固定为现有 Chatty 三按钮、dock 和五标签设置卡；新增 72＋26 项全配置 UI 对照、F015 GitHub 固定发布和 F016 版本绑定。用户明确选定 Bundle 基线加 Chatty 修订号，仅记录该选择的确认范围；其余生成文档与未决接入尚未获整体开发确认。
- 2026-10-12：重写 `native-voice-enhancement-20261012-v1` PRD；保留历史需求，补充现行源码差异及 F012–F014 官方基础集成、统一 Provider 与配置迁移预期。用户要求已写入，生成文档尚未获明确确认；未改源码、测试实现或运行配置。
- 2026-10-03：首次从现行文档、实现和现有测试建立功能基线；仅修改维护文档，未变更 API、存储或运行逻辑。
