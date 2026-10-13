# Desktop 开发与调试

从维护根目录开始，读取根 AGENTS、开发 Skill、[Desktop 调试说明](../../docs/DESKTOP-DEVELOPMENT.md)，再进入独立 Chatty 仓库。默认只用 Desktop；不恢复历史 Web 开发服务。

## 离线检查

使用目标 Desktop 同版 peers，执行 node scripts/link-peer-deps.mjs --from <同版 node_modules>；自动探测只供历史维护，不用旧全局安装凑验收。宿主测试必须加载这些精确 peers，不跳过。

`npm test` 重建客户端并运行 Node 测试；`npm run lint` 检查宿主、测试和片段；`npm run build:client` 显式更新已提交 lib/client.js。零新增第三方运行时依赖；Git 正常安装没有 prepare／install 构建。

## 隔离运行

根 tools/desktop-dev.mjs prepare 必须传实际 Desktop executable、同版 peers 和插件目录。隔离 home、data、desktop profile、workspace、logs、source；原生另分 electron-user-data。先 host 检查服务／路由／配置，再 stop 并 start --surface native 检查 dsh-app 页面和设备。

客户端修改需构建后同步副本／重载窗口；Host 改动需正常停止、prepare、重启隔离实例。工具核对创建时间、命令行和路径，仅管理自己的 PID；原生关闭采用正常 Browser.close，若仍驻留则使用该实例托盘退出。日常实例和承载 Agent 环境保持。

Host 使用安装包 Electron Node carrier，插件 CLI 和 pnpm 使用安装包内版本；原生调试端口绑定回环。不要把 ~/.dsh 或日常数据复制进 fixture，也不输出 Cookie、认证 URL、密钥或录音正文到日志。

## 验收与发布

把离线、真实 carrier、原生输入、真实本地、真人设备、真实云端和固定 Git 验证分开写入 [验收记录](VERIFICATION-0.2.0-rc.2+chatty.2.md)。合成音频只证明对应链路，不替代真人测试。

源代码、lib/client.js、compatibility.json 与 docs 独立中文提交；根候选记录完整 SHA，要求新 Desktop 的提交不能混入旧核心锁。公开推送／创建正式 tag、GitHub 首装验收及日常替换在可审阅成果后取得授权。

## 配置改版调试

v6 的两个文件动作 peer 为精确 0.2.0-rc.2 optional；仅 index.js 惰性引用。目录抓取／密钥解析都在宿主，打开设置不联网，手动刷新才读取目录；默认会话供应商经公开 modelSelection 取得。测试目录独立于配置，绝不复制日常凭据。原生 surface 必须显示窗口，host carrier 可隐藏；外部编辑器／登录浏览器不归隔离工具退出管理。
