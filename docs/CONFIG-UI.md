# 全配置 UI 与验收映射

版本 chatty-official-settings-20261014-v1；官方原2项＋Chatty74项＋补充官方25项，共101。下表字段键、默认、所有者保持v6；入口改为官方语音详情，具体行为见[本版契约](OFFICIAL-SETTINGS-20261014.md)。目录缓存单独存储，合法旧设置无需值迁移。

表中Chatty增强位置均移到官方详情下方的五标签；原官方底座的speech2项由上方原控件编辑，中文帮助在下方只读摘要。api2项／sensevoice23项位于底部“官方高级参数（补充）”，各自保存／弃稿／重载。增强单项 ↺ 只改草稿，保存后清除覆盖；成功只更新该所有者token，失败与其他所有者草稿保持。

每项均有中文 ⓘ：用途、默认、单位／范围、生效，关键数字说明调大／调小影响。支持悬停、聚焦、点击固定。正文14px、控件36px、分组24px；窄屏上下排列。未使用供应商、低频参数与诊断折叠，仍可编辑。

型号／音色选择保留当前值和高级手动输入。火山 TTS 额外显示型号选择，已适配项映射现有 resource_id，不增加配置键；本地固定 SenseVoiceSmall 只读目录与状态，精度由官方 precision 编辑。摘要与润色共用文本模型路由，默认跟随会话。详见 [v6 契约](SETTINGS-REDESIGN-20261013.md)。

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

官方普通字段重载需要停止语音任务，Provider ID 更名同步官方当前默认选择并备份。麦克风设备及降噪等采集约束下次开麦生效，VAD 在下一句边界生效；识别任务固定选定 Provider／语言，上限服从官方 API 与本地限制。Credentials 只保存引用和值到原生服务，不把已有密钥放入配置或回显。

本期全字段保存／读回／恢复、非法值／CAS与原生入口证据见[本版记录](VERIFICATION-0.2.0-rc.2+chatty.3.md)。

## 改版新增交互验收

切换分区／五标签、刷新目录／凭据、准备／取消本地模型不得清空草稿；两个分区分别保存。覆盖过期型号、新型号未实测、网页改版、空列表、网络／鉴权失败、取消、来源／更新时间及音色不匹配提示。凭据按钮只打开宿主确定的实际文件，客户端不能提交路径，缺文件／打开器说明原因。
