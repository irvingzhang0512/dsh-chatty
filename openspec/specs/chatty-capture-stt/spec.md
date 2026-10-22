# chatty-capture-stt

## Purpose

采集、分句、正式结果处理和Provider协议，保持失败不切换、不将临时结果落字。 本文是迁移后的活动规格；旧文档仅为冻结来源。迁移不新增功能、不等于重新完成运行验收。

## Requirements

### Requirement: F001 麦克风与本地分句

系统 SHALL 满足本条既有行为与验收约束。来源：冻结的 [SPEC F001](../../../docs/SPEC.md)；确认、历史实现与验证依据见 [迁移索引](../../MIGRATION.md)。

- 预期：点击开始、按句持续采集；浏览器重采样 16k 单声道 PCM16，VAD、句首缓冲、最长句及积压有界；默认不开机监听。停止收尾末句，取消使未完成代次失效。
- 验收：停顿多句按序累计；停止保留末句；取消／卸载释放采集；麦克风授权、选设备和处理参数单列真实设备验收。

#### Scenario: 停止与取消区别

- **WHEN** 用户听写多句后选择停止，或在未完成句选择取消
- **THEN** 停止收尾末句并按序处理；取消使未完成代次失效且释放采集，已插入正文不回删。

#### Scenario: 句长和积压有界

- **WHEN** 达到最长句或待识别句上限
- **THEN** 句长正常收尾，积压上限停止接收新句并提示处理，保留已完成文字；默认不开机监听。


### Requirement: F002 语音识别 Provider

系统 SHALL 满足本条既有行为与验收约束。来源：冻结的 [SPEC F002](../../../docs/SPEC.md)；确认、历史实现与验证依据见 [迁移索引](../../MIGRATION.md)。

- 预期：火山双向流式仅使用 async 端点；本地与硅基流动分句。临时结果只预览，重复 final 只处理一次；失败不换供应商、不将 partial 提升为 final。
- 验收：握手前停止、重复分片、缺序、字节／时长超限、断连、取消与重复终态覆盖；真实云端另验。

#### Scenario: partial不能成为最终文字

- **WHEN** 火山实时识别只有partial，之后断连或超时
- **THEN** 只显示临时预览并报告失败，不执行口令、不插正文、不换供应商、不静默重传。

#### Scenario: 分片和final重放

- **WHEN** 同序号音频重复到达或同一句final重复发出
- **THEN** 相同分片幂等确认，异内容同序号或缺号拒绝；final最多处理一次，旧代次丢弃。


### Requirement: A001 采集快照与资源预算

系统 SHALL 在显式开始时创建recordingGeneration，每句固定UUID utteranceId、utteranceSeq、sessionId、Provider、语言、配置及有效上限。音频为16k单声道PCM16，非16k输入跨帧重采样；VAD默认enabled=true、sensitivity=0.6、silence_timeout_ms=1200、min_speech_ms=200、pre_roll_ms=400，区别于官方SenseVoice参数。句长默认30秒、max_pending默认4；有效限制取Chatty/API/Provider最严格者且计WAV头。VAD关闭仍按最长句收尾，预录、连接缓冲、事件与待插入结果均有界。来源：[冻结实施契约 §3及完整句快照](../../../docs/IMPLEMENTATION-20261013.md)。

#### Scenario: 录音中配置变化

- **WHEN** 开始一句后用户切换官方Provider或修改普通参数
- **THEN** 本句使用句首快照，后续句读取新选择；设备处理在下次开麦生效，不能把一句音频拆给不同Provider。

#### Scenario: 积压达上限后恢复

- **WHEN** 待识别或待插入预算已满
- **THEN** 停止新采集并提示；只有用户显式重新开始才恢复，不默默丢掉文字腾空间。


### Requirement: A002 完整句和实时路径

系统 SHALL 将本地SenseVoice、硅基及火山完整句统一交官方speechController与具名Provider，经过canonical base64、WAV、语言和尺寸校验。本地不上传云端。火山实时只走async端点，按200ms PCM片段发送且不含WAV头；密钥只由宿主Credentials解析。云端语言按各适配器明确支持集校验，zh-CN/en-US迁为zh/en，不将不支持语言偷偷改auto。来源：[冻结实施契约 §3](../../../docs/IMPLEMENTATION-20261013.md)。

#### Scenario: 本地完整识别

- **WHEN** 选择实际注册的SenseVoice本地Provider上传完整WAV
- **THEN** 只走官方本地识别及校验，不复制模型准备逻辑、不发送云端请求。

#### Scenario: 不支持语言

- **WHEN** 指定该Provider未声明的语言
- **THEN** 明确拒绝，不降级为auto冒充成功。


### Requirement: A003 流式和完整句接口

系统 SHALL 保持 /dsh-chatty/stt/stream/start、push、events、stop、cancel：start固定身份与限制，push的sequence从1连续，events按SSE发送ready/partial/final/error/closed并携带完整句身份与eventSeq；先ready再接受音频，partial替换预览，error后不得final。stop等lastSequence及正式final且幂等，空闲等待默认15000ms并受总超时限制；cancel、断开、超时、卸载清理对应流。缓存最多32事件，partial只留最新且终态不能挤掉。完整句capture/start和capture/cancel固定captureId快照；过期、重复提交、实例替换拒绝，取消早于start响应仍有效。来源：[冻结实施契约 §3.3及末节](../../../docs/IMPLEMENTATION-20261013.md)。

#### Scenario: 取消先于开始响应

- **WHEN** 用户已取消当前句，而迟到start返回streamId或captureId
- **THEN** 旧身份仍失效，释放资源，不能继续上传或将结果插入其他会话。

#### Scenario: 不可信请求

- **WHEN** 外部Origin或客户端任意供应商端点/凭据注入请求访问识别路由
- **THEN** 会话所有权与回环/可信Origin校验拒绝；允许精确原生dsh-app://app及匹配回环宿主，不广泛放行null。
