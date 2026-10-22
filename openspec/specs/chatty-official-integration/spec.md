# chatty-official-integration

## Purpose

通过官方服务、公开槽和状态流增强语音底座，不替换上游包或私有编辑器。 本文是迁移后的活动规格；旧文档仅为冻结来源。迁移不新增功能、不等于重新完成运行验收。

## Requirements

### Requirement: F012 官方语音输入底座

系统 SHALL 满足本条既有行为与验收约束。来源：冻结的 [SPEC F012](../../../docs/SPEC.md)；确认、历史实现与验证依据见 [迁移索引](../../MIGRATION.md)。

- 预期：官方 Bundle 与四个子包保持上游；移除整个 ui-voice-input 条目的组合禁用，保留官方原配置、录音组件注册与服务。通过公开 activity 单槽优先级只隐藏重复官方麦克风；兼容失配、停用／卸载增强时释放遮蔽。官方状态流更新摘要与后续听写选择，不重载配置草稿。
- 验收：原生只有 Chatty 听写／朗读操作；官方原服务／语言／模型准备可用；迟到／重载、增强停用／卸载与兼容失配恢复官方录音入口；流取消释放且不恢复旧状态。

#### Scenario: 增强停用恢复官方入口

- **WHEN** 官方录音槽被Chatty通过公开activity优先级遮蔽后，增强停用/卸载/版本失配
- **THEN** 仅释放自有遮蔽，官方原麦克风恢复；官方配置、模型准备与服务从未被整包禁用。

#### Scenario: 官方服务重载

- **WHEN** 官方服务迟到或重新挂载并发出状态流
- **THEN** 取消旧订阅、丢弃迟到事件，读取新实例；只更新摘要与下句选择，不重置当前配置草稿。


### Requirement: F013 共用注册表与能力扩展

系统 SHALL 满足本条既有行为与验收约束。来源：冻结的 [SPEC F013](../../../docs/SPEC.md)；确认、历史实现与验证依据见 [迁移索引](../../MIGRATION.md)。

- 预期：Chatty cloud Provider 具名注册；完整识别统一经官方 speechController；目录读取实际 Provider、语言、状态与上限。普通参数重载后重新取得官方服务。
- 验收：本地真实推理经过官方完整 WAV 校验；语言不支持拒绝；上限修改及时生效；注销取消资源。

#### Scenario: 注册ID冲突

- **WHEN** Chatty云端Provider具名注册遇到其他插件同ID
- **THEN** 拒绝冲突，不替换其他Provider；兼容检查失败不注册云端、不准备模型、不改偏好。

#### Scenario: 本地校验与卸载

- **WHEN** 本地完整WAV调用官方服务后插件卸载
- **THEN** 完整校验与实际Provider限制生效，注销清理自己资源，不取消无关官方准备任务。


### Requirement: A011 官方详情槽与状态流所有权

系统 SHALL 通过plugins.detail.section的自有id/order追加唯一增强表单，保留官方plugins.bundle.config与成员列表；自身详情通过公开pluginNavigation.openBundle跳转，缺能力解释而不影响听写。仅当版本匹配、增强启用且原赢家是官方voice-input locale时以conversation.input.activity单槽priority=-100遮蔽重复麦克风，不修改其他赢家/官方DOM。公开remote.$stream消费speech.follow，接收catalog/accept；断连保留最后状态并提示，卸载取消并等待退出。来源：[冻结官方详情契约](../../../docs/OFFICIAL-SETTINGS-20261014.md)。

#### Scenario: 其他插件占用activity槽

- **WHEN** 当前槽赢家不是官方voice-input或自有注册失败
- **THEN** 不删除或篡改其他条目，记录诊断；官方/第三方UI所有权保持。
