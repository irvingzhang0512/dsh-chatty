# 全配置 UI 与验收映射

版本 native-voice-enhancement-20261013-v5；当前官方 26 项＋Chatty 74 项，共 100。来自实际 Desktop 0.2.0-rc.2 的四个配置所有者，记录控件、保存所有者、生效时机和逐项验收。UI 使用实时 schema，不复制维护上游默认；表中未指定表示继承／可选。

现有五标签保留。每项旁边“默认”清除显式覆盖；保存按所有者逐项反馈，重新加载读回全部值。模型准备／取消、麦克风测试、试听、凭据原生管理、迁移预览和备份恢复仍在当前卡。不可用能力不提供占位控件。

| 保存所有者 | 字段 | 控件／标签 | schema 或组装默认 | 生效 | 验收 |
|---|---|---|---|---|---|
| chatty | `stt.providers.volcano.model` | 文本／可选文本／语音输入 | "doubao-seed-asr-2.0" | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `stt.providers.volcano.credential` | 文本／可选文本／语音输入 | "VOLCENGINE_AGENT_PLAN_API_KEY" | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `stt.providers.volcano.batch_url` | 文本／可选文本／高级 | "wss://openspeech.bytedance.com/api/v3/plan/sauc/bigmodel_nostream" | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `stt.providers.volcano.stream_url` | 文本／可选文本／高级 | "wss://openspeech.bytedance.com/api/v3/plan/sauc/bigmodel_async" | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `stt.providers.volcano.resource_id` | 文本／可选文本／高级 | "volc.seedasr.sauc.duration" | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `stt.providers.siliconflow.model` | 文本／可选文本／语音输入 | "FunAudioLLM/SenseVoiceSmall" | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `stt.providers.siliconflow.credential` | 文本／可选文本／语音输入 | "SILICONFLOW_API_KEY" | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `stt.providers.siliconflow.base_url` | 文本／可选文本／高级 | "https://api.siliconflow.cn/v1" | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `stt.max_segment_seconds` | 数字／高级 | 30 | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `stt.max_pending` | 数字／高级 | 4 | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `stt.stream_idle_timeout_ms` | 数字／高级 | 15000 | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `stt.streaming` | 开关／语音输入 | true | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `stt.auto_start` | 开关／语音输入 | false | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `stt.partial_preview` | 开关／语音输入 | true | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `stt.vad.enabled` | 开关／语音输入 | true | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `stt.vad.sensitivity` | 数字／语音输入 | 0.6 | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `stt.vad.silence_timeout_ms` | 数字／语音输入 | 1200 | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `stt.vad.min_speech_ms` | 数字／语音输入 | 200 | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `stt.vad.pre_roll_ms` | 数字／语音输入 | 400 | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `tts.provider` | 选择／语音输出 | "volcano" | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `tts.providers.volcano.voice` | 文本／可选文本／语音输出 | "zh_female_shuangkuaisisi_uranus_bigtts" | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `tts.providers.volcano.credential` | 文本／可选文本／语音输出 | "VOLCENGINE_AGENT_PLAN_API_KEY" | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `tts.providers.volcano.base_url` | 文本／可选文本／高级 | "https://openspeech.bytedance.com/api/v3/plan/tts/unidirectional" | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `tts.providers.volcano.resource_id` | 文本／可选文本／高级 | "seed-tts-2.0" | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `tts.providers.siliconflow.model` | 文本／可选文本／语音输出 | "FunAudioLLM/CosyVoice2-0.5B" | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `tts.providers.siliconflow.voice` | 文本／可选文本／语音输出 | "FunAudioLLM/CosyVoice2-0.5B:alex" | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `tts.providers.siliconflow.credential` | 文本／可选文本／语音输出 | "SILICONFLOW_API_KEY" | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `tts.providers.siliconflow.base_url` | 文本／可选文本／高级 | "https://api.siliconflow.cn/v1" | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `tts.speed` | 数字／语音输出 | 1 | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `tts.format` | 选择／语音输出 | "pcm" | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `tts.sample_rate` | 选择／高级 | 24000 | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `tts.volume` | 数字／语音输出 | 1 | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `tts.auto_read` | 开关／语音输出 | false | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `tts.interrupt_on_speech` | 开关／语音输出 | true | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `tts.code_hint` | 开关／语音输出 | true | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `tts.llm_summary` | 开关／语音输出 | false | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `tts.summary_prompt` | 文本／可选文本／语音输出 | "" | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `tts.max_chars` | 数字／高级 | 4000 | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `tts.renderer.paragraph` | 选择／语音输出 | "read" | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `tts.renderer.heading` | 选择／语音输出 | "read" | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `tts.renderer.list` | 选择／语音输出 | "smart" | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `tts.renderer.table` | 选择／语音输出 | "summarize" | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `tts.renderer.code_block` | 选择／语音输出 | "skip" | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `tts.renderer.inline_code` | 选择／语音输出 | "smart" | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `tts.renderer.mermaid` | 选择／语音输出 | "skip" | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `tts.renderer.ascii_diagram` | 选择／语音输出 | "skip" | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `tts.renderer.url` | 选择／高级 | "label_only" | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `tts.renderer.image` | 选择／语音输出 | "skip" | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `tts.renderer.math_block` | 选择／语音输出 | "skip" | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `tts.renderer.tool_log` | 选择／语音输出 | "skip" | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `tts.renderer.blockquote` | 选择／语音输出 | "read" | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `voice_control.enabled` | 开关／指令与草稿 | true | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `voice_control.command_mode` | 选择／指令与草稿 | "exact" | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `voice_control.wake_prefix` | 文本／可选文本／指令与草稿 | "DSH" | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `voice_control.wake_words` | 逐行列表／指令与草稿 | [] | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `voice_control.commands` | 七动作逐行词表／指令与草稿 | {"send":["发送","提交","发送消息","send","submit"],"undo":["撤销","重说","撤回","undo"],"clear":["清空","清除","clear"],"polish":["润色","整理一下","polish"],"stop_listening":["停止录音","停止监听","结束监听","stop listening"],"read":["朗读","读一下","read"],"stop_reading":["停止朗读","别读了","stop reading"]} | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `draft.max_utterances` | 数字／指令与草稿 | 200 | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `draft.separator` | 文本／可选文本／指令与草稿 | "\n" | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `draft.polish_on_command` | 开关／指令与草稿 | true | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `polish.enabled` | 开关／指令与草稿 | true | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `polish.prompt` | 文本／可选文本／高级 | "" | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `polish.provider` | 文本／可选文本／高级 | "" | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `polish.model_id` | 文本／可选文本／高级 | "" | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `polish.base_url` | 文本／可选文本／高级 | "" | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `polish.key_env` | 文本／可选文本／高级 | "" | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `ui.show_voice_bar` | 开关／界面 | true | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `ui.show_draft_panel` | 开关／界面 | true | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `ui.visualizer` | 选择／界面 | "bars" | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `ui.panel_width` | 数字／界面 | 720 | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `timeout_ms` | 数字／高级 | 120000 | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `mic_device_id` | 设备选择／语音输入 | "" | 下次任务（下次开麦） | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `noise_suppression` | 开关／语音输入 | true | 下次任务（下次开麦） | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `echo_cancellation` | 开关／语音输入 | true | 下次任务（下次开麦） | 非默认保存、刷新读回、恢复、并发拒绝 |
| chatty | `auto_gain_control` | 开关／语音输入 | true | 下次任务（下次开麦） | 非默认保存、刷新读回、恢复、并发拒绝 |
| speech | `defaultProvider` | 选择／语音输入 | "sensevoice-local" | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| speech | `language` | 选择／语音输入 | "auto" | 下次任务 | 非默认保存、刷新读回、恢复、并发拒绝 |
| api | `maxAudioBytes` | 数字／高级 | 4194304 | 重载所有者 | 非默认保存、刷新读回、恢复、并发拒绝 |
| api | `maxDurationSeconds` | 数字／高级 | 120 | 重载所有者 | 非默认保存、刷新读回、恢复、并发拒绝 |
| sensevoice | `providerId` | 文本／可选文本／高级 | "sensevoice-local" | 重载所有者 | 非默认保存、刷新读回、恢复、并发拒绝 |
| sensevoice | `dataRoot` | 文本／可选文本／高级 | 组装时 DSH_HOME/speech-to-text/sensevoice | 重载所有者 | 非默认保存、刷新读回、恢复、并发拒绝 |
| sensevoice | `modelDirectory` | 文本／可选文本／高级 | 未指定 | 重载所有者 | 非默认保存、刷新读回、恢复、并发拒绝 |
| sensevoice | `vadModelPath` | 文本／可选文本／高级 | 未指定 | 重载所有者 | 非默认保存、刷新读回、恢复、并发拒绝 |
| sensevoice | `precision` | 选择／高级 | "int8" | 重载所有者 | 非默认保存、刷新读回、恢复、并发拒绝 |
| sensevoice | `modelOrigin` | 文本／可选文本／高级 | 未指定 | 重载所有者 | 非默认保存、刷新读回、恢复、并发拒绝 |
| sensevoice | `modelOrigins` | 逐行列表／高级 | ["https://huggingface.co","https://hf-mirror.com"] | 重载所有者 | 非默认保存、刷新读回、恢复、并发拒绝 |
| sensevoice | `modelProbeTimeoutMs` | 数字／高级 | 3000 | 重载所有者 | 非默认保存、刷新读回、恢复、并发拒绝 |
| sensevoice | `threads` | 数字／高级 | 2 | 重载所有者 | 非默认保存、刷新读回、恢复、并发拒绝 |
| sensevoice | `segmentSeconds` | 数字／高级 | 30 | 重载所有者 | 非默认保存、刷新读回、恢复、并发拒绝 |
| sensevoice | `vadThreshold` | 数字／高级 | 0.5 | 重载所有者 | 非默认保存、刷新读回、恢复、并发拒绝 |
| sensevoice | `minSpeechSeconds` | 数字／高级 | 0.25 | 重载所有者 | 非默认保存、刷新读回、恢复、并发拒绝 |
| sensevoice | `minSilenceSeconds` | 数字／高级 | 0.5 | 重载所有者 | 非默认保存、刷新读回、恢复、并发拒绝 |
| sensevoice | `maxAudioBytes` | 数字／高级 | 4194304 | 重载所有者 | 非默认保存、刷新读回、恢复、并发拒绝 |
| sensevoice | `prepareTimeoutMs` | 数字／高级 | 3600000 | 重载所有者 | 非默认保存、刷新读回、恢复、并发拒绝 |
| sensevoice | `inferenceTimeoutMs` | 数字／高级 | 120000 | 重载所有者 | 非默认保存、刷新读回、恢复、并发拒绝 |
| sensevoice | `idleTimeoutMs` | 数字／高级 | 300000 | 重载所有者 | 非默认保存、刷新读回、恢复、并发拒绝 |
| sensevoice | `maxPending` | 数字／高级 | 4 | 重载所有者 | 非默认保存、刷新读回、恢复、并发拒绝 |
| sensevoice | `graceMs` | 数字／高级 | 1000 | 重载所有者 | 非默认保存、刷新读回、恢复、并发拒绝 |
| sensevoice | `maxLogBytes` | 数字／高级 | 65536 | 重载所有者 | 非默认保存、刷新读回、恢复、并发拒绝 |
| sensevoice | `maxResponseBytes` | 数字／高级 | 131072 | 重载所有者 | 非默认保存、刷新读回、恢复、并发拒绝 |
| sensevoice | `progressIntervalMs` | 数字／高级 | 100 | 重载所有者 | 非默认保存、刷新读回、恢复、并发拒绝 |

官方普通字段重载需要停止语音任务，Provider ID 更名同步官方当前默认选择并备份。麦克风设备及降噪等采集约束下次开麦生效，VAD 在下一句边界生效；识别任务固定选定 Provider／语言，上限服从官方 API 与本地限制。Credentials 只保存引用和值到原生服务，不把已有密钥放入配置或回显。

本期全字段实际非默认保存／读回／默认恢复与非法值／CAS 验收见 [验证记录](VERIFICATION-0.2.0-rc.2+chatty.1.md)。
