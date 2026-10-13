# 配置契约

chatty-settings-redesign-20261013-v6；当前包 0.2.0-rc.2+chatty.2。全部有效字段、类型、默认、控件及生效见 [CONFIG-UI](CONFIG-UI.md)。配置依据来自目标官方 schema 和 Chatty [lib/config.js](../lib/config.js)，原始需求不作为当前字段表。

| 所有者 | 字段数 | 保存／生效 |
|---|---:|---|
| 官方 speech-to-text | 2 | 当前 Provider／语言，同一原所有者，下一句读取 |
| 官方 api-speech-to-text | 2 | 公共 configEditor，停止任务后重载 |
| 官方 speech-to-text-sensevoice | 22 | 原配置、模型缓存／生命周期，停止任务后重载 |
| Chatty | 74 | 根 volatile schema，增强参数下一任务；设备采集参数下次开麦 |

Root schema 的 volatile 只为正常动态配置提供生命周期，旧值启动容忍并不代表合法保存。新保存走严格目标 schema、端点／口令校验；运行前若迁移或非法值未解决，增强不能启动。

云端识别字段在 stt.providers.volcano／siliconflow；TTS 字段在 tts.providers.*。官方 Provider／语言不再保存 Chatty 副本。运行 status 的 stt.provider／language 是官方选择投影，不是持久字段。火山 TTS 型号选择映射到现有资源 ID，不新增 model 持久键；已适配豆包合成 2.0，其余新型号提示需适配；硅基流动没有流式 URL 或资源 ID。

Credentials UI 只显示引用及配置状态，设置／删除调用 DSH Credentials，不返回原密钥；旧引用拼写兼容归一化。端点禁止含用户名、密码或查询参数；远端要求 HTTPS／WSS，本机测试允许回环 HTTP／WS。

每次保存携带实际 entryId 和 raw+inherited 摘要 token。未列字段和表达式注入拒绝；并发修改要求重新加载；成功刷新 token，失败值保持。默认操作 unset 显式覆盖，恢复当前组装继承值，而非覆盖全部配置或清除未知字段。

迁移先预览／冲突选择／备份；官方已有偏好冲突默认需要显式选择。未知值保留，恢复检查当前值等于迁移后的值。备份含原文件快照和逐条 before/after／事务状态；部分失败不隐藏回滚冲突。详见 [迁移表](CONFIG-LEGACY.md)。

摘要与润色共享模型路由参数，两个启用开关独立。官方偏好表单调用原条目的公共 configEditor，按官方 volatile 语义及服务语言目录校验；没有第二套偏好。

## v6 草稿与缓存边界

增强／官方分区分别保存，字段 reset 仍为 unset，但保存前只变更草稿。明确确认弃稿后只重载当前分区，其余分区保留。模型／音色刷新和凭据保存不更改字段、revision 或推理状态。本版 100 项键名、默认与所有者未改，合法持久设置无需自动迁移；历史 v1 迁移入口保留。缓存不写入 settings，见 [目录契约](SETTINGS-REDESIGN-20261013.md)。
