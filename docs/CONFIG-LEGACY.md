# 旧配置迁移与引用处理

native-voice-enhancement-20261013-v5。迁移入口在高级标签，启动不自动写配置；检测遗留字段时禁止增强启动，诊断仍可打开。备份位于 DSH_HOME/chatty/configuration-backups，恢复不可覆盖并发改动。

| 旧字段 | 新归属／处理 |
|---|---|
| stt.provider／language | 映射到官方 defaultProvider／language；zh-CN → zh，en-US → en；冲突逐项选择 |
| stt.model／credential／base_url／resource_id | 按旧 Provider 分流到 stt.providers.*；不支持字段确认清理 |
| stt.stream_url | 旧火山 nostream 地址迁到 batch_url，async 地址保留实时用途；自定义地址单独选择用途和已存新地址的冲突 |
| tts.model／voice／credential／stream_url／resource_id | 按旧 Provider 分流；火山不使用 model，硅基流动不使用 resource_id，清除占位 |
| stt.continuous_listening | stt.auto_start；旧 true 必须选择是否自动开麦，默认关闭 |
| ui.show_partial 与 stt.partial_preview | 合并为后者；任一显式 false 保持不预览 |
| ui.visualizer=wave | bars；真实波形延期 |
| draft.auto_send／voiceChat／tts.voice_chat | 退役清理；保留 tts.auto_read，不恢复旧模式 |
| stt.wake_word | 清理声学唤醒占位；voice_control 文字前缀保持 |
| max_audio_bytes | 显式确认采用官方 API／Provider 上限，不再保留同义字段 |
| tts.app_id_credential／cluster | 经典接口残留清理，Agent Plan 不使用 |
| polishBaseUrl／polishProvider／polishModelId／polishKeyEnv | 对应 polish.base_url／provider／model_id／key_env |

同路径新旧值冲突只能显式选保留新字段或采用旧字段；未知字段及无关设置保留。供应商不支持的参数不给有效 UI 控件，不能在兼容模式读回并继续使用。

本地 providerId 更名检查冲突，备份本地／官方偏好，当前默认选中旧 ID 时更新到新 ID；失败回滚。更名前扫描全部原始配置，其他所有者仍引用旧 ID 时拒绝并列出路径，须先由其所有者处理；本期不擅改其他插件。

生产引用检查覆盖宿主、schema、客户端片段／生成产物、导入与导出脚本。退役字段仅迁移识别列表保留，旧库离线测试不代表生产调用。原始需求只读留存。
