## ADDED Requirements

### Requirement: F009-FUTURE 真实语音对话候选

若被选定批准，系统 SHALL 提供明确对话模式，同时保留普通听写显式发送及Session/Tools/Skills/Memory编排；自动提交条件在确认版单独说明。

#### Scenario: 对话模式切换

- **WHEN** 未来用户明确选择或退出对话
- **THEN** 边界清晰且取消旧代次，不把未发送文字误提交；未选择模式仍不能自动发送。


### Requirement: F010-FUTURE 真实波形候选

若被选定批准，系统 SHALL 从真实音频提供波形，区别于bars/off音量可视化；旧wave→bars事实保持。

#### Scenario: 旧bars配置

- **WHEN** 升级后读取已经迁为bars的配置
- **THEN** 不自动切真实波形；明确选择后启用，停止/卸载释放绘制资源。


### Requirement: F011-WAKE 声学唤醒候选

若被选定批准，系统 SHALL 使用独立声学检测唤醒输入，明确持续监听授权/误触发边界；文字前缀不能当声学唤醒验收。

#### Scenario: 未启用常开麦

- **WHEN** 用户未明确开启声学唤醒
- **THEN** 不开麦或准备新模型；文字前缀只在已有听写结果中匹配。


### Requirement: F011-DUPLEX AEC与全双工候选

若被选定批准，系统 SHALL 为完整AEC/Playback Reference/全双工/Speech-to-Speech选定项定义独立可测指标，防止回声错误提交循环，可取消旧识别/播放。

#### Scenario: 播放同时讲话

- **WHEN** 未来模式在支持真实设备播放并接收用户声
- **THEN** 按确认指标区分回声/人声并可打断取消；浏览器开关或模拟单测不能替代设备验收。


### Requirement: R-PROFILES 强口令与语音档案候选

若被选定批准，系统 SHALL 支持原需求§5.2/§27的强口令分类或Voice Profiles，保护普通正文和七动作精确匹配；档案字段/优先级/覆盖需明确。

#### Scenario: 近似指令正文

- **WHEN** 新分类器遇到含发送的普通句子
- **THEN** 按确认防误触规则不擅自提交，不降低exact边界；档案切换不丢草稿。


### Requirement: R-PROVIDERS 新增Provider和声源候选

若被选定批准，系统 SHALL 对本地TTS、新STT/TTS Provider、多人声源或Speaker Identification逐项声明真实能力/依赖，不把已有本地STT重复列为待实现。

#### Scenario: Provider不支持能力

- **WHEN** 用户指定未来Provider不支持的语言/格式/声源
- **THEN** 明确拒绝或不可用，不静默切源；模型、音频、身份数据保存边界先确认。


### Requirement: R-READ-HISTORY 历史消息朗读候选

若被选定批准，系统 SHALL 为原需求§20逐条Assistant消息提供明确选中入口，区别于当前仅最新消息手动朗读。

#### Scenario: 选择历史消息

- **WHEN** 用户显式选择未来入口中的一条历史回复
- **THEN** 仅渲染所选消息，正文保留，取消/切会话后不恢复旧音频。


### Requirement: F011-EXTERNAL 翻译与跨应用边界

系统 SHALL 将原SPEC F011翻译/跨应用保持待选范围；实施前确认目标、权限、输入输出和失败边界，语音口令不能自动扩大授权。

#### Scenario: 外部控制或翻译需求

- **WHEN** 用户希望语音改变其他应用或添加翻译
- **THEN** 先形成独立可审阅设计/验收，不宣称当前口令/朗读已有这些能力。
