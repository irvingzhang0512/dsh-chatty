# dsh-chatty 开发说明

当前预期与验收见 [SPEC.md](SPEC.md)，功能先改规格与相关技术契约，Bug 保持已有预期直接修源码；混合任务、冲突与不可用环境的收尾见 [根开发流程](../../docs/DOC-DRIVEN-DEVELOPMENT.md)。以下测试／构建步骤适用于代码修改，纯文档任务执行引用和状态检查即可。


> 面向本仓库的日常开发。实现契约见 [`ARCHITECTURE.md`](./ARCHITECTURE.md)，配置字段见 [`CONFIG.md`](./CONFIG.md)，设计动机见 [`DESIGN.md`](./DESIGN.md)。
> 协作约定（提交规范、红线）见 [`../AGENTS.md`](../AGENTS.md)。

---

## 1. 环境要求

- **Node.js 20+**（`node --test` 与 `--check` 的行为依赖 20 起的版本）。
- 纯 ESM：`package.json` 的 `"type": "module"`，所有相对 import 必须带 `.js` 扩展名。
- 实测需要可执行的 `dsh`（安装到 web profile 后重启 `dsh web`）。
- 浏览器半边的麦克风采集需要安全上下文：`http://127.0.0.1:3080` / `localhost` 满足条件，局域网 IP 访问时浏览器会拒绝 `getUserMedia`。

## 2. 为什么无需 `npm install` 就能跑单测

1. **没有任何运行时依赖**：`package.json` 只有 `peerDependencies`（`@deepseek-ai/*`、`schemastery`），没有 `dependencies` / `devDependencies`，所以不装 `node_modules` 也能加载 `lib/` 与 `test/`。
2. **宿主模块只 import 本地文件与 Node 内置模块**：`lib/*.js`、`lib/stt/`、`lib/tts/`、`lib/speech/` 不碰 `@deepseek-ai/*`；peer 依赖可能未安装，因此**禁止**让它们出现在测试运行路径上。
3. **唯一例外是 `lib/index.js`**：它允许 import `@deepseek-ai/schemastery`、`@deepseek-ai/dsh-tools`、`@deepseek-ai/dsh-credentials`、`@deepseek-ai/dsh-llm`。因此除了 `test/host.test.mjs`（宿主半边集成测试，动态 import `lib/index.js`，peer 依赖缺失时**整体 skip**，见 §9.2），**不要**在单测里 import `lib/index.js`，要测的逻辑请下沉到 `lib/` 下的纯模块。
4. **外部世界全部注入**：网络经 `fetchImpl` / `WebSocketImpl` 注入，凭据经 `resolveKey(name)` 注入，测试用假实现即可，不需要真实 API Key、不需要麦克风、不访问网络。

## 3. 常用命令

```bash
npm test                 # pretest 自动重建 lib/client.js，然后 node --test test/*.test.mjs
npm run build:client     # 由 lib/client-src/ 片段拼接生成 lib/client.js
npm run lint             # 宿主模块 ESM 语法检查 + 片段/生成物结构检查
dsh plugin --profile web add <本仓库路径>    # 本地安装到 DSH Web
dsh web                                     # 启动 DSH Web（刷新浏览器后生效）
dsh --profile web --dump-config             # 查看生效后的 profile 配置树
```

> `scripts/build-client.mjs` 要求 `lib/client-src/` 下存在 `00-open.js` 与 `90-close.js`，否则直接报错；`npm test` 的 `pretest` 会先重建一次 `lib/client.js`，所以跑测试前不需要单独构建。测试文件清单见 §9.1。

## 4. 目录职责

| 路径 | 职责 | 备注 |
|---|---|---|
| `lib/index.js` | 插件入口：`name` / `inject` / `Config` / `apply`，注册 `/dsh-chatty/*` 路由与 `transcribe_audio` 工具 | **唯一**允许 import `@deepseek-ai/*` 的宿主文件 |
| `lib/config.js` | schemastery `Config` 定义（字段见 [CONFIG.md](./CONFIG.md)） | 配置字段与默认值的**唯一权威** |
| `lib/credential-name.js` | 凭据引用名归一化（`toCredentialRef` / `credentialNameChanged`） | 已有实现 |
| `lib/draft.js` | Voice Draft 领域模型（纯函数，无 IO） | 已有实现 |
| `lib/command-parser.js` | 语音指令解析（精确匹配，禁止子串匹配） | 已有实现 |
| `lib/reply-adapter.js` | DSH `session/event` → `reply.delta` / `reply.end` / `reply.cancel` | 已有实现 |
| `lib/http-util.js` | `writeJson` / `readBody` / `isTrustedCaller` / SSE 工具 | 已有实现 |
| `lib/audio.js` | 音频格式探测、WAV 解析/封装、字节拼接 | 已有实现 |
| `lib/polish.js` | DSH LLM 润色 + 语音摘要（失败回落） | 已有实现，配置读取见 [CONFIG.md](./CONFIG.md) §8 |
| `lib/pipeline.js` | 每会话语音流水线：Buffer → Renderer → Queue | 已有实现，依赖 `lib/speech/` |
| `lib/ws-client.js` | 最小 RFC6455 WebSocket 客户端（支持自定义 Header） | 已有实现，见 §8 |
| `lib/speech/renderer.js` | Markdown → 可朗读内容（策略 `read`/`skip`/`summarize`/`smart`/`label_only`） | |
| `lib/speech/buffer.js` | 流式增量 → 完整 Block / 完整句子 | 围栏未闭合、表格未结束不得吐 |
| `lib/speech/queue.js` | 排队 / 取消 / 打断，`generation` 用于丢弃在途音频 | |
| `lib/stt/providers.js` | STT Provider 注册表、默认值、capability 与工厂 | |
| `lib/stt/volcano.js` / `siliconflow.js` | 具体 STT 实现 | 火山参考 `dsh-voice-hub/lib/volcengine-agent-plan-asr.js` |
| `lib/stt/pseudo-stream.js` | 无原生流式 Provider 的分段伪流式 | |
| `lib/tts/providers.js` | TTS Provider 注册表、默认值、`STATIC_VOICES`、capability 与工厂 | |
| `lib/tts/volcano.js` / `siliconflow.js` | 具体 TTS 实现 | |
| `lib/client-src/` | 浏览器半边片段：`00-open` / `10-locale` / `20-css` / `30-core` / `40-audio` / `45-stt` / `50-draft` / `55-tts` / `60-ui` / `70-settings` / `90-close` | 不得用 `import` / `export` |
| `lib/client.js` | 由片段拼接生成的浏览器 bundle | **生成物但需要提交**，不要手改 |
| `scripts/build-client.mjs` | 片段拼接（按文件名排序） | 缺 `00-open.js` / `90-close.js` 直接报错 |
| `scripts/lint.mjs` | 语法与结构检查 | 检查生成物含 `__ModuleLoader__.load` 与正确 loader id |
| `test/` | `node --test` 单测（`*.test.mjs`） | 清单见 §9.1；不访问网络、不用真实密钥 |

## 5. 新增一个 STT Provider

以新增 `foo` 为例：

1. **新建 `lib/stt/foo.js`**，导出纯函数或工厂；只 import 本地文件与 Node 内置模块，**不得** import `@deepseek-ai/*`。
2. **在 `lib/stt/providers.js` 注册**：
   - `STT_PROVIDER_KEYS` 追加 `'foo'`；
   - `STT_DEFAULTS.foo` 补 `{ credential, model, baseUrl, language, ... }`；
   - `sttCapability('foo')` 返回真实能力 `{ streaming, batch, timestamps, languages, partialResult }`；
   - `createSttProvider('foo', options)` 增加分支。
3. **实现契约形状**（见 [ARCHITECTURE.md](./ARCHITECTURE.md) §2.6）：
   - `provider = { name, capability, transcribe({ audio, mimeType, language, signal }), createStream({ language, sampleRate, signal, onPartial, onFinal, onError }) }`；
   - `stream = { pushAudio(bytes), stop() → Promise, cancel(), readonly closed }`；
   - 网络只经 `options.fetchImpl` / `options.WebSocketImpl`，凭据只经 `options.resolveKey(name)`；**任何日志、错误信息、返回值都不得包含密钥**。
4. **缺凭据必须抛 `Error('... credential not configured')` 且 `error.code = 'credential'`**，UI 依赖这个 code 区分「没配密钥」和「网络失败」。
5. **没有原生流式的 Provider** 用 `lib/stt/pseudo-stream.js` 做分段批量 + partial，不要自己另起一套流式协议。
6. **同步配置与文档**：`lib/config.js` 的 `stt.provider` 枚举、[CONFIG.md](./CONFIG.md) 的 Provider 表与默认值、必要时设置卡片段（`lib/client-src/`）里的 Provider 列表。
7. **必须补的单测**（新建 `test/stt-foo.test.mjs`）：
   - `transcribe` 正常路径：假 `fetchImpl` 断言请求 URL、认证 Header、body 形状，以及返回 `{ text, provider, tookMs }`；
   - HTTP 非 2xx / 返回体异常时的报错行为；
   - **缺凭据**：`resolveKey` 返回空 → 抛错且 `error.code === 'credential'`；
   - `createStream`：`pushAudio` 后 `onPartial` 先于 `onFinal`；`stop()` 后不再触发回调；`cancel()` 后 `closed === true`；
   - 注册表一致性：`STT_PROVIDER_KEYS` 含新 key、`sttCapability('foo')` 与 `createSttProvider('foo', …).capability` 一致；
   - 不写真实网络请求，不用真实密钥。

## 6. 新增一个 TTS Provider

1. **新建 `lib/tts/foo.js`**（同样只依赖本地文件与内置模块）。
2. **在 `lib/tts/providers.js` 注册**：`TTS_PROVIDER_KEYS` 追加、`TTS_DEFAULTS.foo` 补默认值（`credential` / `model` / `voice` / `baseUrl` / `sampleRate` / `format`）、`ttsCapability('foo')`、`createTtsProvider('foo', options)` 分支；如有静态音色，补进 `STATIC_VOICES`。
3. **实现契约形状**（见 [ARCHITECTURE.md](./ARCHITECTURE.md) §2.7）：
   - `synthesize({ text, voice, speed, format, signal }) → { audio: Uint8Array, format, sampleRate, channels }`；
   - `createStream({ text, voice, speed, format, signal }) → { chunks: AsyncIterable<Uint8Array>, format, sampleRate, channels, cancel() }`；
   - `listVoices({ signal }) → voice[]`，目录查询失败时回落到 `STATIC_VOICES`，不要让设置卡空掉。
4. **缺凭据同样抛 `code === 'credential'`**；火山 TTS 需要两个凭据（`VOLCANO_SPEECH` + `VOLCANO_SPEECH_APPID`），两个都要检查。
5. **同步配置与文档**：`lib/config.js` 的 `tts.provider` 枚举、[CONFIG.md](./CONFIG.md) 的默认值表。
6. **必须补的单测**（新建 `test/tts-foo.test.mjs`）：
   - `synthesize` 正常路径：断言请求体里的 `text` / `voice` / `speed` / `format`，以及返回的 `format` / `sampleRate` / `channels`；
   - `createStream`：`chunks` 可迭代出多段音频；`cancel()` 后迭代停止、不再产生新块；
   - **缺凭据** → `code === 'credential'`（火山要覆盖「只有 token、缺 appid」这一支）；
   - `listVoices` 失败时回落 `STATIC_VOICES`；
   - 注册表一致性：`TTS_PROVIDER_KEYS` / `ttsCapability` / `createTtsProvider().capability` 三者对齐。

## 7. 调试浏览器半边

```bash
npm run build:client                        # 改过 lib/client-src/ 片段后必须重建
dsh plugin --profile web add <本仓库路径>    # 首次安装（后续改代码只需重启 + 刷新）
dsh web                                     # 重启 DSH Web
```

然后在浏览器里：

1. **确认 bundle 已加载**：控制台检查 `window.__DSH_BOOT__` 中是否包含本插件的 loader 入口 `@irvingzhang0512/dsh-chatty`。没有 → 多半是包名/loader id 不匹配或没重建 `lib/client.js`。
2. **Network 面板过滤 `/dsh-chatty/`**，按功能核对请求：

   | 请求 | 用途 |
   |---|---|
   | `GET /dsh-chatty/status` | 配置摘要、Provider capability、凭据状态 |
   | `GET /dsh-chatty/config-info` | Provider 列表与凭据配置状态 |
   | `GET` / `POST /dsh-chatty/draft` | Voice Draft 读写（`add` / `edit` / `undo` / `clear` / `polish` / `command`） |
   | `POST /dsh-chatty/stt/transcribe` | 批量识别（Base64 音频） |
   | `POST /dsh-chatty/stt/stream/start` `/push` `/stop` | 流式识别的生命周期 |
   | `GET /dsh-chatty/stt/stream/events?streamId=` | SSE：`partial` / `final` / `error` / `closed`（在 EventStream 面板看） |
   | `POST /dsh-chatty/tts/synthesize` | 合成音频（看 `X-Audio-Format` / `X-Audio-Sample-Rate` / `X-Audio-Channels` 响应头） |
   | `GET /dsh-chatty/tts/voices` | 音色列表 |
   | `GET /dsh-chatty/speech/events?sessionId=` | SSE：`speech.segment` / `speech.end` / `speech.cancel` |
   | `POST /dsh-chatty/speech/render` / `/speech/stop` | 手动朗读 / 停止朗读 |
   | `POST /dsh-chatty/draft/polish` | 草稿润色 |

3. **常见定位顺序**：请求根本没发出 → 片段没构建/没注册 slot；请求 403 → 触发 `isTrustedCaller`（非回环且非同源）；请求返回 `{ ok: false, error: { code: 'credential' } }` → 凭据未配置；SSE 没有事件 → 看宿主日志里的 Provider 错误。
4. **改完片段必须 `npm run build:client` 再刷新页面**：本插件的 bundle 由 DSH 从已安装包读取，不走 DSH 仓库的 `dev:web` 热更新；`lib/client.js` 不重建，浏览器里跑的还是旧代码。

## 8. 自带 WebSocket 客户端（`lib/ws-client.js`）

**为什么自带一个最小 RFC6455 客户端**：火山引擎的流式 STT 需要在 WebSocket 握手上带自定义请求头（`X-Api-App-Key` / `X-Api-Access-Key` / `X-Api-Resource-Id`，见 `lib/stt/volcano.js`），而 Node 的全局 `WebSocket`（undici 实现）按 WHATWG 规范**不允许传 headers**。插件又要求零运行时依赖，所以 `lib/ws-client.js` 用 `node:http(s)` 的 `upgrade` 请求 + 手写帧编解码实现了够用的一层：

- 覆盖：握手（校验 `Sec-WebSocket-Accept`）、文本 / 二进制 / continuation 分片 / ping / pong / close 帧、`onopen`/`onmessage`/`onerror`/`onclose` 与 `on(event, fn)` 两种绑定、`send(string | Uint8Array | ArrayBuffer)`；
- 不支持：permessage-deflate 扩展、客户端作为服务端、超大消息的流式落盘；
- 注入点：`lib/index.js` 的 `makeSttProvider` 把 `createWebSocketImpl()` 作为 `options.WebSocketImpl` 传给 Provider，单测仍可注入假实现。

**测试方式**：`test/ws-client.test.mjs` 用 `node:http` 的 `upgrade` 事件**手写一个只做回声的服务端**（不引入任何依赖），覆盖握手成功与自定义 Header 随握手发出、握手被拒（HTTP 401 → `onerror` + `CLOSED`）、帧编解码与跨 TCP 分片还原、二进制 / 文本消息本地回环、`close` 触发 `onclose`、`createWebSocketImpl()` 返回可直接 `new` 的类。

## 9. 测试约定

### 9.1 测试清单

| 文件 | 覆盖 |
|---|---|
| `test/core.test.mjs` | 宿主核心纯模块：Voice Draft、语音指令、音频工具、会话事件适配、http-util |
| `test/pipeline.test.mjs` | 每会话语音流水线（Buffer → Renderer → Queue） |
| `test/speech.test.mjs` | Speech Renderer / Buffer / Queue |
| `test/stt.test.mjs` | STT Provider 注册表与 `volcano` / `siliconflow` / `pseudo-stream` |
| `test/tts.test.mjs` | TTS Provider 注册表与 `volcano` / `siliconflow` |
| `test/ws-client.test.mjs` | 最小 WebSocket 客户端（握手、帧编解码、本地回环，见 §8） |
| `test/client-bundle.test.mjs` | 生成的 `lib/client.js`：片段结构、slot 注册、组件冒烟渲染（假 react） |
| `test/host.test.mjs` | 宿主半边集成测试：假 `ctx` 驱动 `lib/index.js` 注册的真实路由与工具（见 §9.2） |

当前全量 `npm test`（`pretest` 重建 `lib/client.js` 后运行 `node --test test/*.test.mjs`）用例全部通过。

### 9.2 `test/host.test.mjs` 需要 peer 依赖

它是**宿主半边集成测试**：动态 import `lib/index.js`，用假 `ctx`（tools / credentials / webServer / settings / llm）驱动真实路由与工具，因此需要 peer 依赖 `@deepseek-ai/schemastery`、`@deepseek-ai/dsh-tools`、`@deepseek-ai/dsh-credentials`、`@deepseek-ai/dsh-llm`（见 `package.json` 的 `peerDependencies`）。

本仓库没有把它们写进 `dependencies`：**未安装时该文件整体跳过**（文件顶部 `try { await import('../lib/index.js') } catch` 拿到 `loadError`，每个 `test(...)` 都带 `{ skip }`，原因是 `缺少 peer 依赖：…`），`npm test` 仍然全绿。想让它在本地真正跑起来，推荐直接用仓库自带脚本：

```powershell
node scripts/link-peer-deps.mjs          # 自动探测本机 DSH 宿主安装并建立链接
node scripts/link-peer-deps.mjs --check  # 只检查是否就绪（CI/装前自检）
```

脚本做的事：读 `package.json` 的 `peerDependencies`，在若干候选目录里找到**同时提供全部 peer 包**的那一个（`$DSH_HOME/node_modules`、profile 的 `node_modules`、全局 npm 安装里的 `@deepseek-ai/dsh/node_modules`，以及同盘其它插件仓库的 `node_modules`），然后在 `dsh-chatty/node_modules/@deepseek-ai/` 下建目录链接（Windows 用 junction，其它平台用符号链接）。

**为什么必须链接而不是复制**：DSH 从 profile 加载插件时，Node 解析符号链接用的是 realpath，所以 `import '@deepseek-ai/dsh-tools'` 会从**插件自己的目录**往上找，而不会用 profile 的 `node_modules`（那里通常也没有这批包）。链接到宿主那一份意味着插件与宿主加载的是同一份文件、同一个模块实例，DSH 升级后也不会留下过期副本。反过来，把 `dsh-chatty/node_modules` 挪走会直接 `ERR_MODULE_NOT_FOUND: Cannot find package '@deepseek-ai/dsh-tools'`——这就是「链接到 profile 之前必须先跑这个脚本」的原因。

也可以手动建链接（目标换成你本机的宿主目录即可）：

```powershell
New-Item -ItemType Directory -Force node_modules\@deepseek-ai
New-Item -ItemType Junction node_modules\@deepseek-ai\dsh-tools `
  -Target "$env:APPDATA\npm\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\dsh-tools"
# schemastery / dsh-credentials / dsh-llm / dsh-host-webserver / cordis 同理
```

`node_modules/` 已被仓库根 `.gitignore` 忽略，链接不会进入版本库。

### 9.3 约定

- 运行器：`node --test`（`npm test`，入参 `test/*.test.mjs`）。测试文件统一放在 `test/` **根目录**，命名 `*.test.mjs`。
- **不访问网络**：用假 `fetchImpl`（记录调用并返回构造的响应对象）与假 `WebSocketImpl`（记录 `send` / `close`）；`test/ws-client.test.mjs` 是唯一例外，它连的是自己用 `node:http` 起的本地回环服务端。
- **不用真实密钥、不用真实麦克风**：凭据经 `resolveKey` 注入，音频用合成的 `Uint8Array`（如 `pcm16ToWav` 造 WAV）。
- **除 `test/host.test.mjs` 外不 import `@deepseek-ai/*`，也不 import `lib/index.js`**：peer 依赖可能未安装；需要测的宿主逻辑请下沉到纯模块（`test/host.test.mjs` 的例外与跳过策略见 §9.2）。
- **避免真实等待**：优先断言顺序与状态，不要 `sleep`；需要控制时间时把时钟/序列做成可注入参数，或用 `node:test` 的 mock timers。
- `npm test` 的 `pretest` 会自动重建 `lib/client.js`，不要绕过它（否则 lint 与实测用的是旧 bundle）。
- 改行为就要改/加断言：只改实现不补测试的 PR 不予合入。

## 10. 常见坑

1. **`lib/client-src/` 片段共享同一个 `factory` 作用域**：片段不是独立模块，写 `import` / `export` 会被构建脚本直接拒绝；顶层 `const` / `function` 重名会在浏览器里炸掉整个 bundle。给片段内的标识符加模块前缀。
2. **`lib/client.js` 是生成物，但需要提交**：`scripts/lint.mjs` 会检查它存在、包含 `__ModuleLoader__.load` 与正确的 loader id；手改会在下次构建时被覆盖，不重建则线上行为与源码不一致。
3. **settings 卡的 `label` 必须是静态字符串**：标签写函数、模板拼接或运行时求值，会在注册阶段抛错并**拖垮整个 client batch**，表现为插件设置页整体空白（不是只少一张卡）。文案要动态变化时，用固定的 label + 卡片内部的动态文本。
4. **别在宿主模块里 import `@deepseek-ai/*`**：`lib/index.js` 之外的宿主文件一旦 import，单测会因为 peer 依赖缺失直接失败（本仓库默认不装 `node_modules`，只有按 §9.2 建了链接才有）。
5. **指令判定不许用子串包含**：必须是「整段 Utterance 归一化后完全相等」，否则「这个请求发送以后…」会被误判成命令。唤醒模式下前缀后剩余部分必须为空。
6. **代码围栏未闭合、表格行未结束，都不能吐给 TTS**：否则会把代码和表格念成噪声（需求 §16 / §17）。
7. **`stt.wake_word` 是预留配置**：V1 暂不实现完整 Wake Word Engine，别把它当成可用功能实现或写进 UI 文案。
8. **包名 `@irvingzhang0512/dsh-chatty` 不可改**：`cordis.patch.yml`、`package.json` 的 `dsh.bundle` 与 `lib/client-src/00-open.js` 的 loader id 三处联动，改成短名会让 UI 半边静默失效。
9. **相对 import 必须带 `.js`**：纯 ESM 下省略扩展名在 Node 里直接报错。

## 11. 改动流程

1. 先读 [ARCHITECTURE.md](./ARCHITECTURE.md) 对应契约；需要变更契约时先改契约文档再改代码；
2. 改 `lib/` / `lib/client-src/` / `test/`；改片段后 `npm run build:client`；
3. `npm test` 全绿，`npm run lint` 通过；
4. 在 [`CHANGELOG.md`](./CHANGELOG.md) 的 `[Unreleased]` 下记一条；
5. 需要实测时 `dsh plugin --profile web add <本仓库路径>` → 重启 `dsh web` → 刷新浏览器 → 按第 7 节看 `/dsh-chatty/*`；
6. 按 [`../AGENTS.md`](../AGENTS.md) 的 Angular 规范提交（`type(scope): subject`，subject 用中文）。

## 12. 发布（如果未来发 npm）

- `package.json` 的 `files` 已包含 `lib/*.js`、`lib/speech/*.js`、`lib/stt/*.js`、`lib/tts/*.js`、`cordis.patch.yml`、`README.md`、`LICENSE`；新增子目录时要同步补进 `files`。
- 发版前确认 `lib/client.js` 已重建并提交，`npm test` 与 `npm run lint` 全绿。
- 版本号自管；打 tag 即可，暂不引入额外发布流程。
