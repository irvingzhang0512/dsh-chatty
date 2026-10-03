# AGENTS.md — 本仓库协作约定

## 开发入口与文档分工

先返回根维护目录，读取 [根 AGENTS](../AGENTS.md)、[维护规范](../docs/MAINTENANCE.md) 和开发 Skill；本仓库的特殊约束仍适用。统一流程见 [文档驱动开发](../docs/DOC-DRIVEN-DEVELOPMENT.md)，当前可编辑规格见 [docs/SPEC.md](docs/SPEC.md)。

- 功能新增／修改：读取规格及其差异，先改预期和验收条件，涉及接口／配置／存储时先同步技术契约；用户确认该版文档后再改源码并验证。自然语言需求也先落入规格。
- 文档确认：将修改后的规格／相关技术契约的链接、功能编号、行为差异与验收条件交用户审阅，等待明确确认该版文档后才能改对应源码／测试实现或运行配置；确认前可读源码、查日志／已有测试、完善文档。用户已明确要求按同一版文档实现且含义未再改变时直接继续，不重复询问；仅提出需求、保存／提交文档或沉默不算确认。确认后新增语义差异先重新确认，记录确认范围与文档依据。
- Bug：按已有预期复现并直接查看源码、日志和测试，修复回归；预期未变无需改规格，遗漏／歧义补规格，产品规则变化部分按功能流程。不得改规格把 Bug 解释为正确行为。
- 原始需求保持只读历史来源；实现状态和验证结果分开记录，冲突保留证据并标待确认。README 是入口，架构／配置／接口文档维护技术契约。
- 纯文档任务检查编号、状态、链接与源码／测试引用，记录未执行的验证；无需运行下面的代码测试／构建或重装。代码改动仍遵循本仓库验证要求。
- 纯文档变更不提高包版本，独立中文 Angular docs 提交，保持当前实际分支；根仓库同步完整提交锁。安装快照由脚本检查，未变保留，不自动推送。


> 本文件约束在本仓库（`dsh-chatty`，包名 `@irvingzhang0512/dsh-chatty`）内工作的 AI Agent 与人类贡献者的行为约定。
> 建议阅读顺序：根维护约定 → 本文件 → `docs/SPEC.md`（当前行为）→ `docs/ARCHITECTURE.md`（技术契约）→ `docs/DEVELOPMENT.md`。

---

## 1. 交流语言：中文

- 本仓库默认**用中文交流**：对话、issue、PR、评审意见、文档一律中文。
- 代码标识符、`type` / `scope` 保持英文；注释建议中文，便于长期维护。
- 面向用户的文案（Voice Bar 状态、设置卡标签、错误提示）默认中文。

## 2. 提交规范：Angular（Conventional Commits）

所有 commit message 遵循 **Angular / Conventional Commits** 规范：

```text
<type>(<scope>): <subject>
<空行>
<body>              # 可选：动机与影响
<空行>
<footer>            # 可选：BREAKING CHANGE: / 关联 issue 等
```

- `type`（**小写英文**）：`feat` / `fix` / `docs` / `style` / `refactor` / `perf` / `test` / `build` / `ci` / `chore` / `revert`
- `scope`（可选，小写英文，影响模块）：如 `stt` / `tts` / `speech` / `draft` / `command` / `client` / `pipeline` / `config` / `docs` / `release`
- `subject`：**用中文**简要描述，祈使句、尽量 ≤50 字符
- 破坏性变更：`type(scope)!:`，或在 footer 写 `BREAKING CHANGE: ...`

示例：

```text
feat(stt): 支持火山流式识别自动重连
fix(speech): 表格未闭合时不再提前入队
feat(command): 唤醒模式下要求前缀后无剩余内容
refactor(client): 拆分 Voice Bar 与 Draft 面板片段
test(draft): 补充 replaceAll 与撤销交错用例
docs(config): 补全 VAD 默认值说明
chore(release): v0.1.0
feat(config)!: 变更 stt.vad 字段名
```

## 3. 开发红线

1. **不引入运行时依赖**：`lib/*.js`、`lib/stt/`、`lib/tts/`、`lib/speech/` 只能 import 本地文件与 Node 内置模块；测试运行路径上**禁止** import `@deepseek-ai/*`（peer 依赖可能未安装）。只有 `lib/index.js` 允许 import `@deepseek-ai/schemastery`、`@deepseek-ai/dsh-tools`、`@deepseek-ai/dsh-credentials`、`@deepseek-ai/dsh-llm`。浏览器半边只能 `require('react')` 与可选的 `@deepseek-ai/dsh-client-ui-primitives`。
2. **密钥不下发浏览器**：API Key 只在宿主半边经 `ctx.credentials` 按 credential 引用名解析；插件配置只存引用名（规范形式 `VOLCANO_SPEECH` / `VOLCANO_SPEECH_APPID` / `SILICONFLOW`，写 `volcano-speech` 会被 `lib/credential-name.js` 归一化），禁止明文写入任何配置文件、日志或 HTTP 响应。
3. **`lib/client-src/` 片段不得使用 `import` / `export`**：片段按文件名排序拼接成 `lib/client.js`，共享同一个 `factory` 作用域，用 `const` / `function` 声明；变量名不得与其它片段冲突。改片段后必须重新构建。
4. **契约以 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) 为准**：导出名、参数形状、HTTP 路径与响应结构不得随手改动；确需变更时先改契约文档再改代码，并在 `docs/CHANGELOG.md` 说明。
5. **改代码必须 `npm test` 全绿**，并在 `docs/CHANGELOG.md` 的 `[Unreleased]` 下记一条。
6. **包名不可改**：`@irvingzhang0512/dsh-chatty` 同时被 `cordis.patch.yml`、`package.json` 的 `dsh.bundle` 与 `lib/client-src/00-open.js` 的 loader id 依赖，改成短名会导致浏览器半边静默失效。
7. **不承诺未实现的能力**：文档与 UI 中出现的能力必须要么已实现，要么显式标注「V1 暂不实现」。

## 4. 常用命令

```bash
npm test                                    # 重建 lib/client.js 并运行 node --test 单测
npm run build:client                        # 仅重新生成 lib/client.js
npm run lint                                # ESM 语法检查 + 片段/生成物结构检查
dsh plugin --profile web add <本仓库路径>    # 本地安装到 DSH Web（以本地 DSH 版本为准）
dsh web                                     # 启动 DSH Web 实测（刷新浏览器后生效）
```

单测无需 `npm install`：本仓库没有运行时依赖，测试全部离线（假 `fetchImpl` / `WebSocketImpl`）。

## 5. 改动流程

1. 按上面的功能／Bug 入口确认已有预期；功能先改 SPEC、验收及技术契约，提供文档给用户明确确认后再进入第 2 步；读 `docs/ARCHITECTURE.md` 对应小节，必要时同步契约文档。已确认同一版不重复询问；
2. 改 `lib/` / `lib/client-src/` / `test/`，运行 `npm run build:client`（改片段时）与 `npm test`，必须全绿；
3. `npm run lint` 通过；
4. 在 `docs/CHANGELOG.md` 的 `[Unreleased]` 记一条（Added / Changed / Fixed / Removed）；
5. 按第 2 节 Angular 规范提交；
6. 需要实测时 `dsh plugin --profile web add <本仓库路径>` 后重启 `dsh web` 并刷新浏览器，在 Network 面板确认 `/dsh-chatty/*` 请求。

> 不要改动 `docs/REQUIREMENTS.md`：它是需求来源，只能由维护者主动更新。`lib/client.js` 是生成物但**需要提交**，不要手改。
