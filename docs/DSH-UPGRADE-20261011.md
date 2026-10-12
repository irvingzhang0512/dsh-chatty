# Desktop 0.2.0-rc.2 接入

当前实施版 native-voice-enhancement-20261013-v5，包 0.2.0-rc.2+chatty.1；取代旧按“业务不变”迁移的目标描述。完整 API 见 [实施契约](IMPLEMENTATION-20261013.md)，实际证据见 [验收记录](VERIFICATION-0.2.0-rc.2+chatty.1.md)。

宿主值导入集中在 index.js；defineTool、Credentials、LLM 消息使用目标公开接口。官方识别注册和 Remote 作为底座；公开输入动作替代私有编辑器／全文镜像；插件设置通过实际唯一所有者 configEditor 保存；浏览器槽使用当前公开 input/session props，SSE fetch 支持原生协议。

退役 voiceChat／自动发送，现有按钮与五标签保持。精确绑定五个语音包并运行检查，不能仅改 peer 范围。旧核心版本锁不接受本次提交，兼容未完整验收前保持 verified=false。
