# dsh-chatty 文档迁移索引

迁移版：2026-10-22-v1。迁移全部21个F编号进入6个主能力；F009–F011的现有限制保留为主规格，未来能力及原需求遗漏候选放1个未确认change。

## 唯一活动来源与保留边界

- 当前行为唯一规格源是本库 openspec/specs；未确认/未实现业务仅在 openspec/changes，不能提前合入主规格或归档。
- 原始需求、旧 docs/SPEC.md 与历史方案/验收证据保留原字节并冻结，不再双写。本索引优先于旧文件内“当前可编辑SPEC”等历史路由措辞。
- 技术/配置/工具/使用说明本轮保持字节不变；规格中的“冻结来源”指迁移时所读取版本，绝非永久禁止维护。后续已确认功能实施时仍同步实际技术说明，但不能与OpenSpec成为第二份独立产品真源。
- README/AGENTS只调整入口与维护路由；业务/项目/examples/运行skills、源码、测试、配置、包版本、锁和产物均不改。根跨平台个人工作区方案不在本库重复定义。
- 原文未给出完整设计的愿望仅建候选change；本轮文档授权不是业务批准。用户确认具体文档版的门禁保留，artifacts ready/validate/任务勾选不等于批准、实现或验收。

## 主规格目录

| Capability | 作用 |
|---|---|
| [chatty-capture-stt](specs/chatty-capture-stt/spec.md) | 采集、分句、正式结果处理和Provider协议，保持失败不切换、不将临时结果落字。  |
| [chatty-delivery-boundaries](specs/chatty-delivery-boundaries/spec.md) | 维护延期边界、独立插件身份和当前精确组合；历史发布/设备验证不能由迁移推定。  |
| [chatty-native-composer](specs/chatty-native-composer/spec.md) | 原生编辑器是唯一正文，通过公开锚点安全插入、口令和可选润色。  |
| [chatty-official-integration](specs/chatty-official-integration/spec.md) | 通过官方服务、公开槽和状态流增强语音底座，不替换上游包或私有编辑器。  |
| [chatty-settings-migration](specs/chatty-settings-migration/spec.md) | 维护四所有者配置、模型目录和凭据动作，完整保留迁移、引用、CAS和未知字段边界。  |
| [chatty-speech-playback](specs/chatty-speech-playback/spec.md) | 将助手回复转换为临时可听内容，管理队列与真实取消，保留原始消息。  |

## 全部既有文档分类

盘点依据为git ls-files全清单，共96个跟踪文件；包括所有md/mdx/txt/rst及对其余扩展名的检查，并非只搜索SPEC。当前有23份上述文本文档；没有另藏的requirements.txt。许可证、Git属性等非需求文本不转换为产品规则。下表逐一记录原文件，个人资料与运行文件保持原职责。

| 原文件 | 分类与去向/处理 |
|---|---|
| [AGENTS.md](../AGENTS.md) | 维护入口；精确修改旧SPEC及技术契约唯一源路由，保留代码/安全/验证/提交约定。 |
| [README.md](../README.md) | 用户说明/安装入口，保留功能、版本与发布事实，仅增加OpenSpec路由。 |
| [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) | 实际技术说明，本轮字节不变；当前所有权/模块/公开接口分入各能力，后续已确认实现同步说明。 |
| [docs/CHANGELOG.md](../docs/CHANGELOG.md) | 历史交付记录，只读保留；版本和完成事实不能扩大到未验真人/云端/公网。 |
| [docs/CONFIG-LEGACY.md](../docs/CONFIG-LEGACY.md) | 旧字段映射与引用处理说明，本轮不改；完整映射表进入settings-migration A009附录。 |
| [docs/CONFIG-UI.md](../docs/CONFIG-UI.md) | 现行字段/默认/所有者/生效及验收表，本轮不改；完整表逐行保留到settings-migration A008附录，避免100/101遗漏。 |
| [docs/CONFIG.md](../docs/CONFIG.md) | 配置使用说明，本轮字节不变；当前完整101字段以settings-migration附录及20261017升级为准。 |
| [docs/DESIGN.md](../docs/DESIGN.md) | 早期技术设计历史，不将旧Voice Draft全文、伪流式和旧状态/API当现行要求；替代关系见native-composer/capture-stt/official-integration。 |
| [docs/DEVELOPMENT.md](../docs/DEVELOPMENT.md) | 开发/调试使用说明，本轮不改；不改造成产品功能，当前流程从本索引进入OpenSpec。 |
| [docs/DSH-UPGRADE-20261011.md](../docs/DSH-UPGRADE-20261011.md) | 早期升级方案历史；后续20261013/14/17已确认方案承接，不再作为独立待开发任务。 |
| [docs/DSH-UPGRADE-20261017.md](../docs/DSH-UPGRADE-20261017.md) | 已确认0.2.1-rc.2升级和新增vadOnsetPaddingSeconds依据，101字段/目标peers与实测范围分别承接。 |
| [docs/IMPLEMENTATION-20261013.md](../docs/IMPLEMENTATION-20261013.md) | 已确认v5实施契约和当时阶段状态；采集/草稿/设置/迁移/交付分别迁主规格；整条禁用官方UI、100字段、旧版本等由后续已确认契约替代。 |
| [docs/INSTALL.md](../docs/INSTALL.md) | 安装操作与固定来源说明，本轮不改；行为边界进入delivery-boundaries F015/F016/F021。公开安装与本地验证分开。 |
| [docs/OFFICIAL-SETTINGS-20261014.md](../docs/OFFICIAL-SETTINGS-20261014.md) | 已确认官方详情增强v1；F012/F017/A011承接公开槽、唯一表单与状态流，字段数按20261017更新为101。 |
| [docs/PRD.md](../docs/PRD.md) | 已确认阶段产品快照；当前行为进入六主能力。旧100字段/阶段版本由后续升级替代，原文冻结。 |
| [docs/REQUIREMENTS.md](../docs/REQUIREMENTS.md) | 原始需求只读冻结；每节含历史示例和后续设想的去向见下表。 |
| [docs/SETTINGS-REDESIGN-20261013.md](../docs/SETTINGS-REDESIGN-20261013.md) | 已确认v6设置/模型目录/凭据文件设计；对应settings-migration F018/F019/A010，不列为待实施。 |
| [docs/SPEC.md](../docs/SPEC.md) | 旧F001–F021产品基线只读冻结；逐条映射见下表，不再双写。 |
| [docs/V1-COVERAGE.md](../docs/V1-COVERAGE.md) | V1范围与延期索引历史，delivery-boundaries和候选change承接，保留原字节。 |
| [docs/VERIFICATION-0.2.0-rc.2+chatty.1.md](../docs/VERIFICATION-0.2.0-rc.2+chatty.1.md) | v5实施验证证据，自动/宿主/设备/公网范围原样保留。 |
| [docs/VERIFICATION-0.2.0-rc.2+chatty.2.md](../docs/VERIFICATION-0.2.0-rc.2+chatty.2.md) | v6设置、目录与凭据动作验收证据；不是新增业务批准。 |
| [docs/VERIFICATION-0.2.0-rc.2+chatty.3.md](../docs/VERIFICATION-0.2.0-rc.2+chatty.3.md) | 官方详情整合/状态槽验证证据；100字段是当时目标。 |
| [docs/VERIFICATION-OFFICE-20261018.md](../docs/VERIFICATION-OFFICE-20261018.md) | F020/F021显示和统一修订验证；日常交付记录另属根。 |

## F编号 → Requirement / Scenario 完整映射

旧验收条目在对应主规格保留，并补WHEN/THEN场景；替代的历史细节见后表。下列实现状态来自原文，不是本轮产品重新验证。

| 原编号/标题 | 当前去向与Requirement | 场景 | 历史状态 |
|---|---|---|---|
| F001 麦克风与本地分句 | [chatty-capture-stt](specs/chatty-capture-stt/spec.md) / F001 | 停止与取消区别；句长和积压有界 | 原记录已实现；验证按独立证据 |
| F002 语音识别 Provider | [chatty-capture-stt](specs/chatty-capture-stt/spec.md) / F002 | partial不能成为最终文字；分片和final重放 | 原记录已实现；验证按独立证据 |
| F003 原生草稿安全插入 | [chatty-native-composer](specs/chatty-native-composer/spec.md) / F003 | 普通发送后继续听写；并发编辑保留结果 | 原记录已实现；验证按独立证据 |
| F004 精确口令与文字前缀 | [chatty-native-composer](specs/chatty-native-composer/spec.md) / F004 | 正文包含指令词；跨动作词表冲突 | 原记录已实现；验证按独立证据 |
| F005 可选润色 | [chatty-native-composer](specs/chatty-native-composer/spec.md) / F005 | 润色期间手改；多个语音片段 | 原记录已实现；验证按独立证据 |
| F006 回复渲染与朗读队列 | [chatty-speech-playback](specs/chatty-speech-playback/spec.md) / F006 | 复杂内容规则摘要；手动与自动不重复 | 原记录已实现；验证按独立证据 |
| F007 语音合成与打断 | [chatty-speech-playback](specs/chatty-speech-playback/spec.md) / F007 | 取消后合成迟到；人声打断与麦克风 | 原记录已实现；验证按独立证据 |
| F008 设置、凭据与宿主入口 | [chatty-settings-migration](specs/chatty-settings-migration/spec.md) / F008 | 并发与逐所有者保存 | 原记录已实现；验证按独立证据 |
| F009 语音对话延期 | [chatty-delivery-boundaries](specs/chatty-delivery-boundaries/spec.md) / F009 | 调用旧语音对话入口 | 现有延期边界已生效；延期能力未实现 |
| F010 可视化 | [chatty-delivery-boundaries](specs/chatty-delivery-boundaries/spec.md) / F010 | 旧波形配置 | 现有延期边界已生效；延期能力未实现 |
| F011 后续能力边界 | [chatty-delivery-boundaries](specs/chatty-delivery-boundaries/spec.md) / F011 | 查看本期能力 | 现有延期边界已生效；延期能力未实现 |
| F012 官方语音输入底座 | [chatty-official-integration](specs/chatty-official-integration/spec.md) / F012 | 增强停用恢复官方入口；官方服务重载 | 原记录已实现；验证按独立证据 |
| F013 共用注册表与能力扩展 | [chatty-official-integration](specs/chatty-official-integration/spec.md) / F013 | 注册ID冲突；本地校验与卸载 | 原记录已实现；验证按独立证据 |
| F014 统一交付与迁移 | [chatty-settings-migration](specs/chatty-settings-migration/spec.md) / F014 | 迁移只读与显式选择；恢复不覆盖后续编辑 | 原记录已实现；验证按独立证据 |
| F015 固定 Git 仓库 URL 安装 | [chatty-delivery-boundaries](specs/chatty-delivery-boundaries/spec.md) / F015 | 固定来源安装核对 | 原记录已实现；验证按独立证据 |
| F016 Bundle 基线与 Chatty 修订号 | [chatty-delivery-boundaries](specs/chatty-delivery-boundaries/spec.md) / F016 | 版本/包缺失 | 原记录已实现；验证按独立证据 |
| F017 官方详情增强配置与帮助（v3） | [chatty-settings-migration](specs/chatty-settings-migration/spec.md) / F017 | 唯一官方详情表单；刷新目录保留草稿 | 原记录已实现；验证按独立证据 |
| F018 模型与音色目录（v6） | [chatty-settings-migration](specs/chatty-settings-migration/spec.md) / F018 | 显式发现目录；目录失败或型号下线 | 原记录已实现；验证按独立证据 |
| F019 打开当前凭据文件（v6） | [chatty-settings-migration](specs/chatty-settings-migration/spec.md) / F019 | 当前自定义凭据路径；缺失文件或能力 | 原记录已实现；验证按独立证据 |
| F020 插件列表与详情的显示名称 | [chatty-delivery-boundaries](specs/chatty-delivery-boundaries/spec.md) / F020 | 本地化展示 | 原记录已实现；验证按独立证据 |
| F021 统一版本与固定交付 | [chatty-delivery-boundaries](specs/chatty-delivery-boundaries/spec.md) / F021 | 独立交付与业务保留 | 原记录已实现；验证按独立证据 |

## 原始需求逐节去向（含SPEC未覆盖项）

来源：[docs/REQUIREMENTS.md](../docs/REQUIREMENTS.md)。未覆盖不等于可以删掉；被较新已确认方案替代的条目保留历史意图并注明去向，未决条目放候选变更。

| 原章节 | 去向与判断 |
|---|---|
| 1 项目目标 | capture-stt/native-composer/speech-playback承接三类目标；Voice Draft全文方案被原生唯一正文替代。 |
| 2 整体架构 | 官方Provider/原生编辑器分工进入official-integration/native-composer；旧独立编辑框是历史布局，不恢复。 |
| 3 STT 功能需求 | capture-stt F001/F002/A001–A003与official-integration F013；本地SenseVoice现已实现，其他Provider扩展需候选。 |
| 3.1 STT Provider | capture-stt F001/F002/A001–A003与official-integration F013；本地SenseVoice现已实现，其他Provider扩展需候选。 |
| 3.2 长时间监听 | capture-stt F001/F002/A001–A003与official-integration F013；本地SenseVoice现已实现，其他Provider扩展需候选。 |
| 3.3 本地 VAD | capture-stt F001/F002/A001–A003与official-integration F013；本地SenseVoice现已实现，其他Provider扩展需候选。 |
| 3.4 Pre-roll Audio Buffer | capture-stt F001/F002/A001–A003与official-integration F013；本地SenseVoice现已实现，其他Provider扩展需候选。 |
| 4 Voice Draft | native-composer F003/A004：原生正文/可靠区间替代第二份Voice Draft；撤销/清空不再覆盖手写，取消使代次失效。 |
| 4.1 Utterance 与 Voice Draft | native-composer F003/A004：原生正文/可靠区间替代第二份Voice Draft；撤销/清空不再覆盖手写，取消使代次失效。 |
| 4.2 Voice Draft 操作 | native-composer F003/A004：原生正文/可靠区间替代第二份Voice Draft；撤销/清空不再覆盖手写，取消使代次失效。 |
| 5 语音指令 | native-composer F004/A005：已确认七动作取代旧十动作建议，暂停/继续/取消指令不冒充已注册；更强Classifier在deferred-voice-extensions R-PROFILES。 |
| 5.1 第一阶段指令 | native-composer F004/A005：已确认七动作取代旧十动作建议，暂停/继续/取消指令不冒充已注册；更强Classifier在deferred-voice-extensions R-PROFILES。 |
| 5.2 指令判断 | native-composer F004/A005：已确认七动作取代旧十动作建议，暂停/继续/取消指令不冒充已注册；更强Classifier在deferred-voice-extensions R-PROFILES。 |
| 6 润色功能 | native-composer F005：显式润色、保留原意、不自动发送，可靠区间CAS代替全稿覆盖。 |
| 7 STT 工作模式 | capture-stt显式开始/停止与持续分句；声学Wake Word进候选F011-WAKE，不把文字前缀当唤醒。 |
| 7.1 Push-to-Talk | capture-stt显式开始/停止与持续分句；声学Wake Word进候选F011-WAKE，不把文字前缀当唤醒。 |
| 7.2 Continuous Listening | capture-stt显式开始/停止与持续分句；声学Wake Word进候选F011-WAKE，不把文字前缀当唤醒。 |
| 7.3 Wake Word | capture-stt显式开始/停止与持续分句；声学Wake Word进候选F011-WAKE，不把文字前缀当唤醒。 |
| 8 流式 STT | capture-stt F002/A003：真流式partial/final；原“异常自动重连”由较新已确认不自动重传/不切Provider替代，本轮不恢复。 |
| 8.1 非流式模式 | capture-stt F002/A003：真流式partial/final；原“异常自动重连”由较新已确认不自动重传/不切Provider替代，本轮不恢复。 |
| 8.2 流式模式 | capture-stt F002/A003：真流式partial/final；原“异常自动重连”由较新已确认不自动重传/不切Provider替代，本轮不恢复。 |
| 9 STT UI | capture-stt/native-composer：实际状态反馈与partial；PAUSED/RECONNECTING等旧示例状态不当成当前可用模式。 |
| 10 音频可视化 | delivery-boundaries F010：bars/off现有；真实wave进候选F010-FUTURE。 |
| 11 TTS 总体要求 | speech-playback F006/F007：renderer→queue→provider→player，显示/朗读分离。 |
| 12 Speech Renderer | speech-playback A006：默认read/skip/summarize/smart及链接文字/引用过滤；字段附录保留配置。 |
| 12.1 默认内容处理规则 | speech-playback A006：默认read/skip/summarize/smart及链接文字/引用过滤；字段附录保留配置。 |
| 12.2 内容策略 | speech-playback A006：默认read/skip/summarize/smart及链接文字/引用过滤；字段附录保留配置。 |
| 13 表格处理 | speech-playback F006/A006：表格规则摘要，显式模型摘要可选且失败回退，不无条件调用LLM。 |
| 14 代码处理 | speech-playback A006：代码默认跳过与配置策略，原消息保持。 |
| 15 Display Response 与 Speech Response 分离 | speech-playback A006：临时Speech Text不改原Message；额外结构化speech字段只是未来协议可能，不改DSH协议。 |
| 16 Streaming LLM 与 TTS | speech-playback A006：按完整块/句缓冲，不每token直接TTS。 |
| 17 Speech Buffer | speech-playback A006：Speech Buffer完整块判断；不把原建议类名强制重构源码。 |
| 18 Speech Queue | speech-playback F007/A007：顺序队列、停止/切会话/轮次取消和迟到结果丢弃。 |
| 19 TTS Provider | speech-playback F007与settings附录保留两Provider参数；任意新TTS/流式能力需候选R-PROVIDERS，能力不可凭接口示例声称实现。 |
| 20 TTS 功能 | speech-playback F006/F007：当前最新消息手动、独立自动、人声打断；每条历史消息入口进候选R-READ-HISTORY。 |
| 21 避免 TTS 被 STT 再次识别 | speech-playback A007：当前播放时不提交回声、已监听可VAD打断；完整AEC/Playback Reference/全双工进F011-DUPLEX。 |
| 22 配置系统 | settings-migration：实际101字段/四owner/引用凭据，旧provider/lang/continuous/wake_word等示例按A009迁移，不恢复旧同义键。 |
| 22.1 Provider | settings-migration：实际101字段/四owner/引用凭据，旧provider/lang/continuous/wake_word等示例按A009迁移，不恢复旧同义键。 |
| 22.2 Credentials | settings-migration：实际101字段/四owner/引用凭据，旧provider/lang/continuous/wake_word等示例按A009迁移，不恢复旧同义键。 |
| 22.3 STT Config | settings-migration：实际101字段/四owner/引用凭据，旧provider/lang/continuous/wake_word等示例按A009迁移，不恢复旧同义键。 |
| 22.4 Voice Control Config | settings-migration：实际101字段/四owner/引用凭据，旧provider/lang/continuous/wake_word等示例按A009迁移，不恢复旧同义键。 |
| 22.5 TTS Config | settings-migration：实际101字段/四owner/引用凭据，旧provider/lang/continuous/wake_word等示例按A009迁移，不恢复旧同义键。 |
| 23 UI 布局建议 | native-composer/official-integration：现有按钮/dock/原生唯一正文；旧独立Draft、暂停/重连布局建议被新契约替代。 |
| 23.1 DSH 主界面 | native-composer/official-integration：现有按钮/dock/原生唯一正文；旧独立Draft、暂停/重连布局建议被新契约替代。 |
| 23.2 Voice Draft | native-composer/official-integration：现有按钮/dock/原生唯一正文；旧独立Draft、暂停/重连布局建议被新契约替代。 |
| 23.3 状态显示 | native-composer/official-integration：现有按钮/dock/原生唯一正文；旧独立Draft、暂停/重连布局建议被新契约替代。 |
| 24 推荐状态机 | capture-stt/speech-playback的代次和取消边界；旧推荐状态枚举不是额外已实现功能。 |
| 25 V1 范围 | 六主能力保留适用V1目标；wave、独立Draft与旧口令按上述替代/延期，不以V1标题宣称全实现。 |
| 26 V1 暂不实现 | 候选F011-WAKE/F011-DUPLEX/R-PROVIDERS：唤醒/AEC/全双工/Speech-to-Speech/多人/身份/本地TTS延期；本地STT已由官方SenseVoice实现。 |
| 27 后续阶段 | 候选强分类/Profiles/全双工等；人声打断、可选模型摘要已在主规格，不能因原V2标签重新标未实现；新增模式不得破坏原编排。 |
| 28 核心设计原则总结 | native-composer/speech-playback保留多句显式发送与双显示/朗读原则；中间正文所有权按后续原生契约。 |
| 29 项目定位 | delivery-boundaries F020当前中文/英文描述和包身份，原建议英文说明作为历史来源保留。 |

## 历史替代、遗漏与不确定点

- SPEC F008/F017、PRD/CONFIG和官方详情历史文档中的100字段由20261017已批准升级增加vadOnsetPaddingSeconds后成为101：Chatty74＋speech2＋api2＋SenseVoice23。主规格使用101且完整保留CONFIG-UI表；不是凭源码自行扩需求。
- F016旧+chatty.N后缀被F021 office-suite-implementation-20261018-v1的+rev.N替代，当前0.2.1-rc.2+rev.1；完整版本/源码SHA/散列和跨基线拒绝不变。
- IMPLEMENTATION §1整条disabled官方ui-voice-input的早期组合被OFFICIAL-SETTINGS已确认方案取消；当前只以公开activity优先级遮蔽重复麦克风并可恢复。
- DESIGN/原始需求的第二份Voice Draft和pseudo-stream不是生产新契约；原生输入是唯一正文，完整句与真async流式边界保留。
- 原流式异常自动重连已由后续明确“失败不自动重传、不切Provider、不升partial为final”替代，不新增待办去恢复它。
- 原指令示例含暂停/继续/取消十动作，但后续契约固定七动作；状态枚举/示例不是遗漏实现授权。真实波形、语音对话、唤醒、完整AEC与跨应用均待选定。
- 原后续列表中的本地STT、用户讲话打断、规则/模型摘要已有实现，不错误迁到未实施区；历史逐条消息朗读和更强Classifier/Profiles等则有候选去向。
- 旧实施文件“本次只完善文档/未开发”是当时阶段快照；是否后来已落地以SPEC和对应VERIFICATION记录分开判断，旧字节不重写。

## 确认、实现与验证证据

- native-voice-enhancement-20261013-v5、settings redesign v6、chatty-official-settings-20261014-v1有旧明确确认及对应chatty.1/.2/.3验收文件。
- 20261017升级明确批准增加官方字段并报告当时210项测试及宿主检查；20261018统一名称/版本另有office验收。主规格只承接已落地预期，不把这些证据扩展为真人麦克风/真实云TTS/公网Git安装全通过。
- F009–F011只证明当前禁用/延期边界已有落实；其未来能力仍未确认。所有候选tasks保持未勾选。

本轮仅做OpenSpec严格校验、完整F编号/文档分类/链接与受保护文件哈希核对，结果由根迁移报告记录。未运行产品测试、构建、真人设备、云端调用或安装；没有提交/推送，也不提高兼容标记。旧验收中的待办不会被文档结构校验自动消除。
