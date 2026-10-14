# 官方语音详情增强契约

文档版 chatty-official-settings-20261014-v1；目标 0.2.0-rc.2+chatty.3。用户已明确实施完整同版计划；对应 SPEC F008／F012／F017，其他能力按原规格。

## 页面与字段

`plugins.detail.section` 注册 id=dsh-chatty-settings、order=50，仅 subject.kind=bundle 且 subject.pkg.name=@deepseek-ai/dsh-experimental-voice-input-bundle 时呈现。官方原 plugins.bundle.config 和成员列表均由宿主原样渲染，增强追加其后，不覆盖同 key、调用组件函数或修改官方 DOM。

下方 Chatty74项保留五标签、模型目录与凭据按钮。底部 details 默认折叠官方高级参数，api2／sensevoice22各有保存、重载／弃稿、计数与消息；官方原speech2项不再重复提供编辑控件。只读选择摘要为speech2项提供已有中文帮助。Chatty自己的 plugins.bundle.config只展示简述与“前往语音增强设置”，通过公开 pluginNavigation.openBundle导航；缺导航能力禁用跳转并说明，不影响听写。

GET/POST settings及四所有者响应不改：路径／schema／默认／继承／持久值不变。增强表单仅提交chatty／api／sensevoice，重置仍unset；各所有者保存中仅禁用自身，失败保留自己的草稿和token，不宣称整体成功。折叠、切标签、状态流和目录／凭据刷新都不重载草稿。

## 官方 UI 和状态

组合patch移除ui-voice-input整条disabled覆盖，保留用户显式覆盖。通过公开conversation.input.activity单槽注册priority=-100的空组件，仅在版本匹配、Chatty启用且原槽赢家为官方voice-input locale时遮蔽；注册占用或非官方赢家不删除／修改其条目，记录诊断。订阅槽位与Chatty状态，处理官方迟到／重载；清理时释放自有注册，不修改上游组件／inject／locale。失配时解除遮蔽并保留增强诊断。

客户端声明稳定remote容器依赖，可选注入remote.speech，按官方公开remote.$stream({open:signal=>remote.speech.follow(signal)})消费catalog并accept事件。更新全局当前Provider／语言和模型准备状态，通知只读UI；不替换drafts／changes／revisionToken、不触发目录联网／推理。已有任务保留原快照，后续句读取新选择。断连提示并保留最后状态；重新挂载清理旧流、接收新实例；卸载取消流并等待退出，迟到事件丢弃。

## 版本与验收

package及compatibility同升chatty.3，Bundle／四成员仍精确0.2.0-rc.2。配置无需值迁移；核对原组合禁用删除与用户显式覆盖保持，旧26项HTTP接口保留用于兼容和迁移。全部100路径对比、界面可达、逐项保存／读回／恢复、跨所有者失败／CAS、官方即时偏好与增强草稿并行、高级折叠、原生主题／尺寸、槽遮蔽恢复和状态流取消均验证。真人／云端和公网Git安装单列未验，不由本次入口调整推导通过；日常仍为chatty.2直至该版另有安装授权。
