# dsh-chatty 配置参考

> 本文档描述 `dsh-chatty` 的**配置契约**：字段名、类型、默认值与含义。
> **字段名与「插件配置默认值」一律以 [`lib/config.js`](../lib/config.js) 的 schemastery schema 为准**；本文与代码不一致时以代码为准，并回来同步本文。
> **Provider 默认值是另一层**：[`lib/stt/providers.js`](../lib/stt/providers.js) 的 `STT_DEFAULTS` 与 [`lib/tts/providers.js`](../lib/tts/providers.js) 的 `TTS_DEFAULTS` 只在「插件配置留空」时兜底，和 `lib/config.js` 里的默认值不是同一个概念（见 §3.1 / §4.1）。
> 已实现模块读取的字段见文末附录（§8）。

---

## 1. 两条硬性约定

1. **API Key 只存 DSH Credentials**，插件配置里只写 **credential 引用名**。
2. **禁止把真实密钥写入项目配置文件、`cordis.patch.yml`、日志或任何 HTTP 响应**；密钥只在宿主半边经 `ctx.credentials` 解析，绝不下发浏览器。

```yaml
# ✅ 正确：只存引用名（默认 provider 组合：STT 硅基流动 / TTS 硅基流动）
stt:
  provider: siliconflow
  credential: SILICONFLOW_API_KEY

# ❌ 错误：明文密钥
stt:
  provider: siliconflow
  apiKey: sk-xxxxxxxx
```

---

## 2. 凭据名约定

DSH Credentials 的引用名只接受 `^[A-Za-z_][A-Za-z0-9_]*$`（`@deepseek-ai/dsh-credentials` 的 `credentialRef()`），因此插件的**规范凭据名**是大写 + 下划线：

| 规范凭据名 | 用途 | 谁需要 |
|---|---|---|
| `VOLCENGINE_AGENT_PLAN_API_KEY` | 火山方舟 Agent Plan API Key（一把钥匙通吃语音识别与合成；配置字段 `stt.credential` / `tts.credential`） | `stt.provider: volcano` / `tts.provider: volcano`（默认） |
| `SILICONFLOW_API_KEY` | 硅基流动 API Key | `stt.provider: siliconflow` / `tts.provider: siliconflow` |

> 火山「经典（App ID + Access Token）」鉴权已在 v0.3 移除；如仍有旧凭据（`VOLCANO_SPEECH` / `VOLCANO_SPEECH_APPID`），它们不再被任何 provider 使用。

### 2.1 归一化：配置里可以写连字符，DSH Credentials 里必须是规范名

宿主解析凭据前会先归一化（[`lib/credential-name.js`](../lib/credential-name.js) 的 `toCredentialRef()`）：非字母数字字符替换为 `_`、去掉首尾下划线、统一大写，数字开头补一个 `_`。

所以下面这些写法指向**同一个引用**：

| 配置里写的 | 归一化后的引用名 |
|---|---|
| `volcano-speech` / `VOLCANO_SPEECH` / `Volcano Speech` | `VOLCANO_SPEECH` |
| `volcano-speech-appid` / `VOLCANO_SPEECH_APPID` | `VOLCANO_SPEECH_APPID` |
| `siliconflow` / `SILICONFLOW` / `SILICONFLOW_API_KEY` | `SILICONFLOW_API_KEY` |

**但 DSH Credentials 里保存的名字必须是规范形式**（`VOLCANO_SPEECH` 这种大写 + 下划线）：宿主只按归一化后的名字去查凭据，凭据库里存成 `volcano-speech` 是查不到的。配置里写了会被归一化的名字时，宿主会打一条 `凭据名 "…" 已归一化为 "…"` 的警告日志（见 `lib/index.js` 的 `resolveKey`）。

### 2.2 配置途径

**推荐：设置卡里的「凭据」区。** 点 **打开凭据文件**（宿主用系统编辑器打开 `$DSH_HOME/.credentials.yaml`，首次自动生成骨架），在 `refs:` 下按规范名加一行，保存后回设置卡点 **重新检查** 看到 ✓ 即生效。

**等价：直接编辑 `$DSH_HOME/.credentials.yaml`。** 文件只存凭据，版本化结构如下；写入时**不要整体覆盖**已有内容：

```yaml
version: 1
refs:
  SILICONFLOW_API_KEY: 你的硅基流动 API Key
  VOLCENGINE_AGENT_PLAN_API_KEY: 你的方舟 Agent Plan API Key（可选）
# 保留文件中原有的其他 refs 与 records
```

**临时注入：启动环境。** 宿主在 DSH Credentials 查不到时回落到环境变量，**变量名按归一化后的大写名下查**，例如 `process.env.VOLCANO_SPEECH`（PowerShell 里写 `$env:VOLCANO_SPEECH = '...'`）；继承的进程环境优先级最高，`.env`（工作目录或 `$DSH_HOME/.env`）作为只读兜底。

> ⚠️ 本机 DSH 的 CLI 只有 `dsh web` / `dsh plugin` / `dsh --profile …` / `--dump-config` 这些入口，**没有 `dsh credentials` 子命令**，不要照抄不存在的命令；请用凭据设置页或 `.credentials.yaml`。
>
> 凭据缺失时，Provider 会抛出 `code` 为 `'credential'` 的错误（消息形如 `... credential not configured`），设置卡与 Voice Bar 会显示为「错误」状态。

---

## 3. 配置区一：`stt`

下表「插件配置默认值」一列逐字对应 `lib/config.js`；「留空用 Provider 默认」的字段在传给 Provider 前会被剔空（`lib/index.js` 的 `compactConfig`），由 `STT_DEFAULTS` 兜底。

| 字段 | 类型 | 插件配置默认值 | 含义 |
|---|---|---|---|
| `provider` | string | `volcano` | STT Provider：`volcano`（Agent Plan 语音识别 2.0，默认）/ `siliconflow` |
| `model` | string | `''` | 模型覆盖。留空使用 Provider 默认值（设置卡为下拉） |
| `credential` | string | `VOLCENGINE_AGENT_PLAN_API_KEY` | 凭据引用名（不是密钥）。**设置卡切换 provider 时会自动重置为该 provider 的默认凭据名**（volcano → `VOLCENGINE_AGENT_PLAN_API_KEY`，siliconflow → `SILICONFLOW_API_KEY`） |
| `streaming` | boolean | `true` | 优先使用流式识别；Provider 不支持时自动回落到批量 |
| `language` | string | `zh-CN` | 识别语言 |
| `base_url` | string | `''` | 批量识别接口地址覆盖。**留空用 Provider 默认** |
| `stream_url` | string | `''` | 流式识别接口地址覆盖。留空用 Provider 默认 |
| `resource_id` | string | `''` | 火山引擎资源 ID 覆盖（流式）。留空用 Provider 默认 |
| `continuous_listening` | boolean | `false` | 进入页面后是否自动开启长时间监听 |
| `partial_preview` | boolean | `true` | 流式识别时在界面上显示 Partial Result（不会进入 Voice Draft） |
| `vad` | object | 见 §3.2 | 本地 VAD |
| `wake_word` | object | 见 §3.3 | 唤醒词（V1 只预留接口） |

### 3.1 Provider 默认值（`STT_DEFAULTS`）

`lib/stt/providers.js` 的 `STT_DEFAULTS`，与「插件配置默认值」是两层：

| 字段 | `volcano`（Agent Plan） | `siliconflow` |
|---|---|---|
| `credential` | `VOLCENGINE_AGENT_PLAN_API_KEY` | `SILICONFLOW_API_KEY` |
| `model` | `doubao-seed-asr-2.0` | `FunAudioLLM/SenseVoiceSmall` |
| `baseUrl` | —（无批量 HTTP 端点） | `https://api.siliconflow.cn/v1` |
| `streamUrl` | `wss://openspeech.bytedance.com/api/v3/plan/sauc/bigmodel_nostream` | — |
| `resourceId` | `volc.seedasr.sauc.duration` | — |
| `language` | `zh-CN` | `zh` |

> 火山「经典（App ID + Access Token，批量 recognize/flash + sauc/bigmodel）」已在 v0.3 移除。

### 3.2 `stt.vad`

| 字段 | 类型 | 默认值 | 含义 |
|---|---|---|---|
| `enabled` | boolean | `true` | 是否启用本地 VAD；关闭后将持续上传，**不建议** |
| `sensitivity` | number | `0.6` | 人声判定灵敏度（0~1，越大越容易触发） |
| `silence_timeout_ms` | number | `1200` | 静音达到该时长即结束当前 Utterance |
| `min_speech_ms` | number | `200` | 最短人声时长，低于该值的触发被忽略（抗噪） |
| `pre_roll_ms` | number | `400` | Pre-roll Ring Buffer 长度，回吐触发前的音频，避免句首丢字；推荐 300~500 |

### 3.3 `stt.wake_word`

| 字段 | 类型 | 默认值 | 含义 |
|---|---|---|---|
| `enabled` | boolean | `false` | **V1 暂不实现**：完整 Wake Word Engine 不在 V1 范围，此处仅预留配置位 |
| `text` | string | `DSH` | 预留的唤醒词 |

> V1 实际可用的是**唤醒前缀模式**：`voice_control.command_mode: wake` + `voice_control.wake_prefix`，它只要求指令前带前缀（`DSH，发送`），不是常驻唤醒词检测。

---

## 4. 配置区二：`tts`

| 字段 | 类型 | 插件配置默认值 | 含义 |
|---|---|---|---|
| `provider` | string | `volcano` | TTS Provider：`volcano`（Agent Plan 语音合成 2.0，默认）/ `siliconflow` |
| `model` | string | `''` | 模型覆盖。留空使用 Provider 默认值 |
| `voice` | string | `''` | 音色 ID。留空使用 Provider 默认音色（设置卡为下拉） |
| `credential` | string | `VOLCENGINE_AGENT_PLAN_API_KEY` | 凭据引用名（跟随 provider；切 provider 时设置卡自动重置） |
| `stream_url` | string | `''` | 合成端点覆盖。留空用 Provider 默认 |
| `resource_id` | string | `''` | 合成资源 ID 覆盖。留空用 Provider 默认 |
| `speed` | number | `1.0` | 语速倍率 |
| `format` | string | `pcm` | 输出格式：`pcm`（浏览器 WebAudio 直接播放）/ `mp3` / `wav` |
| `sample_rate` | number | `24000` | 输出采样率（响应头 `X-Audio-Sample-Rate` 回传） |
| `volume` | number | `1.0` | 浏览器端播放音量 0~1 |
| `auto_read` | boolean | `false` | 自动朗读：Assistant 回复完成后自动走 Speech Renderer → TTS |
| `interrupt_on_speech` | boolean | `true` | 朗读期间检测到用户讲话时停止朗读并进入监听 |
| `code_hint` | boolean | `true` | 代码块被 `skip` 时插入一条口播提示 |
| `llm_summary` | boolean | `true` | 复杂表格 / 长列表允许调用 DSH 当前 LLM 生成语音摘要；`false` 时完全走规则摘要 |
| `summary_prompt` | string | `''` | 语音摘要 Prompt 覆盖。留空使用内置 Prompt（`lib/polish.js` 的 `DEFAULT_SPEECH_SUMMARY_PROMPT`） |
| `max_chars` | number | `4000` | 单次合成的最大字符数 |
| `renderer` | object | 见 §4.2 | Speech Renderer 策略 |

> 口播提示的文案是内置常量（`这里包含一段代码示例，请查看页面内容。`，见 `lib/speech/renderer.js`），**没有对应的插件配置字段**：`renderer` 的 `options.codeHintText` 只是内部参数，未接入 `lib/config.js`。

### 4.1 Provider 默认值（`TTS_DEFAULTS`）

`lib/tts/providers.js` 的 `TTS_DEFAULTS`，与「插件配置默认值」是两层：

| 字段 | `volcano`（Agent Plan 合成 2.0） | `siliconflow` |
|---|---|---|
| `credential` | `VOLCENGINE_AGENT_PLAN_API_KEY` | `SILICONFLOW_API_KEY` |
| `model` | `''`（使用默认资源） | `FunAudioLLM/CosyVoice2-0.5B` |
| `voice` | `zh_female_shuangkuaisisi_uranus_bigtts` | `FunAudioLLM/CosyVoice2-0.5B:alex` |
| `baseUrl` | `https://openspeech.bytedance.com/api/v3/plan/tts/unidirectional` | `https://api.siliconflow.cn/v1` |
| `resourceId` | `seed-tts-2.0` | — |
| `sampleRate` | `24000` | `24000` |
| `format` | `pcm` | `pcm` |

> 火山 volcano TTS 为 **Agent Plan 语音合成 2.0**（HTTP POST 单请求，`X-Api-Key` 鉴权），与 STT 共用同一把方舟 API Key。音色须用 2.0 代（`*_uranus_bigtts`）；1.0 代音色（`*_moon_bigtts`）会返回 55000000 音色不匹配。

> 静态音色表见 `lib/tts/providers.js` 的 `STATIC_VOICES`；`GET /dsh-chatty/tts/voices` 查询失败时回落到它。

### 4.2 `tts.renderer`（Speech Renderer 策略）

每种 Markdown Block 支持五个策略值：`read`（朗读）/ `skip`（跳过）/ `summarize`（摘要）/ `smart`（按长度与内容决定）/ `label_only`（只读链接文字）。

| 字段 | 类型 | 默认值 | 含义 |
|---|---|---|---|
| `paragraph` | 策略 | `read` | 普通段落 |
| `heading` | 策略 | `read` | 标题 |
| `blockquote` | 策略 | `read` | 引用块 |
| `list` | 策略 | `smart` | 简短列表朗读，超长列表摘要 |
| `table` | 策略 | `summarize` | 转成自然中文口语句子，绝不逐格朗读 |
| `code_block` | 策略 | `skip` | 跳过代码，可按 `code_hint` 插入提示 |
| `inline_code` | 策略 | `smart` | 行内代码 |
| `mermaid` | 策略 | `skip` | Mermaid 图 |
| `ascii_diagram` | 策略 | `skip` | ASCII 图 |
| `url` | 策略 | `label_only` | 不朗读 URL，只读链接文字 |
| `image` | 策略 | `skip` | 图片 |
| `math_block` | 策略 | `skip` | 数学公式 |
| `tool_log` | 策略 | `skip` | 工具调用与调试信息 |

> 表格摘要失败（模型超时、未配置 LLM）时会回落到规则摘要；`renderSpeechAsync` 永远不会因为摘要失败而中断朗读。

---

## 5. 配置区三：`voice_control`

| 字段 | 类型 | 默认值 | 含义 |
|---|---|---|---|
| `enabled` | boolean | `true` | 是否允许用语音指令控制 Voice Draft |
| `command_mode` | string | `exact` | `exact`：整句等于指令词才执行；`wake`：必须带唤醒前缀（`DSH，发送`）；`off`：关闭 |
| `wake_prefix` | string | `DSH` | `wake` 模式的唤醒前缀 |
| `wake_words` | string[] | `[]` | **额外的**唤醒词，例如 `小D`（`wake_prefix` 之外的别名） |
| `commands` | object | `DEFAULT_COMMANDS` | 动作名 → 说法列表；默认值见 `lib/command-parser.js`。覆盖时**整表替换** |

判定红线：**不做子串包含匹配**。「发送」是命令；「这个请求发送以后需要等待服务器响应」是正文（需求 §5.2）。

### 5.1 `voice_control.commands` 默认值

默认值与 `lib/command-parser.js` 的 `DEFAULT_COMMANDS` 一致（顺序即 UI 展示顺序）：

| 动作 | 默认指令词 | 说明 |
|---|---|---|
| `send` | `发送` `提交` `发送消息` `send` `submit` | 将 Voice Draft 发送到当前 Session |
| `undo` | `撤销` `重说` `撤回` `undo` | 删除最近一个 Utterance |
| `clear` | `清空` `清除` `clear` | 清空整个 Voice Draft |
| `cancel` | `取消` `cancel` | 取消本次输入 |
| `polish` | `润色` `整理一下` `polish` | 调用 DSH LLM 润色当前 Draft |
| `stop_listening` | `停止录音` `停止监听` `结束监听` `stop listening` | 停止长时间监听 |
| `pause` | `暂停` `pause` | 暂停监听 |
| `resume` | `继续听` `继续` `resume` | 恢复监听 |
| `read` | `朗读` `读一下` `read` | 朗读当前 Assistant 回复 |
| `stop_reading` | `停止朗读` `别读了` `stop reading` | 停止 TTS |

> 润色**不在** `voice_control` 下配置：提示词、provider、模型等字段都在顶层 `polish` 配置区（见 §6.2）。

---

## 6. 配置区四：`draft` / `polish` / `ui` 与顶层字段

### 6.1 `draft`

| 字段 | 类型 | 默认值 | 含义 |
|---|---|---|---|
| `auto_send` | boolean | `false` | 识别完成后是否自动发送。默认关闭：一次说完不等于一次发送（需求 §4.1） |
| `max_utterances` | number | `200` | 保留的最大 Utterance 数，超出丢弃最旧的（长时间监听防内存无界） |
| `separator` | string | `\n` | 多个 Utterance 拼接成 Draft 文本时的连接符 |
| `polish_on_command` | boolean | `true` | 说出「润色」指令时是否允许调用 LLM 润色 |

### 6.2 `polish`

| 字段 | 类型 | 默认值 | 含义 |
|---|---|---|---|
| `enabled` | boolean | `true` | 是否允许润色调用模型（`lib/polish.js` 的 `createPolishText` 与 `lib/index.js` 的润色指令判定；语音摘要由 `tts.llm_summary` 单独控制） |
| `prompt` | string | `''` | 润色 Prompt 覆盖。留空使用内置 Prompt（`DEFAULT_POLISH_PROMPT`） |
| `provider` | string | `''` | 润色使用的 LLM provider。留空跟随当前 Session 模型 |
| `model_id` | string | `''` | 润色使用的模型。留空跟随当前 Session 模型 |
| `base_url` | string | `''` | OpenAI 兼容端点。填写后不再走 DSH LLM |
| `key_env` | string | `''` | OpenAI 兼容端点的凭据引用名（按 §2.1 归一化后解析） |

### 6.3 `ui`

| 字段 | 类型 | 默认值 | 含义 |
|---|---|---|---|
| `show_voice_bar` | boolean | `true` | 在输入框右侧显示 Voice Bar（`conversation.input.right`） |
| `show_draft_panel` | boolean | `true` | 显示 Voice Draft 面板（`conversation.input.dock`） |
| `visualizer` | string | `bars` | 音频可视化：`bars` / `wave` / `off` |
| `panel_width` | number | `720` | 语音面板最大宽度（px） |
| `show_partial` | boolean | `true` | 显示 Partial Result 实时预览（只显示，不进正式草稿） |

### 6.4 顶层字段

| 字段 | 类型 | 默认值 | 含义 |
|---|---|---|---|
| `timeout_ms` | number | `120000` | 单次 STT/TTS 请求的总超时 |
| `max_audio_bytes` | number | `26214400`（25 MiB） | 单次上传音频的字节上限 |
| `mic_device_id` | string | `''` | 麦克风设备 ID。留空使用系统默认设备 |
| `noise_suppression` | boolean | `true` | 请求浏览器开启降噪、回声消除与自动增益 |
| `echo_cancellation` | boolean | `true` | 单独控制浏览器回声消除（V1 不做服务端 AEC） |
| `auto_gain_control` | boolean | `true` | 请求浏览器自动增益控制 |

---

## 7. 完整配置示例（逐字对应 `lib/config.js`）

```yaml
stt:
  provider: volcano
  model: ''
  credential: VOLCENGINE_AGENT_PLAN_API_KEY
  streaming: true
  language: zh-CN
  base_url: ''
  stream_url: ''
  resource_id: ''
  continuous_listening: false
  partial_preview: true

  vad:
    enabled: true
    sensitivity: 0.6
    silence_timeout_ms: 1200
    min_speech_ms: 200
    pre_roll_ms: 400

  wake_word:
    enabled: false
    text: DSH

tts:
  provider: volcano
  model: ''
  voice: ''
  credential: VOLCENGINE_AGENT_PLAN_API_KEY
  speed: 1.0
  format: pcm
  sample_rate: 24000
  volume: 1.0

  auto_read: false
  interrupt_on_speech: true
  code_hint: true
  llm_summary: true
  summary_prompt: ''
  max_chars: 4000

  renderer:
    paragraph: read
    heading: read
    list: smart
    table: summarize
    code_block: skip
    inline_code: smart
    mermaid: skip
    ascii_diagram: skip
    url: label_only
    image: skip
    math_block: skip
    tool_log: skip
    blockquote: read

voice_control:
  enabled: true
  command_mode: exact
  wake_prefix: DSH
  wake_words: []

  commands:
    send:
      - 发送
      - 提交
    undo:
      - 撤销
      - 重说
    clear:
      - 清空
    cancel:
      - 取消
    polish:
      - 润色
    stop_listening:
      - 停止录音
    pause:
      - 暂停
    resume:
      - 继续听
    read:
      - 朗读
    stop_reading:
      - 停止朗读

draft:
  auto_send: false
  max_utterances: 200
  separator: "\n"
  polish_on_command: true

polish:
  enabled: true
  prompt: ''
  provider: ''
  model_id: ''
  base_url: ''
  key_env: ''

ui:
  show_voice_bar: true
  show_draft_panel: true
  visualizer: bars
  panel_width: 720
  show_partial: true

timeout_ms: 120000
max_audio_bytes: 26214400
mic_device_id: ''
noise_suppression: true
echo_cancellation: true
auto_gain_control: true
```

> 上面 `commands` 只是节选（默认表见 §5.1）；不写 `commands` 时直接用 `DEFAULT_COMMANDS`。

### 7.1 在 profile 里覆盖

插件以 bundle 层安装（[`../cordis.patch.yml`](../cordis.patch.yml)），profile 自己的 `cordis.patch.yml` 可以覆盖任意字段：

```yaml
- id: dsh-chatty
  config:
    stt:
      provider: siliconflow
      credential: SILICONFLOW_API_KEY
    tts:
      provider: volcano
      credential: VOLCANO_SPEECH
```

查看生效后的完整配置树：

```bash
dsh --profile web --dump-config
```

设置卡（`Settings → Plugins → Plugin settings → dsh-chatty`，走注入的 `settingsScope`）可以改运行期配置，保存即生效；**密钥不在设置卡里填写**——设置卡凭据区显示每把 Key 的 ✓/✗，点「打开凭据文件」在 `$DSH_HOME/.credentials.yaml` 的 `refs:` 下按规范名添加一行即可。

---

## 8. 附：润色与摘要相关字段（`lib/polish.js` 已读取）

`lib/polish.js` 的 `createLlmTextRunner` **优先读嵌套的 `polish.*`**，没有时才回落到早期的扁平旧键（旧配置因此仍然有效）：

| 嵌套字段（推荐） | 扁平旧键（兜底） | 类型 | 默认值 | 含义 |
|---|---|---|---|---|
| `polish.base_url` | `polishBaseUrl` | string | 空 | 显式指定 OpenAI 兼容端点（本地模型 / 私有网关）时优先使用 |
| `polish.provider` | `polishProvider` | string | 空 | 走 DSH LLM 时的 provider，留空则用当前 Agent 默认模型 |
| `polish.model_id` | `polishModelId` | string | 空 | 走 DSH LLM 时的模型 ID |
| `polish.key_env` | `polishKeyEnv` | string | 空 | 使用 `base_url` 时的凭据引用名（Bearer） |
| `polish.prompt` | — | string | `DEFAULT_POLISH_PROMPT` | 润色提示词 |
| `polish.enabled` | — | boolean | `true` | `false` 时 `createPolishText` 原样返回输入 |
| `tts.llm_summary` | — | boolean | `true` | `false` 时禁止调用 LLM 做摘要 |
| `tts.summary_prompt` | — | string | `DEFAULT_SPEECH_SUMMARY_PROMPT` | 语音摘要提示词 |

> 扁平旧键**不在 `lib/config.js` 的 schema 里**：schema 不会为它们补默认值，设置卡也不暴露它们（设置卡里只有 `polish.enabled`），但它们会被 schemastery 原样保留并传给 `getConfig()`，所以旧配置仍能生效。新配置请一律使用嵌套的 `polish.*`。

润色与摘要都是**尽力而为**：任何失败都返回原文 / 返回 `null` 并回落到规则摘要，绝不会因为一次模型抖动卡住用户的语音输入。

---

## 9. 排错速查

| 现象 | 可能原因 |
|---|---|
| 状态显示「错误」且消息含 `credential not configured` | 引用名写错，或凭据未保存到 DSH Credentials（注意保存的必须是 `VOLCANO_SPEECH` 这类规范名） |
| 火山 TTS 报鉴权失败 | 只配了 `VOLCANO_SPEECH`，漏配 `VOLCANO_SPEECH_APPID` |
| 一直没有识别结果 | `stt.vad.enabled` 打开但灵敏度偏低，或 `min_speech_ms` 过大 |
| 句首经常丢字 | 调大 `stt.vad.pre_roll_ms`（300~500 ms） |
| 一句话被切得很碎 | 调大 `stt.vad.silence_timeout_ms` |
| 说话时被 TTS 打断 | 关闭 `tts.interrupt_on_speech`（V1 无 AEC） |
| 代码块被朗读 | 检查 `tts.renderer.code_block` 是否为 `skip` |
| 表格被逐格念出 | `tts.renderer.table` 应为 `summarize` |
| 润色 / 摘要不生效 | 检查 `polish.enabled` 与 `tts.llm_summary`；`polish.provider` / `polish.model_id` 留空时跟随当前 Session 模型 |
