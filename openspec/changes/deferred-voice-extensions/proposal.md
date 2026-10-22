# deferred-voice-extensions

## Why

原需求与SPEC F009–F011保留语音对话、波形、声学唤醒、完整AEC等方向。原V2部分能力现已实现（本地STT、人声打断、规则/可选模型摘要），不能整体再标待做。

本次仅搬迁历史候选需求，尚未获得该业务方案的具体版本确认，不是开发授权。

## What Changes

- 保留波形、声学唤醒、完整AEC/全双工/对话候选。
- 保留强口令、Voice Profile、扩展Provider/本地TTS/多人声源、翻译/跨应用边界。
- 逐项选定后细化；不恢复auto_send、旧Voice Draft或失败自动重连。

## Capabilities

### New Capabilities

- `chatty-voice-extensions`: 未选定的后续语音能力集合。

### Modified Capabilities

无已批准修改；若后续选择改变现有能力，须先把对应完整 Requirement 转为 MODIFIED 增量并重新确认。

## Impact

可能影响采集/播放、权限、模型/端点、原生编辑器、配置和资源预算。当前对话410、bars/off、显式发送、原生唯一正文与官方模型所有权继续有效。
