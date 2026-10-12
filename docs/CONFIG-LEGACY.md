# 旧 Chatty 配置迁移核对

文档版：`native-voice-enhancement-20261012-v3`；2026-10-12；状态：迁移调查，非新版配置方案。

本文件保留 v2 对现有 Chatty 72 项 schema 的源码核对，供兼容与迁移调查使用。[新版配置设计](CONFIG-UI.md) 以当前官方插件为起点，再按增强功能设计新增项。下表的入口／处理是上一稿建议，是否保留、改名或清理须对照新版已确认功能与真实引用决定，不能把旧 schema 自动当成新版需求。原始 REQUIREMENTS 仍保持只读。

## 旧字段调查（72 项）


按 [lib/config.js](../lib/config.js) 静态枚举；`voice_control.commands` 按一个字典字段计，UI 中展开当前 7 类动作分别编辑词表。下表全部为目标入口安排，现况列仅来自源码检查，未进行 GUI 保存验证。

| 当前字段 | 中文控件／目标标签 | 现况与目标处理 |
|---|---|---|
| `stt.provider` | 识别服务选择／语音输入 | 已有；迁移为官方选择，提供本地／云端同一列表 |
| `stt.model` | 云端识别模型／语音输入 | 已有；按所选云端 Provider 显示 |
| `stt.credential` | 识别凭据引用／语音输入 | 已有；保留 |
| `stt.streaming` | 优先流式／语音输入 | 已有；按真实能力提示 |
| `stt.language` | 识别语言／语音输入 | 已有；迁移为官方语言，按 Provider 校验 |
| `stt.base_url` | 批量识别端点／高级·识别连接 | 已有；不适用时解释原因 |
| `stt.stream_url` | 流式识别端点／高级·识别连接 | 已有；保留 |
| `stt.resource_id` | 识别资源 ID／高级·识别连接 | 已有；保留 |
| `stt.continuous_listening` | 页面启动后监听／语音输入 | 已有；与一次／持续听写模式分别说明 |
| `stt.partial_preview` | 显示识别预览／语音输入 | 已有；明确原生／快照预览区别 |
| `stt.vad.enabled` | 启用本地分句／语音输入 | 缺失；补开关及关闭时的收尾规则 |
| `stt.vad.sensitivity` | 分句灵敏度／语音输入 | 已有；保留 |
| `stt.vad.silence_timeout_ms` | 句尾静音毫秒／语音输入 | 已有；保留 |
| `stt.vad.min_speech_ms` | 最短人声毫秒／语音输入 | 已有；保留 |
| `stt.vad.pre_roll_ms` | 句首缓冲毫秒／语音输入 | 已有；保留 |
| `stt.wake_word.enabled` | 历史声学唤醒占位／高级·迁移结果 | 未实现；核对引用后清理，不补虚假可用开关 |
| `stt.wake_word.text` | 历史声学唤醒文本／高级·迁移结果 | 同上；文字前缀由 voice_control 设置 |
| `tts.provider` | 合成服务／语音输出 | 已有；保留 |
| `tts.model` | 合成模型／高级·语音输出 | 已有；保留 |
| `tts.voice` | 音色／语音输出 | 已有；保留选择及自定义 ID |
| `tts.credential` | 合成凭据引用／语音输出 | 已有；保留 |
| `tts.stream_url` | 合成端点／高级·语音输出 | 缺失；补控件 |
| `tts.resource_id` | 合成资源 ID／高级·语音输出 | 缺失；补控件 |
| `tts.speed` | 语速／语音输出 | 已有；按 Provider 范围校验 |
| `tts.format` | 音频格式／语音输出 | 已有；按 Provider 枚举 |
| `tts.sample_rate` | 采样率／高级·语音输出 | 已有；按 Provider 范围校验 |
| `tts.volume` | 播放音量／语音输出 | 已有；保留 |
| `tts.auto_read` | 自动朗读／语音输出 | 已有；与运行时对话模式分开 |
| `tts.interrupt_on_speech` | 人声打断朗读／语音输出 | 已有；不称完整 AEC |
| `tts.code_hint` | 跳过代码时口播提示／语音输出 | 已有；保留 |
| `tts.llm_summary` | 允许模型摘要／语音输出 | 已有；说明额外模型调用 |
| `tts.summary_prompt` | 语音摘要提示词／高级·内容整理 | 缺失；补多行编辑及恢复默认 |
| `tts.max_chars` | 单段合成字符上限／高级·语音输出 | 缺失；补数值控件 |
| `tts.renderer.paragraph` | 段落朗读策略／语音输出·内容策略 | 缺失；补合法策略选择 |
| `tts.renderer.heading` | 标题朗读策略／语音输出·内容策略 | 缺失；同上 |
| `tts.renderer.list` | 列表朗读策略／语音输出·内容策略 | 缺失；同上 |
| `tts.renderer.table` | 表格朗读策略／语音输出·内容策略 | 缺失；同上 |
| `tts.renderer.code_block` | 代码块朗读策略／语音输出·内容策略 | 缺失；同上 |
| `tts.renderer.inline_code` | 行内代码策略／语音输出·内容策略 | 缺失；同上 |
| `tts.renderer.mermaid` | Mermaid 图策略／语音输出·内容策略 | 缺失；同上 |
| `tts.renderer.ascii_diagram` | 文本图策略／语音输出·内容策略 | 缺失；同上 |
| `tts.renderer.url` | 链接朗读策略／语音输出·内容策略 | 缺失；同上 |
| `tts.renderer.image` | 图片朗读策略／语音输出·内容策略 | 缺失；同上 |
| `tts.renderer.math_block` | 数学块策略／语音输出·内容策略 | 缺失；同上 |
| `tts.renderer.tool_log` | 工具日志策略／语音输出·内容策略 | 缺失；同上 |
| `tts.renderer.blockquote` | 引用块策略／语音输出·内容策略 | 缺失；同上 |
| `voice_control.enabled` | 启用口令／指令与草稿 | 已有；保留 |
| `voice_control.command_mode` | 整句／前缀／关闭／指令与草稿 | 已有；保留 |
| `voice_control.wake_prefix` | 文字唤醒前缀／指令与草稿 | 已有；保留 |
| `voice_control.wake_words` | 额外文字前缀／指令与草稿 | 已有；保留可编辑列表 |
| `voice_control.commands` | 7 类动作的说法列表／指令与草稿 | 缺编辑入口；按动作增删词语并检查冲突 |
| `draft.auto_send` | 说完自动发送／指令与草稿 | 有入口；当前局部值与整份表单变量混用，需回归显示／保存一致 |
| `draft.max_utterances` | 最大保留语音段数／高级·草稿 | 缺失；仍有宿主读取，先固定新操作记录含义 |
| `draft.separator` | 分段分隔符／高级·草稿 | 缺失；提供换行／空格／自定义选择，先核对有效引用 |
| `draft.polish_on_command` | 允许口令润色／指令与草稿 | 有入口；当前局部值与整份表单变量混用，需回归 |
| `polish.enabled` | 允许润色与摘要／高级·润色 | 已有；保留 |
| `polish.prompt` | 润色提示词／高级·润色 | 缺失；补多行编辑及恢复默认 |
| `polish.provider` | 润色 Provider／高级·润色 | 缺失；当前提示手改文件，改成 UI |
| `polish.model_id` | 润色模型／高级·润色 | 缺失；提供跟随当前会话／固定模型 |
| `polish.base_url` | 润色兼容端点／高级·润色 | 缺失；改成 UI |
| `polish.key_env` | 润色凭据引用／高级·润色 | 缺失；补控件，明确是引用而非明文密钥 |
| `ui.show_voice_bar` | 显示语音按钮栏／界面 | 已有；保留 |
| `ui.show_draft_panel` | 显示语音操作区域／界面 | 已有；保留当前 dock，不另建草稿框 |
| `ui.visualizer` | 音频可视化／界面 | 已有；wave 未实现，明确不可用／迁移状态，F010 单独确认 |
| `ui.panel_width` | 操作区域最大宽度／界面 | 已有；保留 |
| `ui.show_partial` | 显示预览区域／界面 | 已有；与识别预览开关的组合说明清楚 |
| `timeout_ms` | 请求超时毫秒／高级·限制 | 缺失；补控件，不与音频时长混为一项 |
| `max_audio_bytes` | 旧音频字节上限／高级·限制 | 缺失；迁移到官方／扩展实际限制，只保留一个有效写入归属 |
| `mic_device_id` | 麦克风设备／高级·录音 | 已有；修正显示误读 draft.mic_device_id，提供默认／设备选择 |
| `noise_suppression` | 浏览器降噪／高级·录音 | 已有；保留 |
| `echo_cancellation` | 浏览器回声消除／高级·录音 | 已有；保留 |
| `auto_gain_control` | 浏览器自动增益／高级·录音 | 已有；保留 |

## 遗留引用与验证


设置卡残留的 `tts.app_id_credential`／`tts.cluster` 不属于当前 schema 的 72 项；核对历史引用后随迁移移除，不继续显示为 Agent Plan 可用参数。旧扁平润色键仍有兼容读取，按 CONFIG 映射、备份及清理，不能只删除控件。整份表单变量名与局部分节变量混用、麦克风读取路径不一致均需验证原始写入差异。

验收覆盖全部有效字段：从 UI 设置非默认合法值 → 保存 → 检查实际所有者持久值 → 重新加载读回 → 验证声明作用时机 → 从 UI 恢复默认；还需覆盖非法值不写入、只读环境反馈、多条目部分失败、重挂载后状态、未知字段保留和重复迁移。本轮只完成字段与入口文档核对，未新增对应测试实现或操作运行设置。
