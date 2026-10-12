// dsh-chatty 配置定义（需求 §22）。
//
// 四个配置区：stt / tts / voice_control / draft(+ui/polish)。
// 红线：这里只出现 Credential Reference（例如 VOLCANO_SPEECH），
// 真实 API Key 一律存 DSH Credentials，禁止写进配置文件。
//
// 命名说明：DSH Credentials 的引用名只接受 `[A-Za-z_][A-Za-z0-9_]*`，
// 因此默认值是 VOLCANO_SPEECH 这种下划线大写形式；配置里照需求文档写
// `volcano-speech` 也能用，宿主会归一化成同一个引用（见 lib/credential-name.js）。

import { DEFAULT_COMMANDS } from './command-parser.js'

const POLICY_VALUES = 'read / skip / summarize / smart / label_only'

export function createConfig(z, { acceptLegacy = false } = {}) {
  const RendererPolicy = z
    .object({
      paragraph: z
        .union(['read', 'skip', 'summarize', 'smart', 'label_only'])
        .default('read')
        .description(`段落。${POLICY_VALUES}`),
      heading: z
        .union(['read', 'skip', 'summarize', 'smart', 'label_only'])
        .default('read')
        .description(`标题。${POLICY_VALUES}`),
      list: z
        .union(['read', 'skip', 'summarize', 'smart', 'label_only'])
        .default('smart')
        .description(`列表：短列表照读，超长列表摘要。${POLICY_VALUES}`),
      table: z
        .union(['read', 'skip', 'summarize', 'smart', 'label_only'])
        .default('summarize')
        .description(`Markdown 表格：默认摘要，绝不逐格朗读。${POLICY_VALUES}`),
      code_block: z
        .union(['read', 'skip', 'summarize', 'smart', 'label_only'])
        .default('skip')
        .description(`代码块：默认跳过。${POLICY_VALUES}`),
      inline_code: z
        .union(['read', 'skip', 'summarize', 'smart', 'label_only'])
        .default('smart')
        .description(`行内代码：短标识符照读，长片段跳过。${POLICY_VALUES}`),
      mermaid: z
        .union(['read', 'skip', 'summarize', 'smart', 'label_only'])
        .default('skip')
        .description(`Mermaid 图：跳过。${POLICY_VALUES}`),
      ascii_diagram: z
        .union(['read', 'skip', 'summarize', 'smart', 'label_only'])
        .default('skip')
        .description(`ASCII 图：跳过。${POLICY_VALUES}`),
      url: z
        .union(['read', 'skip', 'summarize', 'smart', 'label_only'])
        .default('label_only')
        .description(`URL：不朗读地址本身，只读链接文字。${POLICY_VALUES}`),
      image: z
        .union(['read', 'skip', 'summarize', 'smart', 'label_only'])
        .default('skip')
        .description(`图片：默认跳过。${POLICY_VALUES}`),
      math_block: z
        .union(['read', 'skip', 'summarize', 'smart', 'label_only'])
        .default('skip')
        .description(`数学公式：复杂公式默认跳过。${POLICY_VALUES}`),
      tool_log: z
        .union(['read', 'skip', 'summarize', 'smart', 'label_only'])
        .default('skip')
        .description(`工具调用与日志：跳过。${POLICY_VALUES}`),
      blockquote: z
        .union(['read', 'skip', 'summarize', 'smart', 'label_only'])
        .default('read')
        .description(`引用块。${POLICY_VALUES}`)
    })
    .default({})

  const Vad = z
    .object({
      enabled: z
        .boolean()
        .default(true)
        .description(
          '是否启用本地 VAD。关闭后录音会连续上传（不建议长时间监听时使用）。'
        ),
      sensitivity: z
        .number()
        .min(0)
        .max(1)
        .default(0.6)
        .description('VAD 灵敏度 0~1，越大越容易判定为人声。'),
      silence_timeout_ms: z
        .number()
        .min(100)
        .max(10000)
        .default(1200)
        .description('静音持续多久判定一个 Utterance 结束。'),
      min_speech_ms: z
        .number()
        .min(0)
        .max(5000)
        .default(200)
        .description('短于该时长的人声片段丢弃，避免咳嗽/碰麦被当成一句话。'),
      pre_roll_ms: z
        .number()
        .min(0)
        .max(3000)
        .default(400)
        .description(
          '人声触发前额外回传的音频长度，避免句首丢字（需求 §3.4）。'
        )
    })
    .default({})

  const Config = z
    .object({
      stt: z
        .object({
          providers: z
            .object({
              volcano: z
                .object({
                  model: z.string().default('doubao-seed-asr-2.0'),
                  credential: z
                    .string()
                    .default('VOLCENGINE_AGENT_PLAN_API_KEY'),
                  batch_url: z
                    .string()
                    .default(
                      'wss://openspeech.bytedance.com/api/v3/plan/sauc/bigmodel_nostream'
                    ),
                  stream_url: z
                    .string()
                    .default(
                      'wss://openspeech.bytedance.com/api/v3/plan/sauc/bigmodel_async'
                    ),
                  resource_id: z.string().default('volc.seedasr.sauc.duration')
                })
                .default({}),
              siliconflow: z
                .object({
                  model: z.string().default('FunAudioLLM/SenseVoiceSmall'),
                  credential: z.string().default('SILICONFLOW_API_KEY'),
                  base_url: z.string().default('https://api.siliconflow.cn/v1')
                })
                .default({})
            })
            .default({}),
          max_segment_seconds: z
            .number()
            .min(1)
            .max(120)
            .default(30)
            .description('最长一句（秒）'),
          max_pending: z
            .natural()
            .min(1)
            .max(32)
            .default(4)
            .description('待处理句上限'),
          stream_idle_timeout_ms: z
            .natural()
            .min(1000)
            .max(120000)
            .default(15000)
            .description('流式空闲超时（毫秒）'),
          streaming: z
            .boolean()
            .default(true)
            .description('优先使用流式识别；Provider 不支持时自动回落到批量。'),
          auto_start: z
            .boolean()
            .default(false)
            .description('进入页面后是否自动开启长时间监听。'),
          partial_preview: z
            .boolean()
            .default(true)
            .description(
              '流式识别时在界面上显示 Partial Result（不会进入 Voice Draft）。'
            ),
          vad: Vad
        })
        .default({}),

      tts: z
        .object({
          provider: z
            .union(['volcano', 'siliconflow'])
            .default('volcano')
            .description(
              'TTS Provider：volcano（Agent Plan 语音合成 2.0，默认，与 STT 同一把方舟 API Key）/ siliconflow。'
            ),
          providers: z
            .object({
              volcano: z
                .object({
                  voice: z
                    .string()
                    .default('zh_female_shuangkuaisisi_uranus_bigtts'),
                  credential: z
                    .string()
                    .default('VOLCENGINE_AGENT_PLAN_API_KEY'),
                  base_url: z
                    .string()
                    .default(
                      'https://openspeech.bytedance.com/api/v3/plan/tts/unidirectional'
                    ),
                  resource_id: z.string().default('seed-tts-2.0')
                })
                .default({}),
              siliconflow: z
                .object({
                  model: z.string().default('FunAudioLLM/CosyVoice2-0.5B'),
                  voice: z.string().default('FunAudioLLM/CosyVoice2-0.5B:alex'),
                  credential: z.string().default('SILICONFLOW_API_KEY'),
                  base_url: z.string().default('https://api.siliconflow.cn/v1')
                })
                .default({})
            })
            .default({}),
          speed: z
            .number()
            .min(0.5)
            .max(2)
            .default(1.0)
            .description('语速倍率。'),
          format: z
            .union(['pcm', 'mp3', 'wav'])
            .default('pcm')
            .description(
              '输出格式：pcm（浏览器 WebAudio 直接播放）/ mp3 / wav。'
            ),
          sample_rate: z
            .union([16000, 24000, 32000, 44100, 48000])
            .default(24000)
            .description('输出采样率。'),
          volume: z
            .number()
            .min(0)
            .max(1)
            .default(1.0)
            .description('浏览器端播放音量 0~1。'),
          auto_read: z
            .boolean()
            .default(false)
            .description('Assistant 回复完成后自动朗读。'),
          interrupt_on_speech: z
            .boolean()
            .default(true)
            .description('朗读期间检测到用户讲话时停止朗读并进入监听。'),
          code_hint: z
            .boolean()
            .default(true)
            .description(
              '跳过代码块时朗读一句「这里包含一段代码示例，请查看页面内容」。'
            ),
          llm_summary: z
            .boolean()
            .default(false)
            .description('复杂表格/长列表允许调用 DSH 当前 LLM 生成语音摘要。'),
          summary_prompt: z
            .string()
            .default('')
            .description('语音摘要 Prompt 覆盖。留空使用内置 Prompt。'),
          max_chars: z
            .natural()
            .min(1)
            .max(4000)
            .default(4000)
            .description('单次合成的最大字符数。'),
          renderer: RendererPolicy
        })
        .default({}),

      voice_control: z
        .object({
          enabled: z
            .boolean()
            .default(true)
            .description('是否允许用语音指令控制 Voice Draft。'),
          command_mode: z
            .union(['exact', 'wake', 'off'])
            .default('exact')
            .description(
              'exact：整句等于指令词才执行；wake：必须带唤醒前缀（DSH，发送）；off：关闭。'
            ),
          wake_prefix: z
            .string()
            .default('DSH')
            .description('wake 模式的唤醒前缀。'),
          wake_words: z
            .array(z.string())
            .default([])
            .description('文字口令前缀别名，例如 小D；不单独唤醒麦克风。'),
          commands: z
            .dict(z.array(z.string()))
            .default(DEFAULT_COMMANDS)
            .description(
              '指令词表：动作名 → 说法列表。默认值见 lib/command-parser.js。'
            )
        })
        .default({}),

      draft: z
        .object({
          max_utterances: z
            .natural()
            .min(1)
            .max(1000)
            .default(200)
            .description('保留的最大 Utterance 数。'),
          separator: z
            .string()
            .default('\n')
            .description('多个 Utterance 合成草稿时的连接符。'),
          polish_on_command: z
            .boolean()
            .default(true)
            .description('说出「润色」指令时是否允许调用 LLM 润色。')
        })
        .default({}),

      polish: z
        .object({
          enabled: z
            .boolean()
            .default(true)
            .description('是否允许润色与语音摘要调用模型。'),
          prompt: z
            .string()
            .default('')
            .description('润色 Prompt 覆盖。留空使用内置 Prompt。'),
          provider: z
            .string()
            .default('')
            .description(
              '润色使用的 LLM provider。留空跟随当前 Session 模型。'
            ),
          model_id: z
            .string()
            .default('')
            .description('润色使用的模型。留空跟随当前 Session 模型。'),
          base_url: z
            .string()
            .default('')
            .description('OpenAI 兼容端点。填写后不再走 DSH LLM。'),
          key_env: z
            .string()
            .default('')
            .description('OpenAI 兼容端点的凭据名。')
        })
        .default({}),

      ui: z
        .object({
          show_voice_bar: z
            .boolean()
            .default(true)
            .description('在输入框右侧显示 Voice Bar。'),
          show_draft_panel: z
            .boolean()
            .default(true)
            .description('显示 Voice Draft 面板。'),
          visualizer: z
            .union(['bars', 'off'])
            .default('bars')
            .description('音频可视化：bars / off。'),
          panel_width: z
            .number()
            .min(280)
            .max(1600)
            .default(720)
            .description('语音面板最大宽度（px）。')
        })
        .default({}),

      timeout_ms: z
        .natural()
        .min(1000)
        .max(3600000)
        .default(120000)
        .description('单次 STT/TTS 请求的总超时。'),
      mic_device_id: z
        .string()
        .default('')
        .description('麦克风设备 ID。留空使用系统默认设备。'),
      noise_suppression: z
        .boolean()
        .default(true)
        .description('请求浏览器开启降噪、回声消除与自动增益。'),
      echo_cancellation: z
        .boolean()
        .default(true)
        .description('单独控制浏览器回声消除（V1 不做服务端 AEC）。'),
      auto_gain_control: z
        .boolean()
        .default(true)
        .description('请求浏览器自动增益控制。')
    })
    .description('dsh-chatty：持续听写与独立朗读。')
    .volatile()

  if (acceptLegacy) {
    const visit = (schema) => {
      if (schema.type === 'number') {
        delete schema.meta.min
        delete schema.meta.max
      }
      if (schema.dict)
        for (const child of Object.values(schema.dict)) visit(child)
      if (schema.list) for (const child of schema.list) visit(child)
    }
    visit(Config)
    Config.dict.ui.dict.visualizer.list.push(z.const('wave'))
  }
  return Config
}
export default createConfig
