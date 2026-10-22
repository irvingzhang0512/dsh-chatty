# chatty-settings-migration

## Purpose

维护四所有者配置、模型目录和凭据动作，完整保留迁移、引用、CAS和未知字段边界。 本文是迁移后的活动规格；旧文档仅为冻结来源。迁移不新增功能、不等于重新完成运行验收。

## Requirements

### Requirement: F008 设置、凭据与宿主入口

系统 SHALL 满足本条既有行为与验收约束。来源：冻结的 [SPEC F008](../../../docs/SPEC.md)；确认、历史实现与验证依据见 [迁移索引](../../MIGRATION.md)。

- 预期：官方语音详情原2项与下方Chatty74项＋补充官方25项覆盖101项（api2、SenseVoice23）；增强/API/本地模型独立保存、重载、弃稿。凭据经原生Credentials保存，只显示引用及状态，已有密钥不回显。
- 验收：逐字段非默认保存/读回/恢复、非法值与并发拒绝、连续保存、部分失败、引用设置/状态/删除；完整字段表与默认见本能力 A008。
- 历史100项由已确认[2026-10-17升级](../../../docs/DSH-UPGRADE-20261017.md)新增vadOnsetPaddingSeconds替代。

#### Scenario: 并发与逐所有者保存

- **WHEN** 用户先后编辑Chatty与本地模型，另一窗口先保存其中一个entry
- **THEN** 冲突只作用该所有者；成功项推进自己的token，失败项保留草稿，不整体覆盖未知字段或表达式。


### Requirement: F017 官方详情增强配置与帮助（v3）

系统 SHALL 满足本条既有行为与验收约束。来源：冻结的 [SPEC F017](../../../docs/SPEC.md)；确认、历史实现与验证依据见 [迁移索引](../../MIGRATION.md)。

- 预期：入口为插件→官方→语音输入；官方原配置和成员之后追加Chatty74项五标签，底部折叠api2/SenseVoice23高级参数，各自保存；官方原2项即时保存且不重复编辑。共101项可达；14px正文、36px控件、24px分组、搜索目录、帮助、重置与弃稿规则保持。Chatty自己的详情仅安装/版本及公开导航，无重复表单。
- 边界：切标签、折叠、状态/目录/凭据刷新不丢草稿；原所有者CAS及部分失败契约不变；低频参数折叠仍可编辑。
- 验收：官方控件与成员顺序不变，74＋25＋2覆盖，浅深色/宽窄/键盘帮助、跨所有者保存失败与跳转均单独验收。
- 100→101历史依据见[2026-10-17升级](../../../docs/DSH-UPGRADE-20261017.md)，不推导真人音频或公网安装通过。

#### Scenario: 唯一官方详情表单

- **WHEN** 打开官方语音详情及Chatty自身详情
- **THEN** 前者追加增强与折叠高级参数且保留官方原顺序；后者只有版本/说明/跳转，不重复编辑原2项。

#### Scenario: 刷新目录保留草稿

- **WHEN** 已有未保存字段后切标签、折叠、刷新模型/凭据或收到官方状态流
- **THEN** 原草稿、changes和revisionToken保持，不触发全表重读。


### Requirement: F014 统一交付与迁移

系统 SHALL 满足本条既有行为与验收约束。来源：冻结的 [SPEC F014](../../../docs/SPEC.md)；确认、历史实现与验证依据见 [迁移索引](../../MIGRATION.md)。

- 预期：增强全部集成 Chatty。迁移先预览，逐项选择冲突，备份原文件及条目前值，失败按并发保护回滚，未知字段保留。
- 验收：旧 Provider／语言、重复预览、自动发送、语音对话、波形占位、经典参数清理；迁移幂等；备份恢复拒绝覆盖后续编辑。

#### Scenario: 迁移只读与显式选择

- **WHEN** 启动检测到旧Provider/语言、自动开麦或相冲突的新旧字段
- **THEN** 只提供预览和冲突选择，增强启动被诊断拦截而不静默写入；显式应用前备份。

#### Scenario: 恢复不覆盖后续编辑

- **WHEN** 一次迁移后用户又编辑某entry，随后请求恢复备份
- **THEN** 仅恢复仍等于本次写入的内容；外部更改列冲突，未知字段和凭据库/模型文件不动。


### Requirement: F018 模型与音色目录（v6）

系统 SHALL 满足本条既有行为与验收约束。来源：冻结的 [SPEC F018](../../../docs/SPEC.md)；确认、历史实现与验证依据见 [迁移索引](../../MIGRATION.md)。

- 预期：识别、朗读、润色／摘要均可搜索选择并显式刷新；内置目录、当前保存值和高级自定义入口并存。火山读官方公开正文；硅基用语音文档分类并结合模型 API；本地仅刷新官方注册／状态；LLM 复用 DSH 目录和公开发现服务，自定义兼容端点读 models。
- 边界：确定性解析型号字段／正文用途，不执行网页脚本，不用 LLM 猜型号；不混淆音色和样例文本。候选有来源、更新时间、适配状态；刷新不替换选择、不改推理配置、不试调、不新增协议。失败保留上一有效缓存，旧型号保留并说明。已知不兼容禁选，未知明确标记。音色保留自定义值，换模型不静默改音色。
- 验收：真实公开网页、解析改版／空列表／误识别／下线、请求取消与错误保留、无密钥回传、模型与音色选择及草稿保护。

#### Scenario: 显式发现目录

- **WHEN** 打开设置或点击刷新模型/音色目录
- **THEN** 打开只读缓存/本地元数据；只有显式刷新发起远端发现，不试推理、不改当前配置/选择/音色。

#### Scenario: 目录失败或型号下线

- **WHEN** 正文改版、空列表、网络失败、旧型号不在新目录
- **THEN** 保留上一有效缓存与当前值，标来源/时间/适配状态；已知不兼容禁选、未知标明，不用LLM猜型号。


### Requirement: F019 打开当前凭据文件（v6）

系统 SHALL 满足本条既有行为与验收约束。来源：冻结的 [SPEC F019](../../../docs/SPEC.md)；确认、历史实现与验证依据见 [迁移索引](../../MIGRATION.md)。

- 预期：顶部打开凭据文件按钮经原生文本文件打开器打开当前挂载 credentials-local 的实际路径，包含自定义路径；仍提供折叠凭据管理，仅展示引用、配置状态与可写性。刷新状态不清空草稿。
- 边界：路径只由宿主读取实际提供者配置确定，不接受客户端路径，不下发文件正文；缺文件／提供者／原生打开器时说明原因，不自动创建或改权限。
- 验收：当前与自定义路径、无文件／非本地提供者、原生打开结果、非法客户端路径拒绝、密钥不入响应及日志。

#### Scenario: 当前自定义凭据路径

- **WHEN** 用户点击打开凭据文件且credentials-local配置自定义路径
- **THEN** 宿主从实际Provider配置取得路径并用原生文本打开器打开；客户端不传路径，不收到正文或密钥。

#### Scenario: 缺失文件或能力

- **WHEN** 当前提供者非本地、文件不存在或没有原生打开器
- **THEN** 解释原因，不自动创建文件或改权限；状态刷新不清草稿。


### Requirement: A008 完整字段、所有者与保存接口

系统 SHALL 使用101字段的完整当前字段表（下方冻结来源的逐字段表作为本规格不可省略附录）；新增的SenseVoice vadOnsetPaddingSeconds默认0.3秒、范围0–1。GET /dsh-chatty/settings 返回owner/entryId/effective/user/base/writable/revisionToken/生效类型/schema但不返回密钥；POST只接owner、entryId、expectedRevisionToken和白名单set/unset，锁内复核原始与继承层token，冲突409。reset只unset用户覆盖。volatile走官方配置接口，普通参数经configEditor.edit并等待Loader重挂载，再取新speechController；多entry不是原子事务。来源：[配置表](../../../docs/CONFIG-UI.md)、[实施契约 §5](../../../docs/IMPLEMENTATION-20261013.md)。

#### Scenario: 新增官方VAD字段

- **WHEN** 在SenseVoice高级参数保存0.3秒之外的合法句首补偿并重读
- **THEN** 写入官方本地模型owner并按重载规则生效；超出0–1拒绝，Chatty自身pre_roll_ms不冒充同一参数。

#### Scenario: 任意entry或表达式写入

- **WHEN** 客户端向设置桥提交非白名单字段、任意entry或JS表达式
- **THEN** 拒绝写入；未改的既有表达式仍保留为继承状态，不回显秘密。


### Requirement: A009 遗留字段与Provider引用迁移

系统 SHALL 按下方迁移映射附录处理旧键，不将已退役值继续读成有效配置。stt.provider/language映射官方，zh-CN/en-US→zh/en；Provider专属字段按原供应商分流；旧continuous_listening=true必须显式确认自动开麦，默认false；双预览任一显式false则保留false；wave→bars；auto_send/voiceChat/声学wake占位/经典TTS键退役，tts.auto_read与文字前缀保留。max_audio_bytes需明确选择且旧默认不得放宽官方上限；polish旧顶层键迁到嵌套。备份保存原字节和entry前值，迁移幂等且受并发保护。Provider ID更名先扫全部原始配置，其他owner仍引用时拒绝列路径；当前官方默认引用可在同一备份事务更新，失败安全回滚。来源：[旧配置迁移](../../../docs/CONFIG-LEGACY.md)、[实施契约 §5](../../../docs/IMPLEMENTATION-20261013.md)。

#### Scenario: 其他插件仍引用旧Provider ID

- **WHEN** 本地ID更名预览发现另一owner的原始配置引用旧ID
- **THEN** 拒绝并列出引用路径，要求原所有者先处理，不偷偷改其他插件或留下悬空引用。

#### Scenario: 重复迁移与失败回滚

- **WHEN** 应用已成功的迁移再次执行，或某entry写入后下一entry失败
- **THEN** 重复无新清理；失败只回滚仍等于本次写入的entry，备份不因旧键消失被丢弃。


### Requirement: A010 目录缓存与凭据端点边界

系统 SHALL 将模型目录缓存在DSH_HOME/chatty/model-catalog，按purpose/provider/endpoint/credential引用指纹区分、原子写入；不存密钥、网页正文或音频。火山解析公开正文用途，硅基结合分类与models，LLM复用公开发现服务，均有请求超时/正文上限/取消。凭据引用规范化为合法名称；端点不含用户名密码/query，远端只允许HTTPS/WSS，回环可HTTP/WS。缺optional原生打开能力只影响该动作。来源：[冻结设置改版](../../../docs/SETTINGS-REDESIGN-20261013.md)、[配置表](../../../docs/CONFIG-UI.md)。

#### Scenario: 不同凭据引用刷新目录

- **WHEN** 同一服务端点改用另一个凭据引用并显式刷新
- **THEN** 缓存按引用指纹区分但不持久或输出密钥；取消/失败保留上一有效结果而不改选中模型。

## 字段与迁移映射附录

本附录从2026-10-22冻结的CONFIG-UI与CONFIG-LEGACY逐行保留，是A008/A009的组成部分；后续只在OpenSpec变更中修订，不回写旧表。

| 保存所有者 | 字段 | 标签／控件／位置 | schema 或组装默认 | 生效 | 验收 |
|---|---|---|---|---|---|
| chatty | `stt.providers.volcano.model` | 火山 模型 · 搜索型号＋刷新／高级自定义 · Chatty 增强／语音输入 | "doubao-seed-asr-2.0" | 下次任务 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `stt.providers.volcano.credential` | 火山 凭据名称 · 凭据引用选择／自定义 · Chatty 增强／语音输入 | "VOLCENGINE_AGENT_PLAN_API_KEY" | 下次任务 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `stt.providers.volcano.batch_url` | 火山 完整句端点 · 文本 · Chatty 增强／语音输入／高级参数 | "wss://openspeech.bytedance.com/api/v3/plan/sauc/bigmodel_nostream" | 下次任务 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `stt.providers.volcano.stream_url` | 火山 实时识别端点 · 文本 · Chatty 增强／语音输入／高级参数 | "wss://openspeech.bytedance.com/api/v3/plan/sauc/bigmodel_async" | 下次任务 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `stt.providers.volcano.resource_id` | 火山 服务资源标识 · 文本 · Chatty 增强／语音输入／高级参数 | "volc.seedasr.sauc.duration" | 下次任务 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `stt.providers.siliconflow.model` | 硅基流动 模型 · 搜索型号＋刷新／高级自定义 · Chatty 增强／语音输入 | "FunAudioLLM/SenseVoiceSmall" | 下次任务 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `stt.providers.siliconflow.credential` | 硅基流动 凭据名称 · 凭据引用选择／自定义 · Chatty 增强／语音输入 | "SILICONFLOW_API_KEY" | 下次任务 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `stt.providers.siliconflow.base_url` | 硅基流动 服务端点 · 文本 · Chatty 增强／语音输入／高级参数 | "https://api.siliconflow.cn/v1" | 下次任务 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `stt.max_segment_seconds` | 最长句时长 · 数字 · Chatty 增强／语音输入／高级参数 | 30 | 下次任务 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `stt.max_pending` | 识别积压上限 · 数字 · Chatty 增强／语音输入／高级参数 | 4 | 下次任务 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `stt.stream_idle_timeout_ms` | 流式等待超时 · 数字 · Chatty 增强／语音输入／高级参数 | 15000 | 下次任务 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `stt.streaming` | 优先真实流式 · 原生开关 · Chatty 增强／语音输入 | true | 下次任务 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `stt.auto_start` | 进入会话后自动监听 · 原生开关 · Chatty 增强／语音输入 | false | 下次任务 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `stt.partial_preview` | 显示临时预览 · 原生开关 · Chatty 增强／语音输入 | true | 下次任务 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `stt.vad.enabled` | 浏览器自动分句 · 原生开关 · Chatty 增强／语音输入 | true | 下一句 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `stt.vad.sensitivity` | 分句灵敏度 · 数字 · Chatty 增强／语音输入 | 0.6 | 下一句 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `stt.vad.silence_timeout_ms` | 句尾静音 · 数字 · Chatty 增强／语音输入 | 1200 | 下一句 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `stt.vad.min_speech_ms` | 最短人声 · 数字 · Chatty 增强／语音输入 | 200 | 下一句 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `stt.vad.pre_roll_ms` | 句首缓冲 · 数字 · Chatty 增强／语音输入 | 400 | 下一句 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `tts.provider` | 供应商 · 选项／可选文本 · Chatty 增强／语音输出 | "volcano" | 下次任务 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `tts.providers.volcano.voice` | 火山 音色 · 搜索音色＋刷新／高级自定义 · Chatty 增强／语音输出 | "zh_female_shuangkuaisisi_uranus_bigtts" | 下次任务 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `tts.providers.volcano.credential` | 火山 凭据名称 · 凭据引用选择／自定义 · Chatty 增强／语音输出 | "VOLCENGINE_AGENT_PLAN_API_KEY" | 下次任务 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `tts.providers.volcano.base_url` | 火山 服务端点 · 文本 · Chatty 增强／语音输出／高级参数 | "https://openspeech.bytedance.com/api/v3/plan/tts/unidirectional" | 下次任务 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `tts.providers.volcano.resource_id` | 火山 服务资源标识 · 文本 · Chatty 增强／语音输出／高级参数 | "seed-tts-2.0" | 下次任务 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `tts.providers.siliconflow.model` | 硅基流动 模型 · 搜索型号＋刷新／高级自定义 · Chatty 增强／语音输出 | "FunAudioLLM/CosyVoice2-0.5B" | 下次任务 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `tts.providers.siliconflow.voice` | 硅基流动 音色 · 搜索音色＋刷新／高级自定义 · Chatty 增强／语音输出 | "FunAudioLLM/CosyVoice2-0.5B:alex" | 下次任务 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `tts.providers.siliconflow.credential` | 硅基流动 凭据名称 · 凭据引用选择／自定义 · Chatty 增强／语音输出 | "SILICONFLOW_API_KEY" | 下次任务 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `tts.providers.siliconflow.base_url` | 硅基流动 服务端点 · 文本 · Chatty 增强／语音输出／高级参数 | "https://api.siliconflow.cn/v1" | 下次任务 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `tts.speed` | 语速 · 数字 · Chatty 增强／语音输出 | 1 | 下次任务 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `tts.format` | 音频格式 · 选项／可选文本 · Chatty 增强／语音输出 | "pcm" | 下次任务 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `tts.sample_rate` | 采样率 · 选项／可选文本 · Chatty 增强／语音输出／高级参数 | 24000 | 下次任务 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `tts.volume` | 播放音量 · 数字 · Chatty 增强／语音输出 | 1 | 下次任务 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `tts.auto_read` | 自动朗读回复 · 原生开关 · Chatty 增强／语音输出 | false | 下次任务 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `tts.interrupt_on_speech` | 人声打断朗读 · 原生开关 · Chatty 增强／语音输出 | true | 下次任务 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `tts.code_hint` | 代码跳过提示 · 原生开关 · Chatty 增强／语音输出 | true | 下次任务 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `tts.llm_summary` | 使用模型摘要 · 原生开关 · Chatty 增强／语音输出 | false | 下次任务 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `tts.summary_prompt` | 朗读摘要提示词 · 文本 · Chatty 增强／语音输出 | "" | 下次任务 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `tts.max_chars` | 单次朗读文字上限 · 数字 · Chatty 增强／语音输出／高级参数 | 4000 | 下次任务 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `tts.renderer.paragraph` | 普通段落朗读策略 · 选项／可选文本 · Chatty 增强／语音输出 | "read" | 下次任务 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `tts.renderer.heading` | 标题朗读策略 · 选项／可选文本 · Chatty 增强／语音输出 | "read" | 下次任务 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `tts.renderer.list` | 列表朗读策略 · 选项／可选文本 · Chatty 增强／语音输出 | "smart" | 下次任务 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `tts.renderer.table` | 表格朗读策略 · 选项／可选文本 · Chatty 增强／语音输出 | "summarize" | 下次任务 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `tts.renderer.code_block` | 代码块朗读策略 · 选项／可选文本 · Chatty 增强／语音输出 | "skip" | 下次任务 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `tts.renderer.inline_code` | 行内代码朗读策略 · 选项／可选文本 · Chatty 增强／语音输出 | "smart" | 下次任务 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `tts.renderer.mermaid` | 流程图朗读策略 · 选项／可选文本 · Chatty 增强／语音输出 | "skip" | 下次任务 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `tts.renderer.ascii_diagram` | 字符图朗读策略 · 选项／可选文本 · Chatty 增强／语音输出 | "skip" | 下次任务 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `tts.renderer.url` | 网址朗读策略 · 选项／可选文本 · Chatty 增强／语音输出／高级参数 | "label_only" | 下次任务 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `tts.renderer.image` | 图片朗读策略 · 选项／可选文本 · Chatty 增强／语音输出 | "skip" | 下次任务 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `tts.renderer.math_block` | 公式朗读策略 · 选项／可选文本 · Chatty 增强／语音输出 | "skip" | 下次任务 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `tts.renderer.tool_log` | 工具日志朗读策略 · 选项／可选文本 · Chatty 增强／语音输出 | "skip" | 下次任务 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `tts.renderer.blockquote` | 引用段落朗读策略 · 选项／可选文本 · Chatty 增强／语音输出 | "read" | 下次任务 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `voice_control.enabled` | 启用语音口令 · 原生开关 · Chatty 增强／指令与草稿 | true | 下次任务 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `voice_control.command_mode` | 口令匹配方式 · 选项／可选文本 · Chatty 增强／指令与草稿 | "exact" | 下次任务 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `voice_control.wake_prefix` | 文字口令前缀 · 文本 · Chatty 增强／指令与草稿 | "DSH" | 下次任务 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `voice_control.wake_words` | 前缀别名 · 多行列表 · Chatty 增强／指令与草稿 | [] | 下次任务 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `voice_control.commands` | 七类口令词表 · 七类词表多行编辑 · Chatty 增强／指令与草稿 | {"send":["发送","提交","发送消息","send","submit"],"undo":["撤销","重说","撤回","undo"],"clear":["清空","清除","clear"],"polish":["润色","整理一下","polish"],"stop_listening":["停止录音","停止监听","结束监听","stop listening"],"read":["朗读","读一下","read"],"stop_reading":["停止朗读","别读了","stop reading"]} | 下次任务 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `draft.max_utterances` | 语音区间追踪上限 · 数字 · Chatty 增强／指令与草稿／高级参数 | 200 | 下次任务 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `draft.separator` | 句间分隔符 · 文本 · Chatty 增强／指令与草稿 | "\n" | 下次任务 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `draft.polish_on_command` | 允许润色口令 · 原生开关 · Chatty 增强／指令与草稿 | true | 下次任务 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `polish.enabled` | 启用润色 · 原生开关 · Chatty 增强／指令与草稿 | true | 下次任务 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `polish.prompt` | 润色提示词 · 文本 · Chatty 增强／指令与草稿 | "" | 下次任务 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `polish.provider` | 供应商 · DSH 供应商选择 · Chatty 增强／指令与草稿 | "" | 下次任务 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `polish.model_id` | 润色／摘要模型 · 搜索型号＋刷新／高级自定义 · Chatty 增强／指令与草稿 | "" | 下次任务 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `polish.base_url` | 服务端点 · 文本 · Chatty 增强／指令与草稿／高级参数 | "" | 下次任务 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `polish.key_env` | 文本模型凭据名称 · 凭据引用选择／自定义 · Chatty 增强／指令与草稿 | "" | 下次任务 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `ui.show_voice_bar` | 显示听写／朗读按钮 · 原生开关 · Chatty 增强／界面 | true | 下次任务 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `ui.show_draft_panel` | 显示语音操作区 · 原生开关 · Chatty 增强／界面 | true | 下次任务 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `ui.visualizer` | 音量显示 · 选项／可选文本 · Chatty 增强／界面 | "bars" | 下次任务 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `ui.panel_width` | 操作区宽度 · 数字 · Chatty 增强／界面 | 720 | 下次任务 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `timeout_ms` | 请求超时 · 数字 · Chatty 增强／高级／高级参数 | 120000 | 下次任务 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `mic_device_id` | 麦克风 · 文本 · Chatty 增强／语音输入 | "" | 下次开麦 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `noise_suppression` | 浏览器降噪 · 原生开关 · Chatty 增强／语音输入 | true | 下次开麦 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `echo_cancellation` | 浏览器回声消除 · 原生开关 · Chatty 增强／语音输入 | true | 下次开麦 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| chatty | `auto_gain_control` | 自动增益 · 原生开关 · Chatty 增强／语音输入 | true | 下次开麦 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| speech | `defaultProvider` | 识别服务 · 文本 · 官方原控件（增强摘要提供说明） | "sensevoice-local" | 下次任务 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| speech | `language` | 识别语言 · 文本 · 官方原控件（增强摘要提供说明） | "auto" | 下次任务 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| api | `maxAudioBytes` | 音频大小上限 · 数字 · 官方高级参数（补充）／API 音频限制／高级参数 | 4194304 | 重载所有者 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| api | `maxDurationSeconds` | 音频时长上限 · 数字 · 官方高级参数（补充）／API 音频限制 | 120 | 重载所有者 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| sensevoice | `providerId` | 本地服务标识 · 文本 · 官方高级参数（补充）／本地模型与运行参数／高级参数 | "sensevoice-local" | 重载所有者 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| sensevoice | `dataRoot` | 本地缓存目录 · 文本 · 官方高级参数（补充）／本地模型与运行参数／高级参数 | 继承／可选 | 重载所有者 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| sensevoice | `modelDirectory` | 外部模型目录 · 选项／可选文本 · 官方高级参数（补充）／本地模型与运行参数／高级参数 | 继承／可选 | 重载所有者 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| sensevoice | `vadModelPath` | 外部人声检测模型 · 选项／可选文本 · 官方高级参数（补充）／本地模型与运行参数／高级参数 | 继承／可选 | 重载所有者 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| sensevoice | `precision` | 本地模型精度 · 选项／可选文本 · 官方高级参数（补充）／本地模型与运行参数 | "int8" | 重载所有者 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| sensevoice | `modelOrigin` | 固定模型来源 · 选项／可选文本 · 官方高级参数（补充）／本地模型与运行参数／高级参数 | 继承／可选 | 重载所有者 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| sensevoice | `modelOrigins` | 模型来源列表 · 多行列表 · 官方高级参数（补充）／本地模型与运行参数／高级参数 | ["https://huggingface.co","https://hf-mirror.com"] | 重载所有者 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| sensevoice | `modelProbeTimeoutMs` | 来源探测超时 · 数字 · 官方高级参数（补充）／本地模型与运行参数 | 3000 | 重载所有者 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| sensevoice | `threads` | CPU 线程数 · 数字 · 官方高级参数（补充）／本地模型与运行参数／高级参数 | 2 | 重载所有者 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| sensevoice | `segmentSeconds` | 本地推理分段 · 数字 · 官方高级参数（补充）／本地模型与运行参数／高级参数 | 30 | 重载所有者 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| sensevoice | `vadThreshold` | 本地人声阈值 · 数字 · 官方高级参数（补充）／本地模型与运行参数／高级参数 | 0.5 | 重载所有者 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| sensevoice | `minSpeechSeconds` | 本地最短人声 · 数字 · 官方高级参数（补充）／本地模型与运行参数／高级参数 | 0.25 | 重载所有者 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| sensevoice | `minSilenceSeconds` | 本地最短静音 · 数字 · 官方高级参数（补充）／本地模型与运行参数／高级参数 | 0.5 | 重载所有者 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| sensevoice | `vadOnsetPaddingSeconds` | 本地首段前置音频（秒） · 数字 · 官方高级参数（补充）／本地模型与运行参数 | 0.3 | 重载所有者 | 官方首个人声片段前补回0–1秒；修改保存、重读、重置、并发拒绝；中文帮助 |
| sensevoice | `maxAudioBytes` | 音频大小上限 · 数字 · 官方高级参数（补充）／本地模型与运行参数／高级参数 | 4194304 | 重载所有者 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| sensevoice | `prepareTimeoutMs` | 模型准备超时 · 数字 · 官方高级参数（补充）／本地模型与运行参数 | 3600000 | 重载所有者 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| sensevoice | `inferenceTimeoutMs` | 本地推理超时 · 数字 · 官方高级参数（补充）／本地模型与运行参数 | 120000 | 重载所有者 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| sensevoice | `idleTimeoutMs` | 本地空闲释放 · 数字 · 官方高级参数（补充）／本地模型与运行参数 | 300000 | 重载所有者 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| sensevoice | `maxPending` | 本地排队上限 · 数字 · 官方高级参数（补充）／本地模型与运行参数／高级参数 | 4 | 重载所有者 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| sensevoice | `graceMs` | 退出宽限 · 数字 · 官方高级参数（补充）／本地模型与运行参数／高级参数 | 1000 | 重载所有者 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| sensevoice | `maxLogBytes` | 诊断日志上限 · 数字 · 官方高级参数（补充）／本地模型与运行参数／高级参数 | 65536 | 重载所有者 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| sensevoice | `maxResponseBytes` | 工作进程响应上限 · 数字 · 官方高级参数（补充）／本地模型与运行参数／高级参数 | 131072 | 重载所有者 | 修改保存、重读、重置、并发拒绝；中文帮助 |
| sensevoice | `progressIntervalMs` | 准备进度刷新间隔 · 数字 · 官方高级参数（补充）／本地模型与运行参数／高级参数 | 100 | 重载所有者 | 修改保存、重读、重置、并发拒绝；中文帮助 |

| 旧字段 | 新归属／处理 |
|---|---|
| stt.provider／language | 映射到官方 defaultProvider／language；zh-CN → zh，en-US → en；冲突逐项选择 |
| stt.model／credential／base_url／resource_id | 按旧 Provider 分流到 stt.providers.*；不支持字段确认清理 |
| stt.stream_url | 旧火山 nostream 地址迁到 batch_url，async 地址保留实时用途；自定义地址单独选择用途和已存新地址的冲突 |
| tts.model／voice／credential／stream_url／resource_id | 按旧 Provider 分流；火山不使用 model，硅基流动不使用 resource_id，清除占位 |
| stt.continuous_listening | stt.auto_start；旧 true 必须选择是否自动开麦，默认关闭 |
| ui.show_partial 与 stt.partial_preview | 合并为后者；任一显式 false 保持不预览 |
| ui.visualizer=wave | bars；真实波形延期 |
| draft.auto_send／voiceChat／tts.voice_chat | 退役清理；保留 tts.auto_read，不恢复旧模式 |
| stt.wake_word | 清理声学唤醒占位；voice_control 文字前缀保持 |
| max_audio_bytes | 显式确认采用官方 API／Provider 上限，不再保留同义字段 |
| tts.app_id_credential／cluster | 经典接口残留清理，Agent Plan 不使用 |
| polishBaseUrl／polishProvider／polishModelId／polishKeyEnv | 对应 polish.base_url／provider／model_id／key_env |
