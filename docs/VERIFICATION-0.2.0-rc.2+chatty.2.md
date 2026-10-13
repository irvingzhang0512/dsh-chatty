# 0.2.0-rc.2+chatty.2 验证记录

2026-10-14；对应用户明确确认的 v6 计划，Desktop／官方 Bundle 及四子包均 0.2.0-rc.2。日常仍安装 chatty.1；本记录只覆盖独立 development fixture。当前规格见 [SPEC](SPEC.md)，目录与文件动作见 [技术契约](SETTINGS-REDESIGN-20261013.md)。

## 离线与构建

- npm test：206 项通过，0 失败、0 跳过。宿主检查实际加载目标精确 peers。新增模型正文／枚举解析、100 字段帮助、默认会话供应商、非刷新不联网、缓存／改版／空目录／取消、用途交叉分类、凭据目标约束、系统音色合并与失败保留。
- npm run lint：30 个宿主模块通过；客户端12片段＋3内联纯模块生成并追踪，正常安装无现场编译生命周期。
- 配置仍74＋26，键、默认及所有者保持；新增目录缓存与配置存储分开。原始 REQUIREMENTS 保持。

## 实际 Desktop 运行时与原生界面

专用 DSH_HOME／数据／desktop profile／Electron userData，先实际安装包 carrier，后 dsh-app://app 原生窗口；没有复制日常语音密钥。测试临时插件只使用公开输入动作与官方 speechToText 注册表，结束正常退出。

| 项目 | 结果／证据 |
|---|---|
| 全字段 | 原生路由逐项非默认保存、读回、过期 token 拒绝、unset 默认读回；100/100通过，非法宽度拒绝、测试凭据引用设置／读状态／删除通过。settings2-matrix-evidence.json |
| 分区草稿 | Chatty 宽度851跨分区、目录刷新及凭据保存保留；官方语言zh跨 Chatty 保存保留。强制 speech CAS 失败时 API 独立成功，失败草稿仍zh。settings2-native-evidence.json |
| 重置／弃稿 | 重置仅变草稿，运行值不变；取消确认保留851，确认弃稿只重载当前分区，另一分区语言zh保留。settings2-interaction-evidence.json |
| 标签与帮助 | 五标签、原生箭头／Home键切换与焦点通过；问号真实鼠标悬停、Tab／Shift-Tab聚焦和点击固定通过，包含用途、默认1200毫秒、100至10000与下一句。settings2-help-keyboard-hover.json |
| 主题／尺寸 | 原生渲染器浅／深主题及1280／600宽viewport；两列／单列，无横向溢出，14px、36px控件。宽窄使用调试viewport模拟；没有声称实测改变系统窗口尺寸。settings2-native-visual.json及三张原生截图 |
| 凭据文件 | 默认实际 .credentials.yaml 与自定义 custom-chatty.credentials.yaml 均GET正确目标、POST原生打开成功；客户端路径拒绝与缺文件／非本地／取消离线覆盖。不读回正文到页面。settings2-credential-open.json、settings2-custom-credential-open.json |
| 连续听写 | 合成媒体＋官方测试Provider：手写前缀保留、三句按序一次插入；明确发送后为空，第四句只有第四句。settings2-dictation-evidence.json |
| 草稿／终态 | 手改后迟到结果留待插入、原正文保留；润色后撤销为空，取消和切会话后的旧结果丢弃；官方录音按钮停用。settings2-boundary-evidence.json |

证据文件与裁切后的实际界面截图保存在根 .local/desktop-chatty-020，包含临时运行信息，不提交公开插件。首次自动化选错列表元素、窗口隐藏或启动未就绪的失败未算通过；最终结果以上述记录为准。程序化焦点在指针模式下不打开原生 Tooltip，随后通过真实键盘 Tab／Shift-Tab验证键盘路径。

## 真实目录来源

用户显式刷新读取火山公开正文与硅基 ASR／TTS 文档成功，确定性解析，不执行脚本、不调用大模型。读取到豆包识别／合成2.0，SenseVoiceSmall、TeleSpeechASR、CosyVoice2及MOSS-TTSD；新增型号显示未实测。硅基账户模型 API／远端音色因独立 fixture 无语音凭据展示原因，保持文档／缓存／静态目录。DSH 供应商元数据与缓存可读，发现服务及自定义端点通过注入测试验证；真实供应商目录鉴权仍需该环境配置。证据 settings2-host-evidence.json。

## 固定 Git 与分发

运行产物、bundle、真实 repository、精确官方 peers已核对；可选 native-command／credentials-local 仅服务实际文件动作。最终干净提交、固定本地 Git 安装、实际加载版本／100字段和精确SHA以根 [Desktop候选](../../inventory/versions.chatty-desktop.lock.json) 及本次维护记录为准；它们是隔离本地来源证据。未来公网 tag为v0.2.0-rc.2+chatty.2，未推送／发布前不能用于安装。旧核心正式锁保持。

## 尚未完成的真实验收

真人连续语音、真实云端 ASR／TTS、真实远端模型／自定义音色鉴权、新型号协议适配和扬声器／耳机打断未由本版离线／模拟结果替代。既有 chatty.1 的真实本地推理与设备记录仅保留历史，本版没有重跑。公开GitHub固定URL与日常升级尚未执行，不填写全组合 verifiedWith。
