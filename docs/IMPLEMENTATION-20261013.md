# 官方 Bundle 底座＋Chatty 增强：实施契约

本文保留v5服务／草稿／迁移契约，Desktop／Bundle仍0.2.0-rc.2；目录／凭据按[v6契约](SETTINGS-REDESIGN-20261013.md)，当前入口按[官方详情增强](OFFICIAL-SETTINGS-20261014.md)演进至chatty.3。旧入口与整包UI禁用描述由本版覆盖，服务接口不变。

本文与 [PRD](PRD.md)、[SPEC](SPEC.md)、[配置契约](CONFIG.md)、[全配置 UI](CONFIG-UI.md) 构成同一版开发依据。原始 REQUIREMENTS 不修改。架构文档中的旧 API／模块形状只解释旧实现，不覆盖本文。后续新增产品含义按根文档流程确认；本次授权不包含公开发布或日常替换。

## 1. 组合与所有权

- 官方 Bundle 和四个子包均保持上游原包及同一精确版本，不 fork、不复制模型下载和推理模块。注册表、偏好、语言、完整 WAV 校验和本地准备任务仍由官方所有者提供。
- Chatty 贡献 `chatty-volcano`、`chatty-siliconflow` 两个 cloud Provider；官方本地 ID 默认 `sensevoice-local`，以实际配置为准。ID 冲突拒绝注册，不能替换其他插件的 Provider。
- 前台沿用 Chatty 的 input.right、dock、五标签设置卡。组合层在 Chatty 启用时停用 `ui-voice-input` 条目，保留该包及版本事实；通过公开 patch／Loader 组合，不隐藏或改写官方 DOM。
- 开发环境和安装预览记录原官方 UI disabled 值及其写入来源。移除 Chatty 组合层后官方 Bundle 入口恢复；Profile 中另有显式 disabled 覆盖时由用户核对，不覆盖其更改。
- 兼容检查通过前不注册云端识别、不准备模型、不录音、不改偏好；客户端仍可打开兼容诊断。缺包、版本不符、服务缺失分别显示原因。
- 保持纯 ESM 和零新增第三方运行时依赖。宿主值导入集中在 lib/index.js，其他模块以参数获得模型消息构造、配置编辑、Credentials、注册表及传输能力。官方 peer 的实际版本来自所验证运行时。

## 2. 已核对的公开接口

2026-10-13 读取当前 Desktop app.asar 和同版包的类型／实现；以下是静态证据，不是运行验收。

| 接口 | 使用契约 |
|---|---|
| `speechToText.register({ info, preparation?, transcribe })` | info 包含 id、name、location、languages；输入为完整 WAV 与语言，结果为 text／audioSeconds／inferenceSeconds；返回异步 disposer |
| `speechToText.resolve`／`transcribe` | 每个任务固定一个 Provider 实例，注销使在途任务失效，不换供应商 |
| `speechController.catalog`／`follow` | 读取选择、准备状态、API 字节／时长上限；断开观察不取消 Host 拥有的准备任务 |
| `speechController.configure` | 只写官方 Provider／语言偏好 |
| `speechController.prepare`／`cancelPreparation` | 使用官方准备／取消；临时选源与永久模型来源设置分开 |
| `speechController.transcribe({ audioBase64, providerId?, language? }, signal)` | 完整识别使用官方 Remote，canonical base64 和 WAV 校验不绕过 |
| `useInput` | 读取当前会话 draft、draftRev、phase、reference occurrences；不接触私有 Lexical 实例 |
| `inputActions.captureInsertion()` | 得到 `{ start, end, draftRev }` 的 detect 坐标范围 |
| `inputActions.insertText(text, span)` | 草稿版本不符或输入锁定时 false；成功是一个编辑器撤销步骤 |
| `inputActions.submit()` | 走原生提交路径；其调用不等于 Host 已确认成功，不在调用后自行清空草稿 |
| `configForms.get(entryId)`／`settings` | 只处理 schema 声明的 volatile 字段，带 revision；不能假定 SenseVoice 普通字段也能通过该表单保存 |
| `configEditor.configuration()`／`edit(entry, change)` | 读取继承／覆盖，序列化验证、持久写入及 Loader reconcile；普通参数重挂载使用此路径 |

参考 0.2.1-alpha.2 文档里的设备控件和 vadOnsetPaddingSeconds 不是本版官方功能。当前官方没有 streaming、partial 或可用的录音结果拦截 Hook；这部分由 Chatty 扩展。

## 3. 采集、分句与真实流式

### 3.1 任务边界

点击听写显式开始；默认不开机／页面自动监听。每次监听生成 recordingGeneration，每句生成 utteranceId 和递增 utteranceSeq，并固定 sessionId、Provider、语言、有效上限和客户端句配置。流式在 start 固定服务配置；分句通过 stt/capture/start 在句首固定服务实例、增强参数和上限，官方完整识别在该快照的 AsyncLocalStorage 上下文内执行。设备处理参数在下一次开麦生效。

浏览器采集单声道 16k PCM16。浏览器 VAD 默认 enabled=true、sensitivity=0.6、silence_timeout_ms=1200、min_speech_ms=200、pre_roll_ms=400；这些值与官方 SenseVoice VAD 的识别参数分开。VAD 关闭时按最长句长收尾，不能无限上传静音。

Chatty 最长句长默认 30 秒，待识别句上限默认 4；有效句长是 Chatty、官方 API 与所选 Provider 限制的最小值，有效字节上限同时考虑 API／Provider，包含 WAV 头。预录、连接期间缓冲、事件缓存和待插入结果均计入有界资源。

达到句长上限正常收尾；积压达到上限时停止接收新句并在 dock 提示处理，保留已完成文字和有界任务，不静默丢正文。只在用户显式重新开始后恢复。停止收尾末句，取消丢弃当前未完成句并使代次失效；已插入正文不回删。

### 3.2 Provider 路径

- 本地 SenseVoice：完整句 WAV → 官方 speechController → 本地 Provider；不上传云端、不重复管理模型缓存。
- 硅基流动：完整句 WAV → 官方 speechController → Chatty cloud Provider → OpenAI 兼容转写；不反复识别快照模拟实时预览。
- 火山完整句：同一注册表／Remote 路径，宿主在 Agent Plan 单流端点发送完整句 PCM，取得正式 final 后返回官方 Transcript。
- 火山实时预览：Chatty 扩展 → Agent Plan `wss://openspeech.bytedance.com/api/v3/plan/sauc/bigmodel_async`，X-Api-Key 只在宿主解析，Resource ID 默认 `volc.seedasr.sauc.duration`。裸 PCM 按 200ms 分片，不把 WAV 容器头作为 PCM 推送。
- 云端支持语言由适配器明确列出：火山 auto／zh／en；硅基流动 auto／zh／en／ja／ko／yue。旧 zh-CN／en-US 映射为 zh／en；未支持语言不能改为 auto 来假装成功。
- 无流式能力的 Provider 采用分句模式；流式运行失败不自动重传、不切 Provider，提示用户显式重试同一 Provider 的完整句。不能将断连前的 partial 当 final。

火山端点依据：[Agent Plan 语音官方文档](https://docs.volcengine.com/docs/ark/agent-plan-personal-voice-model?lang=zh)、[流式协议](https://docs.volcengine.com/docs/6561/1354869?lang=zh)。文档支持不代表本账号／当前网络已完成真人验证。

### 3.3 Chatty 扩展传输

沿用 `/dsh-chatty/stt/stream/start`、`push`、`events`、`stop`，新增同前缀 `cancel`；完整转写旧 HTTP／工具入口作为兼容包装，统一执行官方识别语义。

- start：POST `{ sessionId, recordingGeneration, utteranceId, utteranceSeq, providerId, language, sampleRate: 16000 }`；返回 streamId 与有效限制。Host 固定 Provider 实例及句配置，不接受客户端凭据或任意供应商端点。
- push：POST `{ streamId, sequence, audioBase64 }`，sequence 从 1 连续递增。完全相同的重复分片仅确认一次；同序号不同内容及缺号拒绝，不能重复送往供应商。
- events：GET，按 streamId 订阅 SSE；事件为 ready／partial／final／error／closed，携带 streamId、sessionId、recordingGeneration、utteranceId、utteranceSeq 和 eventSeq。partial 是替换预览，final 最多一次，error 后不得 final。
- stop：POST `{ streamId, lastSequence }`，等所有已确认分片收尾并等待正式 final；重复 stop 幂等。等待 final 的空闲期限默认 15000ms，同时受总请求超时约束。
- cancel：POST `{ streamId }`，立即失效、清理连接和缓冲；重复 cancel 幂等。订阅断开、插件卸载、超时同样清理对应流，不取消无关本地准备任务。
- SSE 先连通 ready 再接受音频，事件缓存限于该句并随终态释放；最多缓存 32 个事件，partial 只保留最新，终态不可被挤掉。客户端丢弃重复 eventSeq 和旧代次。
- 会话存在及所有权检查、原有可信写请求校验均保留；允许实际 Desktop `dsh-app://app` 和匹配的回环宿主，不广泛放行 null／任意 Origin。HTTP 路径使用宿主路由解析，不能按页面 location 构造供应商连接。

## 4. 原生草稿与口令

- 正文不进入第二个 Voice Draft；只保留临时预览、最多 draft.max_utterances 条操作元数据和最多 stt.max_pending 条待插入结果。操作元数据淘汰不删正文；结果已满则停止新采集并提示处理。
- 在句开始捕获当前输入位置；普通听写使用该范围末端的零宽插入，避免删除选中的手写内容／引用。只有经公开插入动作成功且收到的状态与自身预计一致时才自动推进排队句的位置和版本，其余变化转待插入。
- 插入坐标为 detect 坐标，InputState.draft 为 clipboard 投影；引用 chip 在 detect 投影占一个占位字符。使用公开 occurrences 的 offset／length／identity 做坐标对应，不直接把 clipboard 字符下标当 TokenSpan 下标。
- final 按 utteranceSeq 顺序处理，先判口令再插正文；同一 utteranceId 已处理则忽略。partial 永远不进入正文或执行口令。
- 七动作保持 send、undo、clear、polish、stop_listening、read、stop_reading。默认 exact，可选 wake／off；整句归一化后重复动作词语阻止保存，不用后者覆盖前者。
- send 仅调用原生提交，不额外 setDraft 或清编辑器；普通发送造成的原生草稿变更使对应语音记录失效。提交失败由原生编辑器恢复，Chatty 不重建旧语音缓冲；恢复后的文字仍由原生编辑器拥有，不自动恢复其语音追踪。
- undo 删除最后一个可靠、未被用户编辑的语音区间；clear 删除所有可靠区间，按坐标倒序 CAS 操作。无法可靠定位时保留文本并提示原生编辑器撤销，执行中遇到新编辑立即停止，不覆盖新内容。
- polish 默认处理可追踪的连续语音区间；若手写内容将语音分开，展示可选区间再执行，不跨手写内容合并。模型结果按原版本／区间 CAS 回写，冲突保留原稿及结果；手动插入须再次捕获位置，不执行口令、不隐含发送。
- 输入 adjudicating／submitting 时不绕过锁定；解锁后等待用户处理待插入结果，不自动发送。助手运行时 submit 的排队语义沿用原生输入行为。
- 取消、切换会话、插件卸载先失效录音／润色／播放代次，再释放资源；旧结果不能进入另一个会话。

## 5. 全配置保存与迁移

字段、默认值、校验与 UI 以 [CONFIG-UI](CONFIG-UI.md) 为目标清单；旧 72 项仅为 [迁移输入](CONFIG-LEGACY.md)。官方 26 项直接写原条目，增强写 Chatty。Provider 设置按供应商分别保存，切换不重置另一家参数。

volatile 字段经 configForms／settings 带 revision 保存；普通字段通过 Chatty 的受限设置桥调用 configEditor.edit。桥只允许 Chatty、speech-to-text、api-speech-to-text、speech-to-text-sensevoice 的已列字段及实际唯一 entry ID；客户端不能写 JS 表达式或任意 entry。

设置桥 GET `/dsh-chatty/settings` 返回各所有者 entryId、effective、user、base、writable、revisionToken、生效类型及字段 schema；秘密不返回，原始表达式仅显示“继承的表达式”，未改字段保留。POST 同路径提交 `{ owner, entryId, expectedRevisionToken, operations }`，operations 仅 set／unset 指定字段路径。在 configEditor.edit 的锁内核对原始／继承层 token 和 entry 身份，再派生 next；冲突 409，不整份替换配置。

恢复默认指清除用户覆盖、重新继承组装 base。多所有者按各 entry 分别保存并反馈；不声称跨 entry 原子事务。重载参数保存前说明将结束相关任务，保存后等待重挂载并刷新 catalog，失败报告实际文件／运行状态，不宣称整体成功。Provider ID 更名涉及选择引用时通过下述迁移预览执行，不能只保存 ID。

迁移入口放高级现有卡：预览、应用、恢复备份。启动只生成预览，不自动写入；用户显式应用后执行。迁移 schemaVersion=1，记录旧文件／原始层摘要、冲突、写集、备份和 applied 状态；任务期间拒绝应用，先让用户停止听写／播放／准备。

- 迁移保留未知字段及无关分节，凭据库与模型文件不写、不删；记录旧 runtime voiceChat／旧接口停用，不把它们映射成新偏好。
- 旧 stt.provider／language 是官方选择候选：已有显式官方覆盖优先保留；两者有不同显式值时展示冲突并选择后才应用。只有旧默认值不成为强制切云端的依据。
- 云端旧单套连接配置迁入原 Provider 专属配置。另一家使用其默认；端点、模型、引用不得跨供应商推断。自定义单流端点保留为完整句端点，真实流式默认使用 async；非标准自定义地址需用户指定用途。
- stt.continuous_listening 改名 stt.auto_start，默认 false，已有显式 true 在预览中提示自动开麦并需用户确认保留；不因采用持续听写而开启它。
- stt.partial_preview 与 ui.show_partial 合并为一个预览开关；任一显式 false 保留关闭，没有覆盖则默认 true。
- draft.auto_send、stt.wake_word、旧经典 TTS app_id_credential／cluster、确认的 voiceChat／tts.voice_chat 残留迁移清理；文字口令前缀、tts.auto_read 仍保留。ui.visualizer=wave 预览改为 bars，真实波形仍延期。
- 顶层 max_audio_bytes 不继续读取：旧值不大于官方上限且用户选择沿用时可收紧官方 API；旧默认 25 MiB 不放宽官方 4 MiB。相冲突的显式上限展示选择；请求 timeout_ms 保持独立。
- polishBaseUrl／polishProvider／polishModelId／polishKeyEnv 分别迁入 polish.base_url／provider／model_id／key_env；嵌套显式值优先，冲突展示后清理旧键，重新加载不再兼容读取失效键。
- 每个备份保存原文件字节和写入前摘要，敏感备份仅在隔离／目标 DSH_HOME 内，不提交源码。应用分 entry 验证及记录进度；失败只对仍等于本次写入的 entry 回滚，外部变化列冲突，不覆盖。重复迁移不重复清理，不因旧键消失丢掉备份。

## 6. TTS、摘要与旧模式

保留现有两家 TTS 和内容整理，改为供应商专属参数。规则摘要默认，tts.llm_summary=false；用户启用后才为复杂内容调用模型，失败退回规则。polish.enabled 限制润色，独立 tts.llm_summary 控制模型摘要；polish_on_command 只限制口令触发。

手动朗读最新助手回复；自动朗读独立由 tts.auto_read 选择。助手增量／终态按目标 Session 公共事件适配，不回放历史。TTS 取消／轮次取消／切会话后旧合成结果不再入队。人声打断仅在用户已开始持续听写且 interrupt_on_speech=true 时监测，不因点击朗读单独自动开麦；先停播再识别。浏览器降噪／回声消除不是完整 AEC。

不显示对话按钮，不恢复模式，不保留识别后自动发送条件。旧可信 POST `/dsh-chatty/voice-chat` 返回 410 `{ ok:false, code:'feature_deferred', message:'语音对话本期暂不启用' }`；不改变状态。旧 status 如保留 tts.voice_chat 固定 false，不作为永久字段。其他方法 405，信任校验仍先执行。

## 7. Git 分发与版本接口

- compatibility.json 为 schemaVersion=1，字段 packageName、chattyVersion、bundleVersion、chattyRevision、dshVersion、speechPackages；speechPackages 包含 Bundle 及四个子包完整包名映射，全部 `0.2.0-rc.2`。不在提交内填写自身 SHA。
- 实际版本从当前 Loader fiber／pluginPackages 指向的包来源读取；不能从任意 node_modules 同名文件推断挂载版本。status 的 compatibility 区含 matched、target、actual、reasons；客户端只读展示。
- 首发包／tag：`0.2.0-rc.2+chatty.1`／`v0.2.0-rc.2+chatty.1`。同一 Bundle 整数递增，换基线从 1 起；不移动已发布 tag。
- GitHub repo URL 固定 tag 或完整 SHA；预检解析 ref，再从固定 commit 读取兼容文件。安装调用 Desktop 自带 carrier，不使用全局 web CLI、tgz、版本豁免或现场编译。
- 完整宿主、生成客户端、patch、兼容文件、许可证、指南均进 Git；上游包作为已有基线／精确 peer，不嵌入复制。缺少 Bundle 先显示准备要求，不自动拉另一套版本。
- Git 安装生命周期实测是否触发构建；发布产物不依赖 prepare／prepack 编译许可。原生安装拒绝可能发生在获取后；恢复 Profile manifest／lock 的实际结果需检查，不声称磁盘下载也已删除。
- 首装、更新、回退先用本地 Git 固定 commit 证明安装路径，再于获授权发布后验证真实公开 URL。没有远端 tag 时文档标为未来示例，不登记公开安装通过。修订比较使用 compatibility.json 的基线＋整数，不使用 SemVer 构建元数据排序。

## 8. Desktop 开发与验收顺序

通用隔离／调试和开发工具接口见根 [Desktop 开发契约](../../docs/DESKTOP-DEVELOPMENT.md)；本插件执行以下阶段：

1. 同版公开 API 的 Host／client 接缝测试；没有 target peers 就失败并报告，不整体 skip 冒充通过。
2. 官方服务注册、完整识别、Provider 注销；火山流式协议、分片序号、final 唯一、取消／断连释放。
3. 公开原生编辑器的多句、手写／引用、普通发送、锁定、冲突、撤销／润色；退役自动提交。
4. 全字段 UI、两个所有者保存路径、迁移／恢复和部分失败；TTS 内容／队列与真实取消。
5. npm test（会重建 tracked client.js）、npm run lint、客户端产物／Git 文件检查。
6. 隔离 Desktop 宿主检查，随后同组合原生 Desktop；真人音频和真实 Provider 独立证据，缺环境／凭据时列具体未完成项。
7. Git 固定来源首装／更新／回退／拒绝，文档、Skill、候选组合及中文独立提交收尾；发布和日常替换最后另获授权。

目标验收包括：三句一次累计、普通发送后第四句不回旧字；手写／引用保护；partial 不触发发送；同一句 final 重放不重复动作；停录／润色／解锁均不发送；配置保存和迁移不复活 auto_send／voiceChat；实装五包精确匹配；停止和切会话后旧结果不落字／播放。

## 9. 实现与证据状态

本次只完善文档和维护 Skill。尚未修改源码、测试、运行配置、包版本、发布产物或安装状态；没有执行真人麦克风、真实云端调用、原生窗口启动或 Git 安装。后续新增实现和检查记录写入独立验证记录，不把本契约当作通过证据。

## 完整句快照接口

POST /stt/capture/start 接收 sessionId、recordingGeneration、utteranceId（UUID）、utteranceSeq、providerId、language，返回 captureId、该句配置和有效上限。录音期间普通官方参数不能重载，volatile 增强参数从下一句生效。完整 WAV 的 /stt/transcribe 携带 captureId，在官方 Remote 路径中使用该快照；实例替换、过期、重复提交拒绝。/stt/capture/cancel 支持 captureId 或原身份，覆盖取消早于开始响应的竞态。流式与完整句共用积压预算，结束／超时／卸载释放，凭据值不放入快照。口令也使用该句的配置。

Task 的 utteranceId 使用 UUID，防止刷新页面或其他窗口的本地代次重置造成身份重用。上传 PCM 聚合为 200ms，末块显式收尾；服务端限制分片数、尺寸和总量。采集上限在帧内切分并保留余量，非 16k AudioContext 做跨帧重采样。
