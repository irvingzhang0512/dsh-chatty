# 全配置 UI 对照表

文档版：`native-voice-enhancement-20261012-v2`；2026-10-12；状态：待确认／待实现。

本表承接 [PRD](PRD.md) 和 [CONFIG](CONFIG.md)。用户已明确沿用现有 Chatty 界面并将全部配置放入 UI；本表根据当前 schema、设置卡和固定 0.2.0-rc.2 官方包列出具体覆盖范围，不表示控件已补齐。现有入口来自 [70-settings.js](../lib/client-src/70-settings.js)，界面来自 [60-ui.js](../lib/client-src/60-ui.js)。

## 1. 界面与表单规则

- 保留当前设置卡的五个标签：“语音输入、语音输出、指令与草稿、界面、高级”。下表的“高级”均在同一卡内展开，不新建页面。
- 每个有效字段都有中文控件、当前值／默认值、合法值校验、保存结果、重新加载读回和恢复组装默认值。数字标明单位；可选字段提供“使用默认／自动”，不能把空串写成无效显式参数。
- Provider 不支持的字段在原组内说明禁用原因；占位或失效字段有迁移／清理归属，不假装能配置出未实现能力。未知字段保留，不因 UI 只列已知字段而覆盖整份配置。
- 官方字段读取／写入实际 Profile entry ID 的原配置，不复制一套 Chatty 值。多条目保存分别反馈结果；失败不显示整体成功、未保存值不被重置。
- 识别选择／语言影响下一次任务；录音参数影响下一次采集；润色参数影响下一次调用；播放参数按当前／下一段的精确规则在实施契约固定。本地 Provider 非 volatile 参数保存后可能需重挂载，需在本卡提供明确生效操作，进行中任务先按既定取消／收尾策略处理。
- API Key 明文不属于 Chatty 配置字段。凭据引用、配置状态与打开 DSH Credentials 的入口在当前卡中提供，密钥只在宿主解析。

## 2. 当前 Chatty 的 72 个叶子配置

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

## 3. 接入的官方配置 26 项

以下参数仍由官方三个条目持久化。Chatty 在现有卡里提供入口；不把调研版 0.2.1 的 `vadOnsetPaddingSeconds` 放进本机 0.2.0-rc.2 的有效配置。

| 条目与字段 | 中文控件／目标入口 | 生效与引用要求 |
|---|---|---|
| `speech-to-text.defaultProvider` | 识别服务／语音输入 | 与旧 stt.provider 迁移合并；下次录音选择 |
| `speech-to-text.language` | 识别语言／语音输入 | 与旧 stt.language 合并；按所选 Provider 校验 |
| `api-speech-to-text.maxAudioBytes` | 完整录音字节上限／高级·限制 | 显示单位与有效上限；保存后需服务生效 |
| `api-speech-to-text.maxDurationSeconds` | 完整录音秒数上限／高级·限制 | 与请求超时分开；保存后需服务生效 |
| `speech-to-text-sensevoice.providerId` | 本地识别注册 ID／高级·本地识别 | 改名需同时处理默认选择与全部引用 |
| `speech-to-text-sensevoice.dataRoot` | 本地缓存目录／高级·本地模型 | 文本／目录选择；重挂载生效，不能默默移动已有模型 |
| `speech-to-text-sensevoice.modelDirectory` | 外部识别模型目录／高级·本地模型 | 可清空回默认托管模式；核对资源要求 |
| `speech-to-text-sensevoice.vadModelPath` | 外部 VAD 模型文件／高级·本地模型 | 可清空回默认托管模式；核对资源要求 |
| `speech-to-text-sensevoice.precision` | int8／fp32 精度／语音输入·本地识别 | 切换涉及资源准备与 Provider 重载 |
| `speech-to-text-sensevoice.modelOrigin` | 固定模型来源／高级·模型来源 | 可选来源；清空使用来源列表策略 |
| `speech-to-text-sensevoice.modelOrigins` | 模型来源列表／高级·模型来源 | 可增删来源，保留顺序；与任务临时选源分开 |
| `speech-to-text-sensevoice.modelProbeTimeoutMs` | 来源探测超时／高级·模型来源 | 数值及单位；按上游校验 |
| `speech-to-text-sensevoice.threads` | CPU 线程／高级·本地运行 | 数值；上游不支持即时更改时提示重载 |
| `speech-to-text-sensevoice.segmentSeconds` | 本地识别分段秒数／高级·本地运行 | 与浏览器静音分句、整体音频上限区分 |
| `speech-to-text-sensevoice.vadThreshold` | 模型 VAD 阈值／高级·本地运行 | 与 Chatty 浏览器分句灵敏度区分 |
| `speech-to-text-sensevoice.minSpeechSeconds` | 模型最短人声秒数／高级·本地运行 | 数值及单位 |
| `speech-to-text-sensevoice.minSilenceSeconds` | 模型最短静音秒数／高级·本地运行 | 数值及单位 |
| `speech-to-text-sensevoice.maxAudioBytes` | 本地 Provider 音频字节上限／高级·限制 | 与 API 上限共同决定实际可接收大小，不混写 |
| `speech-to-text-sensevoice.prepareTimeoutMs` | 本地准备超时／高级·本地运行 | 与请求／推理超时区分 |
| `speech-to-text-sensevoice.inferenceTimeoutMs` | 本地推理超时／高级·本地运行 | 数值及单位 |
| `speech-to-text-sensevoice.idleTimeoutMs` | 空闲释放时间／高级·本地运行 | 支持上游允许的 0 值语义 |
| `speech-to-text-sensevoice.maxPending` | 本地排队上限／高级·本地运行 | 与浏览器扩展积压上限区分 |
| `speech-to-text-sensevoice.graceMs` | 工作进程退出宽限／高级·本地运行 | 数值及单位 |
| `speech-to-text-sensevoice.maxLogBytes` | 本地诊断日志上限／高级·本地运行 | 数值及单位，日志仍不可含密钥 |
| `speech-to-text-sensevoice.maxResponseBytes` | 工作进程响应上限／高级·本地运行 | 数值及单位 |
| `speech-to-text-sensevoice.progressIntervalMs` | 准备进度刷新间隔／高级·本地运行 | 数值及单位 |

准备状态、下载并准备、取消准备和本次下载源选择放在“语音输入”已有卡内的本地识别区域；本次下载源是任务选项，不冒充永久配置。版本／兼容状态为只读事实，展示在当前卡头部或现有高级区域，不提供手填已安装版本的控件。

## 4. 遗留字段和验证

设置卡残留的 `tts.app_id_credential`／`tts.cluster` 不属于当前 schema 的 72 项；核对历史引用后随迁移移除，不继续显示为 Agent Plan 可用参数。旧扁平润色键仍有兼容读取，按 CONFIG 映射、备份及清理，不能只删除控件。整份表单变量名与局部分节变量混用、麦克风读取路径不一致均需验证原始写入差异。

验收覆盖全部有效字段：从 UI 设置非默认合法值 → 保存 → 检查实际所有者持久值 → 重新加载读回 → 验证声明作用时机 → 从 UI 恢复默认；还需覆盖非法值不写入、只读环境反馈、多条目部分失败、重挂载后状态、未知字段保留和重复迁移。本轮只完成字段与入口文档核对，未新增对应测试实现或操作运行设置。
