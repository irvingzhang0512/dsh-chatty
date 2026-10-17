# 固定 Git 来源安装与版本

当前基线为Desktop／官方五包0.2.1-rc.2与chatty.1，采用本地固定提交的预构建包交付，完整SHA／内容散列在根Desktop锁；下述旧GitHub tag仍是未公开的历史候选，不能作为当前可用来源。[本版验证](DSH-UPGRADE-20261017.md)。

版本：0.2.0-rc.2+chatty.3；Desktop／Bundle／四个子包精确0.2.0-rc.2。正式tag未公开，下面是待发布安装说明。

正式 repo URL：git+https://github.com/irvingzhang0512/dsh-chatty.git#v0.2.0-rc.2+chatty.3，或发布后完整40位commit。不用浮动分支或缩写SHA。

1. 正常退出待维护的 Desktop 实例（含托盘宿主），备份其 Profile 配置／manifest／lock；先在隔离 profile 执行。
2. 使用根 tools/desktop-plugin-source.mjs --source <固定URL> --actual <实际组合JSON> 只读预检。检查清单、五包、产物和无现场构建生命周期，得到完整 commit；可传 --installed-version 检查同基线整数修订。
3. 使用安装包自带的 dsh-desktop-host CLI／pnpm 在目标 DSH_HOME 的 desktop profile 执行 plugin add <固定URL>。不要用全局 dsh 或历史 Web 安装脚本。
4. 检查插件来源／解析提交、实际版本与设置卡诊断，再启动原生窗口验收。Git 源码获取不依赖发布 tgz；官方 peers 仍由实际 profile 包管理器正确组装。
5. 更新与回退都重复预检、冷安装和来源记录；回退允许较小整数修订，跨 Bundle 基线需另准备完整固定组合。官方安装拒绝时检查 manifest／lock 恢复结果及残留下载目录，不能放宽 peer。

当前构建产物已追踪，无 prepare／install／postinstall，发布检查改为显式 release:check，没有 prepack 生命周期；实际 Git 生命周期由隔离 pnpm 验证，不能仅凭字段名推导成功。公开 URL 安装必须在发布后单列通过。

日常安装授权、发布授权不由本次隔离开发自动扩大；旧根版本锁保持原组合，新版只在独立 Desktop 候选记录。

## chatty.1 → chatty.2

官方 Bundle 与全部配置键、所有者、默认保持。本地固定 Git 升级只更换插件及已提交客户端产物；已有合法设置无需迁移。新增实际凭据文件打开依赖 Desktop 提供的 native-command／credentials-local optional peers；缺少时说明原因，其余功能继续。升级后检查分区 74＋26、问号、模型刷新及旧语音行为。日常当前仍为 chatty.1，其安装记录不是本版安装证明。

## chatty.2 → chatty.3

配置移到官方语音详情原内容下方：官方原2项＋增强74项＋折叠补充24项，三个下方所有者独立保存。Chatty自身详情仅保留跳转。升级移除组合层整个ui-voice-input禁用，改为公开槽遮蔽重复麦克风；用户显式覆盖保持，若其禁用了官方UI，先由用户核对该覆盖。100项键／默认／持久值及既有settings接口不变，无自动值迁移。日常目前已安装chatty.2，本版安装事实另记。
