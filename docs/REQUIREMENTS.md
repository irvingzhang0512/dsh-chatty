# DSH 语音插件需求说明书

> 项目名：`dsh-chatty`
>
> 定位：为 DeepSeek Harness（DSH）提供统一的语音输入、语音控制与语音输出能力。
>
> 核心目标：将语音作为 DSH 的一种长期可用的人机交互方式，而不是仅实现一次性的“录音转文字”或“文字转语音”。

---

## 1. 项目目标

插件需要提供三类核心能力：

1. **STT（Speech-to-Text）**
   - 通过麦克风进行语音输入。
   - 支持长时间监听。
   - 支持本地 VAD（Voice Activity Detection）判断是否有人声。
   - 有人声时再调用云端 STT 服务，避免无意义请求。
   - 支持流式和非流式 STT Provider。
   - 识别结果先进入 Voice Draft，不自动发送到当前 Session。

2. **Voice Control（语音控制）**
   - 支持发送、撤销、清空、取消、润色、停止监听等语音指令。
   - 普通语音内容与控制指令分离。
   - 润色等语义类操作可调用 DSH 当前 LLM。
   - 所有影响 Session 的操作均需有明确状态反馈。

3. **TTS（Text-to-Speech）**
   - 支持手动朗读 Assistant 最新回复。
   - 支持自动朗读 Assistant 最新回复。
   - 支持随时打断播放。
   - 支持 Speech Renderer，将 Markdown / 表格 / 代码等内容转换成适合语音朗读的内容。
   - 避免 TTS 播放内容被 STT 再次识别，形成“自己和自己对话”。

---

# 2. 整体架构

```text
┌──────────────────────────────────────────────┐
│                  DSH WEB                     │
│                                              │
│ 🎙 监听   ⏸ 暂停   ➤ 发送   🔊 朗读          │
│                                              │
│ ▁▂▅▇▃▂   正在聆听 / 正在识别 / 正在朗读       │
│                                              │
│ Voice Draft                                  │
│ 今天我们讨论一下 DSH 的语音插件……             │
└────────────────────┬─────────────────────────┘
                     │
               Voice Controller
                     │
       ┌─────────────┴──────────────┐
       │                            │
  STT Pipeline                  TTS Pipeline
       │                            │
 Audio Capture                 Speech Renderer
 Local VAD                     Speech Buffer
 Audio Buffer                  Speech Queue
 Voice Draft                   TTS Provider
 Command Parser                Audio Player
       │                            │
 ┌─────┴─────────┐           ┌──────┴─────────┐
 │ STT Provider  │           │ TTS Provider   │
 │ Volcano       │           │ Volcano        │
 │ SiliconFlow   │           │ SiliconFlow    │
 │ Others        │           │ Others         │
 └───────────────┘           └────────────────┘
```

核心设计原则：

- DSH Session 不直接与麦克风或 TTS Provider 耦合。
- STT / TTS Provider 必须可替换。
- 语音输入先进入 Voice Draft，再由用户或语音指令明确提交。
- 页面显示内容与 TTS 实际朗读内容允许不同。
- TTS 不改变原始 Assistant Message，只生成额外的 Speech Text。

---

# 3. STT 功能需求

## 3.1 STT Provider

第一阶段计划支持：

- 火山引擎 / 火山 Agent Plan
- 硅基流动

后续允许增加其他 Provider。

统一 Provider 接口应同时考虑两类能力：

```text
STTProvider

├── transcribe(audio)
│   └── 非流式 STT
│
└── createStream()
    ├── start()
    ├── pushAudio()
    ├── partialResult
    ├── finalResult
    └── stop()
```

Provider 应暴露自己的能力信息，例如：

```json
{
  "streaming": true,
  "timestamps": true,
  "languages": ["zh-CN"],
  "partial_result": true
}
```

UI 根据 Provider Capability 决定哪些配置项可以使用。

---

## 3.2 长时间监听

需要提供独立的“长时间监听”模式。

长时间监听不是持续上传整段音频，而是：

```text
麦克风持续打开
      ↓
本地 VAD
      ↓
检测是否有人声
      ↓
有人声
      ↓
创建一次 Utterance
      ↓
调用远程 STT
      ↓
静音达到阈值
      ↓
结束该 Utterance
      ↓
结果加入 Voice Draft
      ↓
继续监听
```

要求：

- 没有人声时不调用远程 STT。
- 一个 Utterance 结束后自动进入下一次监听。
- 不因为一次识别完成而退出长时间监听。
- 不因为一次识别完成而自动发送 Session。

---

## 3.3 本地 VAD

插件需要提供本地 Voice Activity Detection。

VAD 负责：

- 判断当前是否存在人声。
- 确定一个 Utterance 的开始。
- 判断静音持续时间。
- 确定一个 Utterance 的结束。

推荐支持以下参数：

```yaml
vad:
  enabled: true
  sensitivity: 0.6
  silence_timeout_ms: 1200
  min_speech_ms: 200
  pre_roll_ms: 400
```

---

## 3.4 Pre-roll Audio Buffer

需要维护短时间的 Ring Buffer。

推荐默认保留：

```text
300 ~ 500 ms
```

目的：

避免 VAD 检测到人声时，用户实际已经说出第一个字，造成句首丢失。

流程：

```text
持续保存最近 400 ms 音频
        ↓
VAD Trigger
        ↓
Pre-roll + 后续音频
        ↓
一起发送给 STT
```

---

# 4. Voice Draft

Voice Draft 是本插件最重要的交互概念之一。

## 4.1 Utterance 与 Voice Draft

### Utterance

一次连续说话。

例如：

```text
今天我们讨论一下语音插件。
```

### Voice Draft

多个 Utterance 组成的一次完整输入。

例如：

```text
Utterance 1：
今天我们讨论一下语音插件。

Utterance 2：
我觉得首先应该解决语音输入。

Utterance 3：
然后再解决语音输出。
```

最终 Voice Draft：

```text
今天我们讨论一下语音插件。
我觉得首先应该解决语音输入。
然后再解决语音输出。
```

核心原则：

> 一次说完不等于一次发送。

---

## 4.2 Voice Draft 操作

至少支持：

- 查看当前 Draft
- 添加识别结果
- 编辑文本
- 撤销最后一个 Utterance
- 清空
- 取消
- 润色
- 发送到当前 Session

---

# 5. 语音指令

## 5.1 第一阶段指令

建议至少支持：

| 指令 | 动作 |
|---|---|
| 发送 / 提交 | 将 Voice Draft 发送到当前 Session |
| 撤销 / 重说 | 删除最近一个 Utterance |
| 清空 | 清空整个 Voice Draft |
| 取消 | 取消当前 Voice Draft |
| 润色 | 调用 DSH LLM 润色当前 Draft |
| 停止录音 | 停止长时间监听 |
| 暂停 | 暂停监听 |
| 继续听 | 恢复监听 |
| 朗读 | 朗读当前 Assistant 回复 |
| 停止朗读 | 停止 TTS |

---

## 5.2 指令判断

不能简单使用字符串包含匹配。

例如：

```text
“发送”
```

可以识别为命令。

但：

```text
“这个请求发送以后需要等待服务器响应”
```

应该识别为普通正文。

第一阶段可采用：

- 一个 Utterance 只有指令词时执行命令。
- 可配置必须使用唤醒前缀，例如：
  - “DSH，发送”
  - “DSH，撤销”

后续可以增加 Command Classifier。

---

# 6. 润色功能

润色使用 DSH 当前 Session / 当前配置中的 LLM。

流程：

```text
Voice Draft
    ↓
调用 DSH LLM
    ↓
语音输入润色 Prompt
    ↓
Polished Draft
    ↓
用户继续查看 / 修改 / 发送
```

默认 Prompt 目标：

```text
将以下语音识别内容整理为自然、通顺的文字。
修正明显语音识别错误和口语重复。
不要改变原意。
不要增加用户没有表达的信息。
```

润色完成后仍然不能自动发送。

---

# 7. STT 工作模式

建议支持三种输入模式。

## 7.1 Push-to-Talk

```text
点击开始
↓
录音
↓
点击停止 / 自动静音结束
↓
识别
```

适用于短输入。

---

## 7.2 Continuous Listening

推荐作为插件的核心模式。

```text
开启长时间监听
↓
VAD 自动发现人声
↓
自动切分 Utterance
↓
持续累积 Voice Draft
↓
用户明确发送
```

---

## 7.3 Wake Word

后续能力。

```text
本地持续监听
↓
检测到 Wake Word
↓
进入 Voice Input
```

例如：

```text
DSH
小D
```

第一阶段可以仅预留接口，不要求实现。

---

# 8. 流式 STT

插件架构必须支持 Streaming STT。

## 8.1 非流式模式

```text
录音完成
↓
上传音频
↓
等待
↓
得到完整文本
```

优点：

- 实现简单。
- Provider 接口简单。

缺点：

- 延迟较高。
- 长时间交互体验较差。

---

## 8.2 流式模式

```text
麦克风
↓
持续发送音频
↓
Partial Result
↓
实时显示
↓
Final Result
↓
加入 Voice Draft
```

要求：

- UI 可以显示 Partial Result。
- Partial Result 不能直接加入正式 Draft。
- 收到 Final Result 后才形成最终 Utterance。
- STT Provider 连接异常后应允许自动重连。

---

# 9. STT UI

建议在 DSH Web 中提供常驻的小型 Voice Bar。

示例：

```text
🎙 长语音模式   ▁▂▄▇▅▂▁   正在聆听
```

状态包括：

```text
OFF
LISTENING
SPEECH_DETECTED
TRANSCRIBING
PAUSED
RECONNECTING
ERROR
```

Streaming STT 下，可以显示：

```text
今天我们讨论一下 DSH 的语音插件，
我觉得它应该首先支持……
                       ↑
                    Partial Result
```

Final Result 后再转为正式文本。

---

# 10. 音频可视化

监听期间需要提供音频反馈。

可选择：

- 音量柱状图
- Waveform
- 简化的动态音频条

第一阶段优先实现简单的实时音量柱或 Waveform。

可视化主要用于告诉用户：

- 麦克风正在工作。
- 当前检测到了声音。
- 当前是否正在识别人声。

---

# 11. TTS 总体要求

TTS 不应简单定义为：

```text
Assistant Text → TTS
```

而应该是：

```text
Assistant Response
      ↓
Speech Renderer
      ↓
Speech Text
      ↓
Speech Queue
      ↓
TTS Provider
      ↓
Audio Player
```

---

# 12. Speech Renderer

Speech Renderer 是 TTS 的核心模块。

目标：

> 将适合“看”的 LLM 输出转换为适合“听”的内容。

页面仍然显示完整 Markdown。

TTS 只朗读适合听的版本。

---

## 12.1 默认内容处理规则

| 内容 | 默认策略 |
|---|---|
| 普通段落 | 正常朗读 |
| 标题 | 正常朗读 |
| 简短列表 | 正常朗读 |
| 超长列表 | 摘要或部分朗读 |
| Markdown Table | 摘要 |
| Code Block | 跳过 |
| Inline Code | Smart |
| Mermaid | 跳过 |
| ASCII Diagram | 跳过 |
| URL | 不朗读 URL，只读标题 |
| Markdown Link | 只读链接文字 |
| Image | 默认跳过 |
| 数学公式 | 复杂公式默认跳过 |
| Tool Call | 跳过 |
| Tool Log | 跳过 |
| Debug 信息 | 跳过 |
| Citation / Reference ID | 不朗读 |

---

## 12.2 内容策略

Speech Renderer 每种 Block 支持：

```text
read
skip
summarize
smart
```

例如：

```yaml
speech_renderer:
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
```

---

# 13. 表格处理

表格不能直接逐行逐列朗读。

例如：

```text
| 模型 | 延迟 |
| A | 500 ms |
| B | 200 ms |
```

不能朗读成：

```text
模型，竖线，延迟……
```

推荐默认策略：

```text
table: summarize
```

Speech Renderer 可以将其转换为：

```text
这里比较了两个模型的延迟。
模型 A 大约 500 毫秒，模型 B 大约 200 毫秒，
其中模型 B 延迟更低。
```

简单表格可以使用规则转换。

复杂表格可以调用 DSH LLM 进行 Speech Summary。

---

# 14. 代码处理

Code Block 默认：

```text
skip
```

例如页面显示：

```python
def start():
    ...
```

TTS 不朗读代码。

可选地加入提示：

```text
这里包含一段代码示例，请查看页面内容。
```

此行为应可配置。

---

# 15. Display Response 与 Speech Response 分离

核心架构：

```text
                    ┌→ Display Renderer → DSH Web
Assistant Message ──┤
                    └→ Speech Renderer  → TTS
```

要求：

- Display Response 保留原始 Markdown。
- Speech Response 是临时生成的可朗读内容。
- Speech Response 不修改原始 Message。
- 用户停止 TTS 后，原始 Message 不受影响。

未来 DSH 如果支持结构化消息协议，可以进一步扩展：

```json
{
  "content": "完整 Markdown 内容",
  "speech": "适合朗读的内容"
}
```

但 V1 不依赖 DSH 协议改造。

---

# 16. Streaming LLM 与 TTS

如果 Assistant Response 是 Streaming 输出，不能每个 Token 立即进入 TTS。

错误方式：

```text
LLM Token
↓
TTS
```

正确方式：

```text
LLM Streaming
     ↓
Speech Buffer
     ↓
识别完整 Sentence / Markdown Block
     ↓
Speech Renderer
     ↓
Speech Queue
     ↓
TTS
```

原因：

需要先判断当前 Block 是：

- Paragraph
- Table
- Code
- List
- Mermaid
- Other

否则 TTS 可能在表格 / 代码尚未完整输出时就开始错误朗读。

---

# 17. Speech Buffer

Speech Buffer 负责：

- 缓冲 LLM Streaming 内容。
- 判断句子是否完成。
- 判断 Markdown Block 是否完成。
- 将完整 Block 发送到 Speech Renderer。

不建议使用 Token 作为 TTS 最小单位。

优先级：

```text
完整 Markdown Block
>
完整句子
>
Token
```

---

# 18. Speech Queue

Speech Queue 负责：

- 管理待播放文本。
- 支持分段播放。
- 支持取消。
- 支持用户打断。
- Assistant 新回复产生时可根据配置清空旧 Queue。

例如：

```text
Speech 1
Speech 2
Speech 3
```

用户点击 Stop：

```text
Audio Player Stop
+
Speech Queue Clear
```

但不删除 Assistant Message。

---

# 19. TTS Provider

统一 Provider 接口建议：

```text
TTSProvider

├── synthesize(text)
│
└── createStream(text)
    ├── audioChunk
    ├── end
    └── cancel
```

Provider Capability 示例：

```json
{
  "streaming": true,
  "voices": true,
  "speed": true,
  "emotion": false
}
```

---

# 20. TTS 功能

至少支持：

## 手动朗读

每条 Assistant Message 可有：

```text
🔊 朗读
```

## 自动朗读

配置：

```text
Auto Read Assistant Response
```

打开以后：

```text
Assistant 完成回复
↓
Speech Renderer
↓
自动 TTS
```

## 停止

提供：

```text
■ 停止朗读
```

## 用户讲话打断

配置：

```text
interrupt_on_speech: true
```

TTS 播放时如果检测到真实用户讲话：

```text
Stop TTS
↓
Clear Speech Queue
↓
进入 STT Listening
```

---

# 21. 避免 TTS 被 STT 再次识别

需要避免：

```text
TTS
↓
Speaker
↓
Microphone
↓
STT
↓
DSH
↓
TTS
```

第一阶段允许采用：

```text
TTS Playing
↓
STT 不提交远程识别
```

但需要保留本地 VAD，用于判断用户是否想打断。

后续可以增加：

- Acoustic Echo Cancellation
- Playback Reference
- Full Duplex Voice

V1 不要求完整 AEC。

---

# 22. 配置系统

建议分为 4 个配置区域。

---

## 22.1 Provider

```text
STT Provider
- Volcano
- SiliconFlow

TTS Provider
- Volcano
- SiliconFlow
```

要求：

- STT 和 TTS 可以选择不同 Provider。
- Provider 可以独立配置 Model。
- Provider 可以暴露 Capability。

---

## 22.2 Credentials

API Key 等敏感信息优先存储于：

```text
DSH Credentials
```

例如：

```text
volcano-speech
siliconflow
```

插件普通配置只存 Credential Reference：

```yaml
stt:
  provider: volcano
  credential: volcano-speech

tts:
  provider: siliconflow
  credential: siliconflow
```

禁止将真实 API Key 明文写入项目配置文件。

---

## 22.3 STT Config

示例：

```yaml
stt:
  provider: volcano
  model: xxx
  streaming: true
  language: zh-CN

  vad:
    enabled: true
    sensitivity: 0.6
    silence_timeout_ms: 1200
    min_speech_ms: 200
    pre_roll_ms: 400

  continuous_listening: true

  wake_word:
    enabled: false
    text: DSH
```

---

## 22.4 Voice Control Config

```yaml
voice_control:
  enabled: true
  command_mode: exact

  commands:
    send:
      - 发送
      - 提交

    undo:
      - 撤销
      - 重说

    clear:
      - 清空

    polish:
      - 润色

    cancel:
      - 取消

    stop_listening:
      - 停止录音
```

---

## 22.5 TTS Config

```yaml
tts:
  provider: volcano
  model: xxx
  voice: xxx
  speed: 1.0

  auto_read: false
  interrupt_on_speech: true

  renderer:
    table: summarize
    code_block: skip
    inline_code: smart
    mermaid: skip
    url: label_only
    image: skip
    math_block: skip
    tool_log: skip
```

---

# 23. UI 布局建议

## 23.1 DSH 主界面

提供一个 Voice Control Bar：

```text
🎙 长语音   ⏸   ➤发送   🔊朗读   ■停止
```

旁边显示：

```text
▁▂▅▇▃▂
正在聆听
```

---

## 23.2 Voice Draft

需要可以随时展开查看：

```text
Voice Draft
────────────────────────

今天我们讨论一下 DSH 的语音插件。
我觉得它首先应该支持长期监听……

────────────────────────

[撤销] [清空] [润色] [发送]
```

---

## 23.3 状态显示

必须让用户知道当前状态：

```text
未开启
正在监听
检测到语音
正在识别
等待继续说话
正在润色
正在发送
正在朗读
已暂停
正在重连
错误
```

---

# 24. 推荐状态机

## STT

```text
OFF
 ↓
LISTENING
 ↓
SPEECH_DETECTED
 ↓
TRANSCRIBING
 ↓
LISTENING
```

扩展状态：

```text
PAUSED
RECONNECTING
ERROR
```

---

## TTS

```text
IDLE
 ↓
PREPARING
 ↓
PLAYING
 ↓
IDLE
```

扩展：

```text
INTERRUPTED
ERROR
```

---

# 25. V1 范围

第一版重点实现：

- 麦克风录音
- Push-to-Talk
- Continuous Listening
- Local VAD
- Pre-roll Buffer
- Streaming / Batch STT Provider 抽象
- 火山 STT
- 硅基流动 STT
- Voice Draft
- Partial / Final Result
- 发送
- 撤销
- 清空
- 取消
- 润色
- Voice Bar
- 音频 Waveform / 音量条
- TTS Provider 抽象
- 火山 TTS
- 硅基流动 TTS
- 手动朗读
- 自动朗读
- Speech Renderer
- Code Skip
- Table Summary
- Speech Buffer
- Speech Queue
- Stop / Interrupt
- DSH Credentials 集成
- Provider / Model / Voice / VAD / TTS 配置

---

# 26. V1 暂不实现

以下能力放在后续：

- 完整 Wake Word Engine
- Acoustic Echo Cancellation
- 真正 Full Duplex
- Speech-to-Speech 大模型
- 多人声源区分
- Speaker Identification
- 本地 STT 大模型
- 本地 TTS 大模型

但接口设计时应避免阻碍后续增加这些能力。

---

# 27. 后续阶段

## V2

重点：

- Wake Word
- 更强的 Command Parser
- AEC
- 用户说话自动打断
- TTS / STT 并行状态管理
- 更智能的 Speech Renderer
- 多种 Voice Profile

## V3

可探索：

```text
Full Duplex Voice
Speech-to-Speech
Realtime Voice Agent
```

但这类模式不能破坏：

```text
DSH Session
Tool
Skill
Plugin
Memory
```

现有编排机制。

它应该是额外模式，而不是替代现有 DSH 架构。

---

# 28. 核心设计原则总结

整个插件围绕两个核心中间对象：

```text
Human Speech
     ↓
 Voice Draft
     ↓
DSH Session
```

以及：

```text
DSH Response
     ↓
Speech Response
     ↓
Human Listening
```

因此插件真正需要解决的不是简单的：

```text
Speech → Text
Text → Speech
```

而是：

```text
Speech
↓
适合 DSH 理解和操作的文本
↓
DSH
↓
适合页面阅读的完整内容
+
适合人耳收听的 Speech Content
```

---

# 29. 项目定位

建议项目描述：

> A voice interaction plugin for DeepSeek Harness, providing long-running speech input, voice commands, speech-friendly response rendering, and interruptible text-to-speech playback.

中文：

> 为 DSH 提供长期语音输入、语音指令、语音草稿、语音友好内容渲染和可打断 TTS 的统一语音交互插件。

