# dsh-chatty 设计说明

> 本文解释**为什么这样设计**。实现契约（导出名、数据形状）见 [`ARCHITECTURE.md`](./ARCHITECTURE.md)，需求来源见 [`REQUIREMENTS.md`](./REQUIREMENTS.md)，配置字段见 [`CONFIG.md`](./CONFIG.md)。

---

## 1. 两个核心中间对象

插件真正要解决的不是 `Speech → Text` 与 `Text → Speech` 这两次转换，而是两个**中间对象**：

```text
Human Speech
     ↓
 Voice Draft        ← 语音输入的「待确认态」：可编辑、可撤销、可润色、不自动发送
     ↓
DSH Session
```

```text
DSH Response
     ↓
Speech Response     ← 面向耳朵的临时产物：不修改原始 Message，可丢弃、可重生成
     ↓
Human Listening
```

由此得到两条最重要的设计结论：

1. **Voice Draft 是语音输入与 DSH Session 之间的缓冲层**（`lib/draft.js`）。一次说完不等于一次发送；识别结果只进 Draft，提交动作必须显式（点击「发送」或说出「发送」指令）。
2. **Speech Response 是 Assistant Message 的派生产物**（`lib/speech/renderer.js` + `lib/pipeline.js`）。页面显示完整 Markdown，TTS 只朗读适合听的版本；两者互不覆盖。

```
                    ┌→ Display Renderer → DSH Web（完整 Markdown，原文不变）
Assistant Message ──┤
                    └→ Speech Renderer  → Speech Text → TTS（临时生成）
```

---

## 2. 数据流

### 2.1 输入方向：语音 → Voice Draft → Session

```text
┌──────────────┐
│ Audio Capture│  麦克风常开（Continuous Listening）或按需（Push-to-Talk）
└──────┬───────┘
       ↓
┌──────────────┐
│  Local VAD   │  判断是否有人声 / Utterance 起止（浏览器半边）
└──────┬───────┘
       ↓ 触发
┌──────────────┐
│  Pre-roll    │  回吐触发前约 400 ms 音频，避免句首丢字
│  Ring Buffer │
└──────┬───────┘
       ↓
┌──────────────┐
│  Utterance   │  一次连续说话（静音达阈值即结束）
└──────┬───────┘
       ↓
┌──────────────────────────────┐
│ STT Provider                 │  流式（partial/final）或批量（一次返回）
│ volcano / siliconflow / ...  │  宿主侧解析凭据、发起请求
└──────┬───────────────────────┘
       ↓ Final Result
┌──────────────┐   命中指令词（整段相等）→ Command Parser 执行动作
│ Voice Draft  │ ────────────────────────────────────────────────┐
│ (lib/draft)  │                                                 │
└──────┬───────┘                                                 │
       ↓ 用户点击发送 / 说出「发送」                              │
┌──────────────┐                                                 │
│ DSH Session  │  inputActions.setDraft(text) → submit()          │
└──────────────┘                                                 │
                                                                 ↓
                                       发送 / 撤销 / 清空 / 取消 / 润色 / 朗读 …
```

关键点：

- **无人声不调远程 STT**：VAD 在浏览器本地跑，只有检测到人声才建立 Utterance 并请求识别（需求 §3.2）。
- **Partial Result 不进 Draft**：流式模式下 partial 只用于实时显示，收到 final 才 `draft.add()`（需求 §8.2）。
- **撤销只影响 Draft**：`undo()` 弹掉最近一个 Utterance；`replaceAll()` 把编辑器全文作为单段写回，避免「编辑文本」和「撤销」互相打架（见 `lib/draft.js` 注释）。
- **指令与正文分离**：`lib/command-parser.js` 只在 Utterance 归一化后**整体等于**指令词时返回命令，`rest` 必须为空；唤醒模式额外要求前缀。绝不做子串匹配，否则「这个请求发送以后需要等待服务器响应」会被误判。

### 2.2 输出方向：Assistant Reply → Speech → 扬声器

```text
┌───────────────────┐
│ Assistant Reply   │  流式文本增量（feed）或整段 Markdown（手动朗读）
└─────────┬─────────┘
          ↓
┌───────────────────┐
│  Speech Buffer    │  判断「完整 Markdown Block」或「完整句子」
│ (speech/buffer.js)│  代码围栏未闭合、表格行未结束 → 不吐
└─────────┬─────────┘
          ↓ 完整块
┌───────────────────┐
│ Speech Renderer   │  Markdown → 可朗读纯文本（策略：read/skip/summarize/smart/label_only）
│(speech/renderer.js)│  表格摘要、代码跳过并可插入口播提示
└─────────┬─────────┘
          ↓ segments
┌───────────────────┐
│  Speech Queue     │  排队 / 取消 / 打断；generation 用于丢弃在途音频
│ (speech/queue.js) │
└─────────┬─────────┘
          ↓ onSegment → SSE speech.segment
┌───────────────────┐
│  TTS Provider     │  volcano / siliconflow（宿主侧合成，返回音频字节）
└─────────┬─────────┘
          ↓
┌───────────────────┐
│  Audio Player     │  浏览器播放；播放中可被 Stop / 用户说话打断
└───────────────────┘
```

`lib/pipeline.js` 把 Buffer → Renderer → Queue 串成**每会话一条流水线**（`createSpeechPipeline`）：

- `feed(sessionId, delta)`：LLM 增量文本 → 完整块 → 入队；
- `finish(sessionId)`：flush 剩余内容；
- `render(sessionId, markdown)`：手动朗读整段渲染（可选用 LLM 摘要升级表格/列表）；
- `cancel(sessionId)`：清空该会话队列并递增 generation，浏览器据此丢弃过期音频，**不触碰原始 Message**。

---

## 3. 状态机

### 3.1 STT（需求 §24）

```text
        ┌──────────────────────────────────────────────┐
        ↓                                              │
     OFF ──开启──▶ LISTENING ──VAD 触发──▶ SPEECH_DETECTED
                      ▲                          │
                      │                          ↓
                      └──── final 结果 ◀── TRANSCRIBING
```

扩展状态（不改变主干，只做叠加）：

```text
PAUSED         用户主动暂停：麦克风可关闭，Draft 保留
RECONNECTING   流式 Provider 连接异常，自动重连中（需求 §8.2）
ERROR          凭据缺失 / 网络失败 / Provider 报错，需用户处理
```

设计约束：

- 主干回到 `LISTENING` 而不是 `OFF`：一次识别完成不退出长时间监听，也不自动发送（需求 §3.2）。
- `TRANSCRIBING` 期间新的人声触发应排队或丢弃，不能并发污染同一个 Utterance。
- 状态文案与需求 §23.3 的十一项用户可见状态一一对应，设置卡与 Voice Bar 共用同一份状态源。

### 3.2 TTS（需求 §24）

```text
     IDLE ──朗读请求/自动朗读──▶ PREPARING ──首个音频块──▶ PLAYING ──播完──▶ IDLE
```

扩展状态：

```text
INTERRUPTED   Stop / 用户说话打断：停播 + 清空队列，回到 IDLE
ERROR         合成失败 / 音频解码失败
```

设计约束：

- `PREPARING` 覆盖「渲染 + 首个 segment 合成」窗口，避免用户看到「没反应」。
- 打断路径固定为：`Stop TTS → Clear Speech Queue → 回到 STT LISTENING`（需求 §20）。
- 手动朗读与自动朗读共用同一条队列，因此两者都能被同一次 Stop 打断。

---

## 4. Display Response 与 Speech Response 分离（需求 §15）

| 项 | Display Response | Speech Response |
|---|---|---|
| 来源 | Assistant Message 原文 | Speech Renderer 派生 |
| 内容 | 完整 Markdown（表格、代码、图） | 适合朗读的纯文本片段 |
| 生命周期 | 长期，属于会话历史 | 临时，可随时丢弃/重生成 |
| 被 Stop 影响 | 否 | 是（清空队列） |

- `Speech Renderer` **只读**输入，产出 `segments` / `skipped`，从不回写 Message。
- 未来若 DSH 支持结构化消息（`{ content, speech }`），可以直接把 Speech Response 挂上去；**V1 不依赖协议改造**。
- 结果：停止朗读、切换音色、重新渲染，都不会改变用户看到的回答。

### 4.1 渲染策略

默认策略（需求 §12.2，`DEFAULT_RENDERER_POLICY`）：

| Block | 默认 | 说明 |
|---|---|---|
| `paragraph` / `heading` / `blockquote` | `read` | 正常朗读 |
| `list` | `smart` | 短列表读，超长列表摘要 |
| `table` | `summarize` | 转成自然中文口语句子（需求 §13），绝不逐格念竖线 |
| `code_block` | `skip` | 跳过，可插入「这里包含一段代码示例，请查看页面内容。」 |
| `inline_code` | `smart` | 视上下文决定读法 |
| `mermaid` / `ascii_diagram` / `image` / `math_block` / `tool_log` | `skip` | 结构化/调试内容不朗读 |
| `url` | `label_only` | 不念 URL，只读链接文字 |

复杂表格与超长列表可选走 DSH LLM 摘要（`lib/polish.js` 的 `createSpeechSummarizer`）：`renderSpeechAsync` 优先用模型结果，失败回落同步规则摘要 —— **摘要永远不能让一次朗读卡住**。

---

## 5. 避免 TTS 被 STT 再次识别（需求 §21）

要避免的环路：

```text
TTS → Speaker → Microphone → STT → DSH → TTS → ...
```

V1 策略（简化但可用）：

```text
TTS Playing
     ↓
STT 不提交远程识别（本地 VAD 继续运行）
     ↓
检测到「真实用户说话」
     ↓
Stop TTS → Clear Speech Queue → 进入 STT LISTENING
```

- **不提交远程识别**：播放期间不向 STT Provider 发请求，从根上断开环路，不依赖任何声学处理。
- **保留本地 VAD**：环路断开后仍需知道「用户是否想打断」，所以 VAD 不停，只是不产生远程请求。
- **打断判定要保守**：播放期间的人声必须满足最小语音时长等条件才算打断，避免把扬声器漏音、环境噪声当成用户插话（宁可少打断，不要误打断）。

V1 不实现 AEC / Playback Reference / Full Duplex，但接口预留：

- 音频采集与播放分属不同模块，后续可插入 AEC 处理链；
- 打断判定收敛在浏览器半边的一个入口，后续可替换为「AEC + 播放参考」判定；
- Provider 接口（`transcribe` / `createStream`）与播放器解耦，后续全双工模式可作为**额外模式**接入，不破坏现有编排。

---

## 6. 为什么不用 Token 作为 TTS 单位（需求 §16 / §17）

流式回复不能「每个 Token 立刻送 TTS」：

```text
✗  LLM Token → TTS                      （错误）
✓  LLM Streaming → Speech Buffer → 完整 Block/句子 → Renderer → Queue → TTS
```

原因：

1. **不知道当前内容是什么**。TTS 必须先把内容分类成 paragraph / table / code / list / mermaid，否则会在表格和代码还没输出完时就开始错误朗读。
2. **代码块与表格会被念成噪声**。`| 模型 | 延迟 |` 逐行进入 TTS 只能念出竖线；围栏未闭合时代码会被当成正文。
3. **韵律与成本**。逐 Token 合成会产生大量碎片音频、请求数暴涨，且听感破碎。

因此最小单位优先级是：

```text
完整 Markdown Block  >  完整句子  >  Token
```

`Speech Buffer` 的实现约束（`lib/speech/buffer.js`）：代码围栏（```）未闭合**不得**吐内容；表格行未遇到空行不得吐；`mode: 'sentence'` 时在段落内按完整句子切分；`maxBlockChars` 超限时在逗号/空格处强制切分，避免一个超长段落把延迟拖死。Buffer 内部复用 `renderer.parseBlocks` / `renderSpeech`，保证与整段渲染结果一致。

---

## 7. V1 的关键取舍

| 取舍 | V1 决定 | 理由 / 后续 |
|---|---|---|
| AEC（回声消除） | **V1 暂不实现**；用「播放期间不提交远程识别」替代 | 无需声学处理即可断开 TTS→STT 环路；V2 再补 AEC 与播放参考 |
| Wake Word | **V1 暂不实现**；只保留配置位（`stt.wake_word`）与唤醒前缀模式 | 完整 Wake Word Engine 成本高；V1 用「整段相等 + 可选前缀」满足指令需求 |
| 指令判定 | 精确匹配（`command_mode: exact` / `wake` / `off`） | 简单、可预测、零误伤；V2 换 Command Classifier，调用方接口不变 |
| Full Duplex / Speech-to-Speech | **V1 暂不实现** | 只能作为额外模式，不能替代 DSH 现有 Session / Tool / Skill / Plugin / Memory 编排 |
| 本地 STT / TTS 大模型 | **V1 暂不实现** | V1 只做云端 Provider 抽象；Provider 可替换，后续可加本地实现 |
| 多人声源 / Speaker ID | **V1 暂不实现** | 需要额外模型与设备能力，与 V1 目标无关 |
| 流式能力差异 | 无原生流式的 Provider 走 `pseudo-stream.js` 伪流式 | 保证 UI 在两种 Provider 下都有一致的 partial 体验 |
| 润色与摘要失败 | 原样返回输入 / 回落到规则摘要 | 一次模型抖动不能卡住用户的语音输入（`lib/polish.js`） |
| 长草稿 | `maxUtterances` 默认 200，超出丢弃最旧 | 防止长时间监听下内存无界增长 |

后续阶段（V2 / V3）的完整清单见需求 §27；新增能力不得破坏两个核心中间对象的语义。
