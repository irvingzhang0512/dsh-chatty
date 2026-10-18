# Chatty 架构与接口契约

chatty-official-settings-20261014-v1；目标 Chatty 0.2.1-rc.2+chatty.1、Desktop／官方五包 0.2.1-rc.2。产品规格见 [SPEC](SPEC.md)，本版挂载／状态与保存契约见 [官方详情增强](OFFICIAL-SETTINGS-20261014.md)；既有请求和迁移见 [实施契约](IMPLEMENTATION-20261013.md)。

## 数据与所有权

原生编辑器保存唯一正文、引用和 draftRev。客户端 draft-ledger 只保留可靠区间和自身编辑记录，不维护可回写的 Voice Draft 全文。配置沿四个所有者保存；Credentials 保存密钥；SenseVoice 保存模型与准备任务；Chatty 保存配置备份及独立的模型目录缓存，不写音频正文到诊断日志。

完整句 WAV → 官方 speechController → 具名 Provider；火山真实流式另走 Chatty start／events／push／stop／cancel → async WebSocket。事件带录音代次、句标识、序号，partial 与 final 分离；断连／超时没有 final 则失败，不能换 Provider。

## 模块

| 模块 | 职责 |
|---|---|
| lib/index.js | 唯一宿主值导入入口、官方服务注册、路由、真实挂载版本、工具、回复事件 |
| config.js／native-settings.js | schema、字段展开、所有者 CAS、合法值、迁移备份和事务回滚 |
| compatibility.js／compatibility.json | 精确组合与整数修订规则 |
| stream-session.js | 有界流式身份、分片重放、最终结果与释放 |
| draft-ledger.js | 公开 inputActions CAS、区间重定位和安全删除／替换 |
| client-src/40／45／50 | 采集分句、按录音顺序结果处理、口令与草稿操作 |
| pipeline.js／speech/／tts/／client-src/55 | 规则渲染、可选模型摘要、合成和代次取消 |
| client-src/60／70／90 | 原有按钮、dock、五标签设置和公开槽注册 |

客户端通过 Desktop 注册的相对 Host 路由 fetch；SSE 使用 fetch reader，兼容 dsh-app 协议。写请求要求回环调用和明确可信 Origin，不能凭回环放行恶意站点。流式鉴权头只由宿主发出。

普通官方参数经公开 configEditor.edit 验证、持久化和 Loader reconcile，偏好经官方所有者的 volatile 配置编辑保存。配置不是往第二个插件字段复制。配置重载后动态取得 speechController；本地 ID 更名同时更新当前官方默认引用，并以备份事务保护两项。

当前输入、会话模型选择及最新助手消息分别使用公开 useInput/inputActions、sessionProjections.modelSelection、Session.deriveMessages。禁止私有编辑器、同步已废弃事件快照和整份草稿回写。

旧 voice-draft／composer-text／pseudo-stream 模块仅保留离线历史用例，不进入新版生产识别或编辑器链路。旧语音对话接口明确延期，不承接自动提交。

## v6 设置与目录接缝

[配置改版契约](SETTINGS-REDESIGN-20261013.md) 定义新增路由。`settings-presentation.js` 为所有字段添加中文分组与帮助；`model-catalog.js` 解析官方正文／字段并按用途缓存；`credential-file.js` 只打开宿主确定的当前本地凭据文件。宿主值导入仍仅在 index.js，文件动作 optional peers 惰性加载，客户端无 Node／宿主值导入。

`client-src/70-settings.js` 管理四个所有者的独立草稿与 CAS，`71-settings-controls.js` 使用原生 SegmentedTabs／Button／Switch／Tooltip，搜索目录、状态、来源和自定义值。打开卡片只读缓存与提供者元数据；LLM listModels 可能执行远端发现，只有点击刷新时才调用。成功保存只推进该所有者 token；刷新目录、本地准备或凭据状态不调用全表重载。

v3 在 plugins.detail.section 追加唯一表单，官方原2项不由该表单编辑；chatty／api／sensevoice独立控件／保存／弃稿。72-official-integration 管理公开语音状态流、activity优先级遮蔽与生命周期；自身配置卡改为公开 pluginNavigation 跳转。


## 2026-10-18 统一展示与套件交付契约

依据用户已确认的 office-suite-implementation-20261018-v1。Irving · 语音增强／Irving · Voice Enhancement，包 @irvingzhang0512/dsh-chatty 统一 0.2.1-rc.2+rev.1。展示资源通过 locale 导出提供；原条目 id、服务／工具／客户端身份、配置及存储保持。本插件保持独立安装。版本按完整字符串与固定散列核对；本节不授权原先待确认的业务扩展。
