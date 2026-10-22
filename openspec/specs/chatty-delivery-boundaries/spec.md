# chatty-delivery-boundaries

## Purpose

维护延期边界、独立插件身份和当前精确组合；历史发布/设备验证不能由迁移推定。 本文是迁移后的活动规格；旧文档仅为冻结来源。迁移不新增功能、不等于重新完成运行验收。

## Requirements

### Requirement: F009 语音对话延期

系统 SHALL 满足本条既有行为与验收约束。来源：冻结的 [SPEC F009](../../../docs/SPEC.md)；确认、历史实现与验证依据见 [迁移索引](../../MIGRATION.md)。

- 预期：隐藏旧对话入口；旧接口返回 410 feature_deferred，不恢复旧模式或识别后自动发送；独立自动朗读保留。
- 验收：不存在对话按钮／auto_send 控件；旧配置迁移清除，停止、润色和 final 不自动发送。

#### Scenario: 调用旧语音对话入口

- **WHEN** 可信客户端POST旧/dsh-chatty/voice-chat
- **THEN** 返回410 feature_deferred且不改变状态；其他方法405，信任校验仍先执行；独立自动朗读不受影响。


### Requirement: F010 可视化

系统 SHALL 满足本条既有行为与验收约束。来源：冻结的 [SPEC F010](../../../docs/SPEC.md)；确认、历史实现与验证依据见 [迁移索引](../../MIGRATION.md)。

- 预期：本期只有音量柱 bars 与关闭 off；旧 wave 迁移到 bars，真实波形延期。
- 验收：非法模式不能保存；旧 wave 预览并迁移，不作为真实波形能力。

#### Scenario: 旧波形配置

- **WHEN** 迁移检测ui.visualizer=wave或新设置提交其他非法值
- **THEN** 旧wave预览迁到bars，新非法值拒绝；本期仅bars/off，不把音量条称真实波形。


### Requirement: F011 后续能力边界

系统 SHALL 满足本条既有行为与验收约束。来源：冻结的 [SPEC F011](../../../docs/SPEC.md)；确认、历史实现与验证依据见 [迁移索引](../../MIGRATION.md)。

- 预期：声学唤醒、完整双向对话、完整 AEC、翻译及跨应用控制不纳入本期。文字前缀不等于声学唤醒。
- 验收：不展示未实现占位开关，不登记这些能力已通过。

#### Scenario: 查看本期能力

- **WHEN** 用户查看设置和说明
- **THEN** 不展示声学唤醒、完整AEC、全双工、翻译、跨应用控制的可用占位开关，不将文字前缀记为声学唤醒。


### Requirement: F015 固定 Git 仓库 URL 安装

系统 SHALL 满足本条既有行为与验收约束。来源：冻结的 [SPEC F015](../../../docs/SPEC.md)；确认、历史实现与验证依据见 [迁移索引](../../MIGRATION.md)。

- 预期：正式来源固定 GitHub tag／完整 SHA；仓库含完整运行产物，安装无 prepare／install 构建步骤。预检组合、来源和完整提交；首装、更新、回退分别记录。
- 验收：离线本地 Git 验证与公开 GitHub 安装区分；正式 tag 未发布时不能声称可安装；不兼容拒绝保留诊断。

#### Scenario: 固定来源安装核对

- **WHEN** 预检公开Git tag或完整SHA安装
- **THEN** 核对完整运行产物、来源和精确组合，安装不依赖现场prepare/install构建；未发布tag不称可安装，离线Git与公网安装分别记账。


### Requirement: F016 Bundle 基线与 Chatty 修订号

系统 SHALL 满足本条既有行为与验收约束。来源：冻结的 [SPEC F016](../../../docs/SPEC.md)；确认、历史实现与验证依据见 [迁移索引](../../MIGRATION.md)。

- 预期：保留F016的精确Desktop、Bundle、四子包和诊断边界。历史“Bundle版本+chatty.整数”由F021已确认统一为“宿主基线+rev.N”；N是无前导零的安全正整数。自身manifest、compatibility和实际挂载版本一致；旧后缀只按明确锁/散列迁移。
- 验收：版本目标/实际均显示，缺包或失配停止增强；同基线修订比较与跨基线拒绝维持，不恢复旧后缀为当前规则。

#### Scenario: 版本/包缺失

- **WHEN** 目标与实际Desktop、官方Bundle及四成员不一致或缺包
- **THEN** 停止增强保留诊断；同基线按+rev.N整数比较，跨基线拒绝，不因SemVer忽略metadata而误判。


### Requirement: F020 插件列表与详情的显示名称

系统 SHALL 满足本条既有行为与验收约束。来源：冻结的 [SPEC F020](../../../docs/SPEC.md)；确认、历史实现与验证依据见 [迁移索引](../../MIGRATION.md)。

插件 SHALL 通过分发locale提供规定的中英文名称及简介，保持包名和运行身份不变；布局和旧功能回归按下列精确断言验收。

#### Scenario: 本地化展示

- **WHEN** 宿主切换中英文并读取固定包locale
- **THEN** 显示Irving · 语音增强/Irving · Voice Enhancement及对应简介；完整@irvingzhang0512/dsh-chatty和运行标识不变。
- **AND** 场景与预期：中文显示「Irving · 语音增强」，英文显示「Irving · Voice Enhancement」；保留完整包名 @irvingzhang0512/dsh-chatty 与全部运行标识。
- **AND** 中文简介：为 DSH 内置语音输入服务增加新功能，支持 TTS 朗读、STT 持续听写、语音口令、草稿润色及远程 ASR 配置。
- **AND** 英文简介：Extend the DSH built-in voice input service with TTS read-aloud, continuous STT dictation, voice commands, draft polishing, and remote ASR configuration.
- **AND** 技术契约：导出 locale/en.json 与 locale/zh.json 的 meta.title／meta.description；exports["./locale/*.json"] 指向对应资源，files 分发 locale，package.description 使用中文简介兜底。客户端设置／详情标题同步；功能导航不强制改名。
- **AND** 验收：目标宿主从固定 tgz 解析两语言名称／简介，原生列表、详情、成员行一致；无新增布局溢出，原工具／配置／存储保持。新套件成员在隔离验证后交付日常。

### Requirement: F021 统一版本与固定交付

系统 SHALL 满足本条既有行为与验收约束。来源：冻结的 [SPEC F021](../../../docs/SPEC.md)；确认、历史实现与验证依据见 [迁移索引](../../MIGRATION.md)。

插件 SHALL 使用完整宿主基线加整数修订号交付，并核对源码与产物身份，保持独立安装、旧配置及业务资料；下列场景保留原迁移与交付断言。

#### Scenario: 独立交付与业务保留

- **WHEN** 根入口将Chatty交付为0.2.1-rc.2+rev.1
- **THEN** 独立安装且核对完整版本/SHA/产物散列；未知配置、工具引用、文档及凭据保留，CAS备份回滚由根维护入口执行。
- **AND** 包版本统一为 0.2.1-rc.2+rev.1；宿主与官方 peers 仍为实际要求的原版本。完整字符串、源码 SHA 和产物散列同时校验，不能使用忽略 build metadata 的 SemVer 判断修订升级。
- **AND** Chatty／Automation 的原比较接口保留，规范后缀改为 +rev.N，N 为无前导零的安全正整数；跨官方基线拒绝。旧版本仅由明确迁移映射及原锁／散列接管，不能把旧后缀 .1 与 rev.1 当作无需更新。
- **AND** 本包继续独立安装，不进入办公套件；启停和业务配置语义保持。
- **AND** 配置／数据：没有业务字段改名或存储搬迁；套件接管仅处理组合选择与既有 disabled 字段，保留未知配置、工具引用、文档和凭据。迁移 CAS／备份／冲突／回滚由根维护入口执行。
- **AND** 验收：完整产物、版本迁移、原功能回归；成员还需唯一实例、旧配置命中、总／子开关与业务资料保留。具体记录见 VERIFICATION-OFFICE-20261018.md（完成后生成）。
