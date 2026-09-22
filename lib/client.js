
// ---- lib/client-src/00-open.js ----
// dsh-chatty — 浏览器半边（client half）。
//
// 三个挂载点：
//   conversation.input.right — Voice Bar：长语音开关 / 暂停 / 发送 / 朗读 / 停止；
//   conversation.input.dock  — Voice Draft 面板：草稿文本、Partial Result、撤销/清空/润色/发送；
//   plugins.item 等          — 设置卡：Provider / 凭据 / VAD / 指令 / TTS 渲染策略。
//
// 浏览器半边负责麦克风、本地 VAD、可视化、音频播放与 composer 写入；
// 语音指令判定、Voice Draft 状态、润色与 Provider 调用都在宿主侧完成。

window.__ModuleLoader__.load({
  id: '@irvingzhang0512/dsh-chatty',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    const React = require('react')

    let PRIM = null
    try { PRIM = require('@deepseek-ai/dsh-client-ui-primitives') } catch (noPrim) { /* 老版本 DSH 没有原语包 */ }

    const NS = 'dsh-chatty'
    const PKG = '@irvingzhang0512/dsh-chatty'
    const ROW_ID = 'dsh-chatty'
    const ROW_CONFIG_KEY = PKG + '#' + ROW_ID

// ---- lib/client-src/10-locale.js ----
    // ── 本地化 ────────────────────────────────────────────────────────
    // 文案走 locale 注册表：英文是源语言与兜底，中文是默认展示语言。
    let moduleT = (key) => key
    function t(key, params) {
      const text = moduleT(key)
      if (!params) return text
      return String(text).replace(/\{(\w+)\}/g, (m, name) => (params[name] === undefined ? m : String(params[name])))
    }

    const en = {
      title: 'Voice',
      barSlot: 'Voice bar',
      draftSlot: 'Voice draft',
      cardHint: 'Long-running speech input, voice commands and interruptible read-aloud',
      listening: 'Listening',
      speechDetected: 'Speech detected',
      transcribing: 'Transcribing',
      paused: 'Paused',
      reconnecting: 'Reconnecting',
      off: 'Off',
      error: 'Error',
      startListening: 'Start long-running listening',
      stopListening: 'Stop listening',
      pauseListening: 'Pause listening',
      resumeListening: 'Resume listening',
      sendDraft: 'Send voice draft',
      readReply: 'Read the latest reply aloud',
      stopSpeaking: 'Stop reading',
      draftTitle: 'Voice draft',
      draftEmpty: 'Nothing recognized yet. Speak, then send when you are ready.',
      partial: 'Partial result',
      undo: 'Undo last utterance',
      clear: 'Clear draft',
      polish: 'Polish',
      polishing: 'Polishing…',
      sending: 'Sending…',
      reading: 'Reading aloud',
      preparing: 'Preparing speech',
      interrupted: 'Interrupted',
      polished: 'Polished',
      cleared: 'Draft cleared',
      undone: 'Last utterance removed',
      sent: 'Sent to the session',
      nothingToUndo: 'Nothing to undo',
      composerUnavailable: 'Composer is not available right now',
      micDenied: 'Microphone permission denied',
      micUnavailable: 'No microphone available',
      command: 'Command: {name}',
      send: 'Send',
      cancel: 'Cancel',
      close: 'Close',
      settings: 'Voice settings',
      provider: 'Provider',
      credential: 'Credential',
      vad: 'Voice activity detection',
      sensitivity: 'Sensitivity',
      silenceTimeout: 'Silence timeout (ms)',
      minSpeech: 'Minimum speech (ms)',
      preRoll: 'Pre-roll buffer (ms)',
      continuous: 'Continuous listening on load',
      partialPreview: 'Show partial results',
      streaming: 'Streaming recognition',
      commandMode: 'Command mode',
      wakePrefix: 'Wake prefix',
      autoRead: 'Read replies automatically',
      interruptOnSpeech: 'Interrupt reading when I speak',
      speed: 'Speed',
      volume: 'Volume',
      voice: 'Voice',
      format: 'Audio format',
      codeHint: 'Announce skipped code blocks',
      llmSummary: 'Use the model to summarize tables',
      save: 'Save',
      saved: 'Saved',
      reload: 'Reload',
      unsupported: 'This browser does not support microphone capture',
    }

    const zh = {
      title: '语音',
      barSlot: '语音工具条',
      draftSlot: '语音草稿',
      cardHint: '长期语音输入、语音指令与可打断的朗读',
      listening: '正在聆听',
      speechDetected: '检测到语音',
      transcribing: '正在识别',
      paused: '已暂停',
      reconnecting: '正在重连',
      off: '未开启',
      error: '错误',
      startListening: '开始长时间监听',
      stopListening: '停止监听',
      pauseListening: '暂停监听',
      resumeListening: '继续听',
      sendDraft: '发送语音草稿',
      readReply: '朗读最新回复',
      stopSpeaking: '停止朗读',
      draftTitle: '语音草稿',
      draftEmpty: '还没有识别内容。说完后确认再发送。',
      partial: '实时识别中',
      undo: '撤销最后一段',
      clear: '清空草稿',
      polish: '润色',
      polishing: '正在润色…',
      sending: '正在发送…',
      reading: '正在朗读',
      preparing: '正在准备语音',
      interrupted: '已打断',
      polished: '已润色',
      cleared: '草稿已清空',
      undone: '已撤销最后一段',
      sent: '已发送到当前会话',
      nothingToUndo: '没有可撤销的内容',
      composerUnavailable: '当前无法写入输入框',
      micDenied: '麦克风权限被拒绝',
      micUnavailable: '没有可用的麦克风',
      command: '指令：{name}',
      send: '发送',
      cancel: '取消',
      close: '关闭',
      settings: '语音设置',
      provider: '服务提供方',
      credential: '凭据',
      vad: '人声检测（VAD）',
      sensitivity: '灵敏度',
      silenceTimeout: '静音判定（毫秒）',
      minSpeech: '最短人声（毫秒）',
      preRoll: '前置缓冲（毫秒）',
      continuous: '进入页面即开始长时间监听',
      partialPreview: '显示实时识别结果',
      streaming: '流式识别',
      commandMode: '指令模式',
      wakePrefix: '唤醒前缀',
      autoRead: '自动朗读回复',
      interruptOnSpeech: '我说话时打断朗读',
      speed: '语速',
      volume: '音量',
      voice: '音色',
      format: '音频格式',
      codeHint: '跳过代码块时给出提示',
      llmSummary: '允许模型生成表格语音摘要',
      save: '保存',
      saved: '已保存',
      reload: '重新加载',
      unsupported: '当前浏览器不支持麦克风采集',
    }

// ---- lib/client-src/20-css.js ----
    // ── 样式 ──────────────────────────────────────────────────────────
    // 全部挂在 .dch- 前缀下，避免与 DSH 主体或其它插件冲突。
    const CHATTY_CSS = `
.dch-toolbar { display: flex; align-items: center; gap: 4px; }
.dch-btn { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px;
  padding: 0; border: none; border-radius: 50%; background: transparent; color: inherit; cursor: pointer; }
.dch-btn:hover:not(:disabled) { background: var(--dsw-alias-bg-secondary, rgba(127,127,127,.16)); }
.dch-btn:disabled { opacity: .45; cursor: default; }
.dch-btn[data-active="1"] { color: var(--dsw-alias-state-error-primary, #d9534f); }
.dch-status { font-size: 12px; opacity: .75; white-space: nowrap; }
.dch-status[data-error="1"] { color: var(--dsw-alias-state-error-primary, #d9534f); opacity: 1; }
.dch-pill { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 6px 10px;
  border: 1px solid var(--dsw-alias-border-secondary, rgba(127,127,127,.25)); border-radius: 10px;
  background: var(--dsw-alias-bg-secondary, rgba(127,127,127,.06)); font-size: 12px; }
.dch-pill-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.dch-draft-title { font-weight: 600; opacity: .8; }
.dch-draft-text { width: 100%; min-height: 62px; resize: vertical; font: inherit; font-size: 12px;
  padding: 6px 8px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-secondary, rgba(127,127,127,.3));
  background: var(--dsw-alias-bg-primary, transparent); color: inherit; }
.dch-partial { font-size: 12px; opacity: .7; font-style: italic; white-space: pre-wrap; }
.dch-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.dch-action { font-size: 12px; padding: 3px 10px; border-radius: 999px; cursor: pointer;
  border: 1px solid var(--dsw-alias-border-secondary, rgba(127,127,127,.3)); background: transparent; color: inherit; }
.dch-action:hover:not(:disabled) { background: var(--dsw-alias-bg-secondary, rgba(127,127,127,.14)); }
.dch-action:disabled { opacity: .45; cursor: default; }
.dch-action[data-primary="1"] { border-color: transparent; background: var(--dsw-alias-bg-accent, #3b82f6); color: #fff; }
.dch-levels { display: inline-flex; align-items: flex-end; gap: 2px; height: 16px; }
.dch-levels span { display: block; width: 3px; border-radius: 2px; background: currentColor; opacity: .65; }
.dch-notice { font-size: 12px; opacity: .8; }
.dch-dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; opacity: .8; }
.dch-dot[data-on="1"] { background: var(--dsw-alias-state-error-primary, #d9534f); animation: dch-pulse 1.1s infinite; }
@keyframes dch-pulse { 0%,100% { opacity: 1 } 50% { opacity: .3 } }
.dch-card { border: 1px solid var(--dsw-alias-border-secondary, rgba(127,127,127,.25)); border-radius: 10px; margin-top: 8px; }
.dch-card-head { display: flex; align-items: center; justify-content: space-between; gap: 8px;
  width: 100%; padding: 8px 12px; background: transparent; border: none; color: inherit; cursor: pointer; text-align: left; }
.dch-card-body { padding: 4px 12px 12px; display: flex; flex-direction: column; gap: 10px; }
.dch-field { display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
.dch-field > label { opacity: .75; }
.dch-field input[type="text"], .dch-field input[type="number"], .dch-field select {
  font: inherit; font-size: 12px; padding: 4px 6px; border-radius: 6px; color: inherit;
  border: 1px solid var(--dsw-alias-border-secondary, rgba(127,127,127,.3)); background: transparent; }
.dch-row { display: flex; gap: 8px; flex-wrap: wrap; }
.dch-row > .dch-field { flex: 1 1 140px; }
.dch-check { display: flex; align-items: center; gap: 6px; font-size: 12px; }
.dch-section-title { font-size: 12px; font-weight: 600; opacity: .8; margin-top: 4px; }
.dch-muted { font-size: 11px; opacity: .6; }
`

    let chattyStyleInstalled = false
    function installChattyStyle() {
      if (chattyStyleInstalled || typeof document === 'undefined') return
      chattyStyleInstalled = true
      const style = document.createElement('style')
      style.setAttribute('data-dsh-chatty', '1')
      style.textContent = CHATTY_CSS
      document.head.appendChild(style)
    }

// ---- lib/client-src/30-core.js ----
    // ── 状态仓库 ──────────────────────────────────────────────────────
    //
    // STT 状态机（需求 §24）：
    //   OFF → LISTENING → SPEECH_DETECTED → TRANSCRIBING → LISTENING
    //   扩展：PAUSED / RECONNECTING / ERROR
    // TTS 状态机：
    //   IDLE → PREPARING → PLAYING → IDLE
    //   扩展：INTERRUPTED / ERROR
    const chatty = {
      sessionId: '',
      sttPhase: 'OFF',      // OFF | LISTENING | SPEECH_DETECTED | TRANSCRIBING | PAUSED | RECONNECTING | ERROR
      ttsPhase: 'IDLE',     // IDLE | PREPARING | PLAYING | INTERRUPTED | ERROR
      sttError: '',
      ttsError: '',
      levels: [],
      partial: '',
      draft: { text: '', size: 0, utterances: [] },
      notice: '',
      busy: '',
      supported: true,
      settings: null,       // 宿主 /status 下发的实时配置
      inputActions: null,
      input: null,
      lastRenderedDraft: null,
      listeners: new Set(),
      notify() { this.listeners.forEach((listener) => listener()) },
      set(patch) { Object.assign(this, patch); this.notify() },
      subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener) },
    }

    function useChatty() {
      const [, force] = React.useReducer((value) => value + 1, 0)
      React.useEffect(() => chatty.subscribe(force), [])
      return chatty
    }

    function setSttPhase(phase, error) {
      chatty.sttPhase = phase
      if (error !== undefined) chatty.sttError = error || ''
      chatty.notify()
    }

    function setTtsPhase(phase, error) {
      chatty.ttsPhase = phase
      if (error !== undefined) chatty.ttsError = error || ''
      chatty.notify()
    }

    let noticeTimer = null
    function showNotice(message) {
      chatty.notice = message || ''
      chatty.notify()
      if (noticeTimer) clearTimeout(noticeTimer)
      if (!message) return
      noticeTimer = setTimeout(() => {
        if (chatty.notice === message) { chatty.notice = ''; chatty.notify() }
      }, 1800)
    }

    function sttStatusText() {
      const settings = chatty.settings
      switch (chatty.sttPhase) {
        case 'LISTENING': return t('listening')
        case 'SPEECH_DETECTED': return t('speechDetected')
        case 'TRANSCRIBING': return t('transcribing')
        case 'PAUSED': return t('paused')
        case 'RECONNECTING': return t('reconnecting')
        case 'ERROR': return chatty.sttError || t('error')
        default: return t('off')
      }
    }

    function ttsStatusText() {
      switch (chatty.ttsPhase) {
        case 'PREPARING': return t('preparing')
        case 'PLAYING': return t('reading')
        case 'INTERRUPTED': return t('interrupted')
        case 'ERROR': return chatty.ttsError || t('error')
        default: return ''
      }
    }

    // ── 图标（16px / 1.5 描边，与 DSH 图标库一致） ────────────────────
    const CHATTY_ICON = { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }
    const iconMic = () => React.createElement('svg', CHATTY_ICON,
      React.createElement('rect', { x: 6, y: 2.75, width: 4, height: 6.75, rx: 2 }),
      React.createElement('path', { d: 'M3.75 7.25a4.25 4.25 0 0 0 8.5 0' }),
      React.createElement('path', { d: 'M8 11.75v1.5M5.25 13.25h5.5' }))
    const iconPause = () => React.createElement('svg', CHATTY_ICON,
      React.createElement('rect', { x: 4, y: 3, width: 3, height: 10, rx: 1, fill: 'currentColor', stroke: 'none' }),
      React.createElement('rect', { x: 9, y: 3, width: 3, height: 10, rx: 1, fill: 'currentColor', stroke: 'none' }))
    const iconPlay = () => React.createElement('svg', CHATTY_ICON,
      React.createElement('polygon', { points: '5 3.5 13.5 8 5 12.5 5 3.5', fill: 'currentColor', stroke: 'none' }))
    const iconStop = () => React.createElement('svg', CHATTY_ICON,
      React.createElement('rect', { x: 4.5, y: 4.5, width: 7, height: 7, rx: 1.75, fill: 'currentColor', stroke: 'none' }))
    const iconSpeaker = () => React.createElement('svg', CHATTY_ICON,
      React.createElement('path', { d: 'M3 6.25h2L8 3.75v8.5L5 9.75H3z' }),
      React.createElement('path', { d: 'M10.5 6a3 3 0 0 1 0 4' }),
      React.createElement('path', { d: 'M12.25 4.25a5.5 5.5 0 0 1 0 7.5' }))
    const iconClose = () => React.createElement('svg', CHATTY_ICON,
      React.createElement('line', { x1: 12, y1: 4, x2: 4, y2: 12 }),
      React.createElement('line', { x1: 4, y1: 4, x2: 12, y2: 12 }))
    const iconSend = () => React.createElement('svg', CHATTY_ICON,
      React.createElement('path', { d: 'M2.5 8l11-5-4 11-2.5-4z' }))
    const iconUndo = () => React.createElement('svg', CHATTY_ICON,
      React.createElement('path', { d: 'M3 7h6.5a3.5 3.5 0 0 1 0 7H6' }),
      React.createElement('path', { d: 'M5.5 4.5L3 7l2.5 2.5' }))

    function chattyButton(spec) {
      if (PRIM && PRIM.Button && PRIM.Tooltip) {
        return React.createElement(PRIM.Tooltip, { label: spec.label, side: 'top', delayMs: 500 },
          React.createElement(PRIM.Button, {
            type: 'button', variant: 'toolbar', size: 'sm', icon: spec.icon,
            'aria-label': spec.label, disabled: spec.disabled, onClick: spec.onClick,
            'data-active': spec.active ? '1' : undefined,
          }))
      }
      return React.createElement('button', {
        type: 'button', className: 'dch-btn', title: spec.label, 'aria-label': spec.label,
        disabled: spec.disabled, onClick: spec.onClick, 'data-active': spec.active ? '1' : undefined,
      }, spec.icon)
    }

    // ── 传输 ──────────────────────────────────────────────────────────
    async function postJson(url, body, options = {}) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: options.signal,
        body: JSON.stringify(body || {}),
      })
      let parsed = null
      try { parsed = await res.json() } catch { /* 非 JSON 响应 */ }
      if (!res.ok || !parsed || parsed.ok !== true) {
        const message = (parsed && parsed.error && parsed.error.message) || `HTTP ${res.status}`
        const error = new Error(message)
        error.code = parsed && parsed.error && parsed.error.code
        throw error
      }
      return parsed
    }

    async function getJson(url) {
      const res = await fetch(url, { cache: 'no-store' })
      const parsed = await res.json().catch(() => null)
      if (!res.ok || !parsed || parsed.ok !== true) {
        throw new Error((parsed && parsed.error && parsed.error.message) || `HTTP ${res.status}`)
      }
      return parsed
    }

    function blobToBase64(blob) {
      return new Promise((resolve, reject) => {
        if (typeof FileReader === 'undefined') { reject(new Error('FileReader not supported')); return }
        const reader = new FileReader()
        reader.onload = () => {
          const text = String(reader.result || '')
          resolve(text.indexOf(',') >= 0 ? text.slice(text.indexOf(',') + 1) : text)
        }
        reader.onerror = () => reject(new Error('failed to read audio'))
        reader.readAsDataURL(blob)
      })
    }

    function bytesToBase64(bytes) {
      let binary = ''
      const chunk = 0x8000
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
      }
      return btoa(binary)
    }

    // 裸 PCM16 → WAV：批量模式下只接受容器格式的 Provider 需要它。
    function pcm16ToWavClient(pcm, sampleRate) {
      const header = new ArrayBuffer(44)
      const view = new DataView(header)
      const write = (offset, text) => { for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i)) }
      write(0, 'RIFF')
      view.setUint32(4, 36 + pcm.length, true)
      write(8, 'WAVE')
      write(12, 'fmt ')
      view.setUint32(16, 16, true)
      view.setUint16(20, 1, true)
      view.setUint16(22, 1, true)
      view.setUint32(24, sampleRate, true)
      view.setUint32(28, sampleRate * 2, true)
      view.setUint16(32, 2, true)
      view.setUint16(34, 16, true)
      write(36, 'data')
      view.setUint32(40, pcm.length, true)
      const out = new Uint8Array(44 + pcm.length)
      out.set(new Uint8Array(header), 0)
      out.set(pcm, 44)
      return out
    }

    // ── composer 镜像 ────────────────────────────────────────────────
    //
    // 宿主是 Voice Draft 的权威副本；草稿变化后镜像到 composer，
    // 用户可以继续用键盘修改后手动发送。镜像只做单向写入，
    // 避免「composer ↔ 宿主」双向同步的抖动。
    function mirrorDraftToComposer(text) {
      const actions = chatty.inputActions
      if (!actions || typeof actions.setDraft !== 'function') return false
      chatty.lastRenderedDraft = text
      try { actions.setDraft(text) } catch { return false }
      return true
    }

    function draftIsEmpty() {
      return !chatty.draft || !String(chatty.draft.text || '').trim()
    }

    // ── 宿主配置刷新 ─────────────────────────────────────────────────
    let chattySettingsLoaded = false
    async function refreshChattySettings() {
      try {
        const data = await getJson('/dsh-chatty/status')
        chatty.settings = data
        chattySettingsLoaded = true
        chatty.notify()
        return data
      } catch (error) {
        chatty.settings = chatty.settings || null
        chatty.sttError = String(error && error.message || error)
        chatty.notify()
        return null
      }
    }

    function chattySetting(path, fallback) {
      const settings = chatty.settings
      if (!settings) return fallback
      const parts = String(path).split('.')
      let value = settings
      for (const part of parts) {
        if (value == null) return fallback
        value = value[part]
      }
      return value === undefined ? fallback : value
    }

// ---- lib/client-src/40-audio.js ----
    // ── 音频采集 + 本地 VAD + Pre-roll（需求 §3.2 / §3.3 / §3.4 / §10）──
    //
    // 设计要点：
    //  - 麦克风常开，本地判断是否有人声；没有人声就不调用远程 STT；
    //  - 维护 pre_roll_ms 的环形缓冲，人声触发时把它一起送出去，避免句首丢字；
    //  - 静音达到 silence_timeout_ms 判定一个 Utterance 结束，随后自动进入下一次监听；
    //  - 采集统一重采样到 16k PCM16，Provider 侧不需要关心浏览器采样率。
    //
    // 回调（由 45-stt.js 提供）：
    //   onSpeechStart(preRollPcm)  人声开始，携带前置缓冲
    //   onFrame(pcm)               说话过程中的每一帧（流式 STT 持续推送）
    //   onSpeechEnd(pcm, info)     一个 Utterance 结束，携带完整 PCM
    //   onSpeechDiscard(info)      太短的人声片段，丢弃
    //   onLevel(levels)            可视化用的音量柱
    //   onError(error)

    const TARGET_SAMPLE_RATE = 16000

    const audioEngine = {
      running: false,
      paused: false,
      stream: null,
      audioCtx: null,
      source: null,
      analyser: null,
      processor: null,
      callbacks: {},
      vad: { enabled: true, sensitivity: 0.6, silence_timeout_ms: 1200, min_speech_ms: 200, pre_roll_ms: 400 },
      sampleRate: TARGET_SAMPLE_RATE,
      levels: [],
      noiseFloor: 0.005,
      speaking: false,
      speechFrames: 0,
      silenceMs: 0,
      speechMs: 0,
      preRoll: [],
      preRollBytes: 0,
      utterance: [],
      utteranceBytes: 0,
      lastFrameAt: 0,

      configure(vad) {
        if (!vad) return
        const next = {
          enabled: vad.enabled !== false,
          sensitivity: Number(vad.sensitivity) || 0.6,
          silence_timeout_ms: Number(vad.silence_timeout_ms) || 1200,
          min_speech_ms: Number(vad.min_speech_ms) || 200,
          pre_roll_ms: Number(vad.pre_roll_ms) || 400,
        }
        this.vad = next
        this.preRollLimit = Math.max(0, Math.round(next.pre_roll_ms * this.sampleRate * 2 / 1000))
      },

      async start(callbacks, options = {}) {
        if (this.running) return true
        if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error(t('unsupported'))
        }
        this.callbacks = callbacks || {}
        this.configure(options.vad)
        this.preRollLimit = Math.max(0, Math.round(this.vad.pre_roll_ms * this.sampleRate * 2 / 1000))

        const constraints = {
          audio: {
            deviceId: options.deviceId ? { exact: options.deviceId } : undefined,
            noiseSuppression: options.noiseSuppression !== false,
            echoCancellation: options.echoCancellation !== false,
            autoGainControl: options.autoGainControl !== false,
            channelCount: 1,
          },
          video: false,
        }
        let stream
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints)
        } catch (error) {
          // 设备 ID 失效时退回到系统默认设备，否则用户会被卡死在错误上。
          if (options.deviceId) stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
          else throw error
        }
        this.stream = stream

        const Ctx = typeof AudioContext !== 'undefined' ? AudioContext
          : (typeof webkitAudioContext !== 'undefined' ? webkitAudioContext : null)
        if (!Ctx) { this.stop(); throw new Error(t('unsupported')) }
        let ctx
        try { ctx = new Ctx({ sampleRate: TARGET_SAMPLE_RATE }) } catch { ctx = new Ctx() }
        this.audioCtx = ctx
        this.sampleRate = ctx.sampleRate || TARGET_SAMPLE_RATE

        this.source = ctx.createMediaStreamSource(stream)
        this.analyser = ctx.createAnalyser()
        this.analyser.fftSize = 1024
        this.source.connect(this.analyser)

        // ScriptProcessorNode 已标记废弃，但所有当前浏览器都还支持，
        // 且不需要额外的 worklet 资源文件；后续可平滑迁移到 AudioWorklet。
        this.processor = ctx.createScriptProcessor(2048, 1, 1)
        this.processor.onaudioprocess = (event) => this.handleFrame(event)
        this.source.connect(this.processor)
        // 某些浏览器只有在 processor 连到 destination 时才会触发回调，
        // 用 0 增益节点避免把麦克风声音放出来造成啸叫。
        const mute = ctx.createGain()
        mute.gain.value = 0
        this.processor.connect(mute)
        mute.connect(ctx.destination)

        this.running = true
        this.paused = false
        this.resetUtterance()
        chatty.levels = []
        return true
      },

      stop() {
        this.running = false
        this.paused = false
        this.speaking = false
        if (this.processor) {
          try { this.processor.disconnect() } catch { /* 已断开 */ }
          this.processor.onaudioprocess = null
        }
        if (this.source) { try { this.source.disconnect() } catch { /* 已断开 */ } }
        if (this.stream) { for (const track of this.stream.getTracks()) { try { track.stop() } catch { /* 已停止 */ } } }
        if (this.audioCtx) { try { this.audioCtx.close() } catch { /* 已关闭 */ } }
        this.stream = null; this.audioCtx = null; this.source = null; this.analyser = null; this.processor = null
        this.resetUtterance()
        chatty.levels = []
        chatty.notify()
      },

      pause() {
        if (!this.running || this.paused) return
        this.paused = true
        this.finishUtterance('paused')
        setSttPhase('PAUSED')
      },

      resume() {
        if (!this.running || !this.paused) return
        this.paused = false
        this.resetUtterance()
        setSttPhase('LISTENING')
      },

      resetUtterance() {
        this.speaking = false
        this.speechFrames = 0
        this.silenceMs = 0
        this.speechMs = 0
        this.preRoll = []
        this.preRollBytes = 0
        this.utterance = []
        this.utteranceBytes = 0
      },

      threshold() {
        const sensitivity = Math.max(0.05, Math.min(1, Number(this.vad.sensitivity) || 0.6))
        return Math.max(this.noiseFloor * (1.6 + (1 - sensitivity) * 2.4), 0.003 + (1 - sensitivity) * 0.02)
      },

      handleFrame(event) {
        if (!this.running || this.paused) return
        const input = event.inputBuffer.getChannelData(0)
        const pcm = this.toPcm16(input)
        const rms = Math.sqrt(input.reduce((sum, value) => sum + value * value, 0) / Math.max(1, input.length))
        const frameMs = (input.length / this.sampleRate) * 1000
        const speech = this.vad.enabled === false ? true : rms > this.threshold()

        if (!this.speaking) {
          this.noiseFloor = this.noiseFloor * 0.95 + rms * 0.05
          if (this.vad.enabled !== false) {
            if (speech) this.speechFrames += 1
            else this.speechFrames = 0
            // 连续两帧超过阈值才算人声开始，避免单帧尖峰误触发。
            if (this.speechFrames >= 2) {
              this.speaking = true
              this.silenceMs = 0
              this.speechMs = 0
              this.utterance = this.preRoll.slice()
              this.utteranceBytes = this.preRollBytes
              this.preRoll = []
              this.preRollBytes = 0
              setSttPhase('SPEECH_DETECTED')
              this.emit('onSpeechStart', concatPcm(this.utterance))
            }
          } else if (this.vad.enabled === false) {
            if (!this.speaking) {
              this.speaking = true
              this.silenceMs = 0
              this.speechMs = 0
              setSttPhase('SPEECH_DETECTED')
              this.emit('onSpeechStart', new Uint8Array(0))
            }
          }
          if (!this.speaking) {
            this.pushPreRoll(pcm)
            this.pushLevel(rms)
            return
          }
        }

        // 说话中
        this.utterance.push(pcm)
        this.utteranceBytes += pcm.length
        this.speechMs += frameMs
        this.emit('onFrame', pcm)
        if (speech) this.silenceMs = 0
        else this.silenceMs += frameMs
        this.pushLevel(rms)

        if (this.vad.enabled !== false && this.silenceMs >= this.vad.silence_timeout_ms) {
          this.finishUtterance('silence')
        }
      },

      finishUtterance(reason) {
        if (!this.speaking) return
        const pcm = concatPcm(this.utterance)
        const durationMs = this.speechMs
        const wasSpeech = durationMs >= this.vad.min_speech_ms
        this.resetUtterance()
        if (wasSpeech) {
          setSttPhase('TRANSCRIBING')
          this.emit('onSpeechEnd', pcm, { durationMs, reason })
        } else {
          this.emit('onSpeechDiscard', { durationMs, reason })
          if (this.running && !this.paused) setSttPhase('LISTENING')
        }
      },

      pushPreRoll(pcm) {
        const limit = this.preRollLimit || 0
        if (limit <= 0) return
        this.preRoll.push(pcm)
        this.preRollBytes += pcm.length
        while (this.preRollBytes > limit && this.preRoll.length > 1) {
          const dropped = this.preRoll.shift()
          this.preRollBytes -= dropped.length
        }
      },

      pushLevel(rms) {
        const level = Math.max(0, Math.min(1, rms * 12))
        this.levels.push(level)
        if (this.levels.length > 24) this.levels.shift()
        chatty.levels = this.levels.slice()
        this.emit('onLevel', chatty.levels)
      },

      emit(name, ...args) {
        const handler = this.callbacks && this.callbacks[name]
        if (typeof handler !== 'function') return
        try { handler(...args) } catch (error) {
          if (typeof this.callbacks.onError === 'function') this.callbacks.onError(error)
        }
      },

      /** Float32 [-1,1] → PCM16 小端字节。 */
      toPcm16(input) {
        const out = new Uint8Array(input.length * 2)
        const view = new DataView(out.buffer)
        for (let i = 0; i < input.length; i += 1) {
          const value = Math.max(-1, Math.min(1, input[i]))
          view.setInt16(i * 2, value < 0 ? value * 0x8000 : value * 0x7fff, true)
        }
        return out
      },
    }

    function concatPcm(chunks) {
      const list = (chunks || []).filter((item) => item && item.length)
      const total = list.reduce((sum, item) => sum + item.length, 0)
      const out = new Uint8Array(total)
      let offset = 0
      for (const item of list) { out.set(item, offset); offset += item.length }
      return out
    }

// ---- lib/client-src/45-stt.js ----
    // ── STT 客户端（需求 §3.2 / §8 / §9）─────────────────────────────
    //
    // 两条路径：
    //   流式：人声开始时打开一个宿主流式会话，持续 push PCM，partial 通过 SSE 回来；
    //   批量：本地累积整个 Utterance，结束时一次性上传 WAV。
    // 选择依据是 Provider capability（宿主 /status 下发）+ 用户配置。
    //
    // 无论哪条路径都会本地累积 PCM：流式连接中途出错时可以降级为批量，
    // 不会让用户白说一句话。

    const sttClient = {
      active: false,
      mode: 'batch',
      streamId: '',
      eventSource: null,
      seq: 0,
      pushQueue: [],
      pushing: false,
      utteranceChunks: [],
      utteranceBytes: 0,
      degraded: false,
      suppress: false,
      finalText: '',
      stopping: false,

      resetUtterance() {
        this.utteranceChunks = []
        this.utteranceBytes = 0
        this.degraded = false
        this.suppress = false
        this.finalText = ''
      },

      async openStream(language) {
        const payload = await postJson('/dsh-chatty/stt/stream/start', {
          language,
          sampleRate: TARGET_SAMPLE_RATE,
        })
        this.streamId = payload.streamId
        this.seq = 0
        this.pushQueue = []
        this.listenStreamEvents(payload.streamId)
        return payload
      },

      listenStreamEvents(streamId) {
        if (typeof EventSource === 'undefined') return
        this.closeStreamEvents()
        const source = new EventSource('/dsh-chatty/stt/stream/events?streamId=' + encodeURIComponent(streamId))
        this.eventSource = source
        source.addEventListener('partial', (event) => {
          const data = parseSseData(event)
          if (!data) return
          chatty.partial = data.text || ''
          if (chatty.sttPhase === 'TRANSCRIBING') setSttPhase('TRANSCRIBING')
          else chatty.notify()
        })
        source.addEventListener('final', (event) => {
          const data = parseSseData(event)
          if (data && data.text) this.finalText = data.text
        })
        source.addEventListener('error', (event) => {
          const data = parseSseData(event)
          if (data && data.message) chatty.sttError = data.message
        })
        source.addEventListener('closed', () => { /* 服务端收尾，无需处理 */ })
        source.onerror = () => {
          if (!this.active || this.streamId !== streamId) return
          // 连接断了就降级：当前 Utterance 改用批量上传，并提示正在重连。
          this.degraded = true
          setSttPhase('RECONNECTING')
        }
      },

      closeStreamEvents() {
        if (this.eventSource) {
          try { this.eventSource.close() } catch { /* 已关闭 */ }
        }
        this.eventSource = null
      },

      enqueuePush(pcm) {
        if (!this.streamId || this.degraded || this.suppress) return
        this.pushQueue.push(pcm)
        this.flushPush()
      },

      async flushPush() {
        if (this.pushing) return
        this.pushing = true
        try {
          while (this.pushQueue.length) {
            const pcm = this.pushQueue.shift()
            const streamId = this.streamId
            if (!streamId) break
            this.seq += 1
            try {
              await postJson('/dsh-chatty/stt/stream/push', {
                streamId,
                seq: this.seq,
                dataBase64: bytesToBase64(pcm),
              })
            } catch (error) {
              this.degraded = true
              setSttPhase('RECONNECTING')
              break
            }
          }
        } finally {
          this.pushing = false
        }
      },

      async closeStream(cancel) {
        const streamId = this.streamId
        this.streamId = ''
        this.closeStreamEvents()
        this.pushQueue = []
        if (!streamId) return ''
        try {
          const payload = await postJson('/dsh-chatty/stt/stream/stop', { streamId, cancel: !!cancel })
          return String(payload.text || this.finalText || '')
        } catch {
          return this.finalText || ''
        }
      },

      async transcribeBatch(language) {
        const pcm = concatPcm(this.utteranceChunks)
        if (!pcm.length) return ''
        const wav = pcm16ToWavClient(pcm, TARGET_SAMPLE_RATE)
        const payload = await postJson('/dsh-chatty/stt/transcribe', {
          dataBase64: bytesToBase64(wav),
          mimeType: 'audio/wav',
          language,
        })
        return String(payload.text || '')
      },
    }

    function parseSseData(event) {
      try { return JSON.parse(event.data) } catch { return null }
    }

    async function startListening() {
      if (sttClient.active) return
      const settings = chatty.settings || await refreshChattySettings()
      if (!settings) { setSttPhase('ERROR', chatty.sttError || t('error')); return }
      const capability = chattySetting('stt.capability', {}) || {}
      sttClient.mode = (chattySetting('stt.streaming', true) && capability.streaming) ? 'stream' : 'batch'
      try {
        await audioEngine.start({
          onSpeechStart: (preRoll) => handleSpeechStart(preRoll),
          onFrame: (pcm) => handleSpeechFrame(pcm),
          onSpeechEnd: (pcm, info) => { handleSpeechEnd(pcm, info).catch((error) => handleSttFailure(error)) },
          onSpeechDiscard: () => { if (sttClient.active) setSttPhase('LISTENING') },
          onLevel: () => { /* chatty.levels 已在引擎里更新 */ },
          onError: (error) => handleSttFailure(error),
        }, {
          vad: chattySetting('stt.vad', null),
          deviceId: chattySetting('mic_device_id', ''),
          noiseSuppression: chattySetting('noise_suppression', true),
          echoCancellation: chattySetting('echo_cancellation', true),
          autoGainControl: chattySetting('auto_gain_control', true),
        })
        sttClient.active = true
        setSttPhase('LISTENING')
        showNotice('')
      } catch (error) {
        sttClient.active = false
        const message = String(error && error.message || error)
        setSttPhase('ERROR', /denied|NotAllowed/i.test(message) ? t('micDenied') : message)
      }
    }

    async function stopListening() {
      if (!sttClient.active) return
      sttClient.stopping = true
      sttClient.active = false
      // Push-to-Talk：手动停止时当前这句还没被静音切分，先收尾再关麦克风，
      // 否则用户「说完点停止」的最后一句会被直接丢掉。
      const pendingUtterance = audioEngine.speaking
      if (pendingUtterance) {
        setSttPhase('TRANSCRIBING')
        // finishUtterance 同步把 PCM 交给 handleSpeechEnd，后者异步落地识别结果。
        audioEngine.finishUtterance('manual')
      } else {
        sttClient.closeStream(true)
        sttClient.resetUtterance()
      }
      audioEngine.stop()
      chatty.partial = ''
      if (!pendingUtterance) setSttPhase('OFF')
      sttClient.stopping = false
    }

    function pauseListening() {
      if (!sttClient.active) return
      audioEngine.pause()
      sttClient.closeStream(true)
      chatty.partial = ''
      setSttPhase('PAUSED')
    }

    function resumeListening() {
      if (!sttClient.active) return
      audioEngine.resume()
      setSttPhase('LISTENING')
    }

    function toggleListening() {
      if (!sttClient.active) startListening()
      else if (chatty.sttPhase === 'PAUSED') resumeListening()
      else stopListening()
    }

    function handleSpeechStart(preRoll) {
      sttClient.resetUtterance()
      chatty.partial = ''
      // 朗读期间检测到人声：先处理打断，再决定这一句要不要送远程识别（需求 §21）。
      if (chatty.ttsPhase === 'PLAYING' || chatty.ttsPhase === 'PREPARING') {
        if (chattySetting('tts.interrupt_on_speech', true)) interruptSpeaking('speech')
        else { sttClient.suppress = true; return }
      }
      if (preRoll && preRoll.length) {
        sttClient.utteranceChunks.push(preRoll)
        sttClient.utteranceBytes += preRoll.length
      }
      if (sttClient.mode === 'stream') {
        sttClient.openStream(chattySetting('stt.language', 'zh-CN'))
          .then(() => { for (const chunk of sttClient.utteranceChunks) sttClient.enqueuePush(chunk) })
          .catch(() => { sttClient.degraded = true; setSttPhase('RECONNECTING') })
      }
    }

    function handleSpeechFrame(pcm) {
      sttClient.utteranceChunks.push(pcm)
      sttClient.utteranceBytes += pcm.length
      if (sttClient.mode === 'stream' && !sttClient.suppress) sttClient.enqueuePush(pcm)
    }

    async function handleSpeechEnd(pcm, info) {
      if (pcm && pcm.length && (!sttClient.utteranceChunks.length)) {
        sttClient.utteranceChunks.push(pcm)
        sttClient.utteranceBytes += pcm.length
      }
      const suppressed = sttClient.suppress
      const useStream = sttClient.mode === 'stream' && !sttClient.degraded && !suppressed
      let text = ''
      try {
        if (useStream) {
          await sttClient.flushPush()
          text = await sttClient.closeStream(false)
        } else if (!suppressed) {
          text = await sttClient.transcribeBatch(chattySetting('stt.language', 'zh-CN'))
        }
      } finally {
        sttClient.resetUtterance()
        chatty.partial = ''
      }
      const clean = String(text || '').trim()
      if (clean) await addUtterance(clean)
      if (!sttClient.active) { setSttPhase('OFF'); return }
      if (chatty.sttPhase === 'RECONNECTING' || chatty.sttPhase === 'TRANSCRIBING' || chatty.sttPhase === 'SPEECH_DETECTED') {
        setSttPhase('LISTENING')
      } else {
        chatty.notify()
      }
    }

    function handleSttFailure(error) {
      const message = String(error && error.message || error)
      if (!sttClient.active) return
      setSttPhase('ERROR', message)
      sttClient.resetUtterance()
      chatty.partial = ''
      // 一次失败不结束长时间监听：短暂提示后回到 LISTENING（需求 §3.2）。
      setTimeout(() => {
        if (sttClient.active && chatty.sttPhase === 'ERROR') setSttPhase('LISTENING')
      }, 2500)
    }

// ---- lib/client-src/50-draft.js ----
    // ── Voice Draft 客户端（需求 §4.2 / §5 / §6）─────────────────────
    //
    // 宿主是草稿的权威副本，这里只做三件事：
    //   1. 调用 /dsh-chatty/draft 的各种 action；
    //   2. 把返回的草稿镜像到 composer（发送时走 composer.submit()）；
    //   3. 执行语音指令对应的浏览器动作（朗读 / 暂停 / 停止监听）。

    function applyDraftPayload(payload, options = {}) {
      if (!payload) return
      if (payload.draft) chatty.draft = payload.draft
      const effects = Array.isArray(payload.effects) ? payload.effects : []
      if (options.mirror !== false && effects.includes('setDraft')) {
        mirrorDraftToComposer(payload.draft ? payload.draft.text : '')
      }
      chatty.notify()
    }

    async function draftAction(action, extra = {}, options = {}) {
      const payload = await postJson('/dsh-chatty/draft', Object.assign({
        sessionId: chatty.sessionId || 'default',
        action,
      }, extra))
      applyDraftPayload(payload, options)
      return payload
    }

    /** 一个 Utterance 的最终识别结果进入 Voice Draft（绝不自动发送，除非显式配置）。 */
    async function addUtterance(text) {
      const clean = String(text || '').trim()
      if (!clean) return null
      let payload
      try {
        payload = await draftAction('add', { text: clean })
      } catch (error) {
        setSttPhase('ERROR', String(error && error.message || error))
        return null
      }
      if (payload.command) {
        await runVoiceCommand(payload.command)
        return payload
      }
      if (chattySetting('draft.auto_send', false)) await sendDraft()
      return payload
    }

    async function runVoiceCommand(command) {
      const name = command && command.name
      if (!name) return
      showNotice(t('command', { name: command.phrase || name }))
      switch (name) {
        case 'send':
          await sendDraft()
          break
        case 'undo':
          showNotice(t('undone'))
          break
        case 'clear':
          showNotice(t('cleared'))
          break
        case 'cancel':
          showNotice(t('cleared'))
          break
        case 'polish':
          showNotice(t('polished'))
          break
        case 'stop_listening':
          await stopListening()
          break
        case 'pause':
          pauseListening()
          break
        case 'resume':
          resumeListening()
          break
        case 'read':
          await readLatestReply()
          break
        case 'stop_reading':
          stopSpeaking()
          break
        default:
          break
      }
    }

    async function sendDraft() {
      const text = String((chatty.draft && chatty.draft.text) || '').trim()
      if (!text) { showNotice(t('draftEmpty')); return }
      chatty.busy = 'send'
      chatty.notify()
      try {
        if (!mirrorDraftToComposer(text)) {
          showNotice(t('composerUnavailable'))
          return
        }
        if (!chatty.inputActions || typeof chatty.inputActions.submit !== 'function') {
          showNotice(t('composerUnavailable'))
          return
        }
        chatty.inputActions.submit()
        showNotice(t('sent'))
        // 发送成功后清空宿主草稿，但不要再镜像回 composer：
        // 用户可能在提交瞬间又敲了后缀，不能被清掉。
        await draftAction('cancel', {}, { mirror: false })
      } catch (error) {
        showNotice(String(error && error.message || error))
      } finally {
        chatty.busy = ''
        chatty.notify()
      }
    }

    async function undoDraft() {
      try {
        const payload = await draftAction('undo')
        showNotice(payload.removed ? t('undone') : t('nothingToUndo'))
      } catch (error) {
        showNotice(String(error && error.message || error))
      }
    }

    async function clearDraft() {
      try {
        await draftAction('clear')
        showNotice(t('cleared'))
      } catch (error) {
        showNotice(String(error && error.message || error))
      }
    }

    async function polishDraft() {
      chatty.busy = 'polish'
      chatty.notify()
      try {
        await draftAction('polish')
        showNotice(t('polished'))
      } catch (error) {
        showNotice(String(error && error.message || error))
      } finally {
        chatty.busy = ''
        chatty.notify()
      }
    }

    async function editDraft(text) {
      try {
        await draftAction('edit', { text })
      } catch (error) {
        showNotice(String(error && error.message || error))
      }
    }

    async function loadDraft() {
      try {
        const payload = await getJson('/dsh-chatty/draft?sessionId=' + encodeURIComponent(chatty.sessionId || 'default'))
        if (payload.draft) { chatty.draft = payload.draft; chatty.notify() }
        return payload.draft
      } catch {
        return null
      }
    }

// ---- lib/client-src/55-tts.js ----
    // ── TTS 播放（需求 §11 / §18 / §19 / §20 / §21）──────────────────
    //
    // 宿主把 Assistant 回复切成「可朗读片段」并通过 SSE 下发（自动朗读），
    // 或由 /speech/render 一次性返回（手动朗读）。这里负责：
    //   - 顺序播放（Speech Queue 的浏览器侧镜像）；
    //   - 停止 / 打断（递增 generation，丢弃在途音频）；
    //   - PCM 用 WebAudio 连续播放，mp3/wav 用 audio 元素兜底。

    const speech = {
      generation: 0,
      controllers: new Set(),
      audioCtx: null,
      gain: null,
      sources: new Set(),
      nextTime: 0,
      queue: [],
      pumping: false,
      activeStreams: 0,
      eventSource: null,
      connectedSessionId: '',
      element: null,
      elementUrl: '',
    }

    function ensureSpeechAudio() {
      if (speech.audioCtx) {
        if (speech.audioCtx.state === 'suspended') speech.audioCtx.resume().catch(() => {})
        return speech.audioCtx
      }
      const Ctx = typeof AudioContext !== 'undefined' ? AudioContext
        : (typeof webkitAudioContext !== 'undefined' ? webkitAudioContext : null)
      if (!Ctx) return null
      speech.audioCtx = new Ctx()
      speech.gain = speech.audioCtx.createGain()
      const volume = Number(chattySetting('tts.volume', 1))
      speech.gain.gain.value = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 1
      speech.gain.connect(speech.audioCtx.destination)
      speech.nextTime = speech.audioCtx.currentTime
      return speech.audioCtx
    }

    function enqueueSpeechSegment(segment) {
      if (!segment || !String(segment.text || '').trim()) return
      speech.queue.push(segment)
      pumpSpeechQueue()
    }

    async function pumpSpeechQueue() {
      if (speech.pumping) return
      speech.pumping = true
      try {
        while (speech.queue.length) {
          const generation = speech.generation
          const segment = speech.queue.shift()
          try {
            await playSpeechSegment(segment, generation)
          } catch (error) {
            if (generation === speech.generation) {
              setTtsPhase('ERROR', String(error && error.message || error))
            }
          }
          if (generation !== speech.generation) break
        }
      } finally {
        speech.pumping = false
        if (speech.generation && speech.queue.length === 0 && chatty.ttsPhase !== 'ERROR') {
          if (chatty.ttsPhase === 'PLAYING' || chatty.ttsPhase === 'PREPARING') setTtsPhase('IDLE')
        }
      }
    }

    async function playSpeechSegment(segment, generation) {
      const controller = new AbortController()
      speech.controllers.add(controller)
      setTtsPhase('PREPARING')
      try {
        const res = await fetch('/dsh-chatty/tts/synthesize', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            text: segment.text,
            voice: chattySetting('tts.voice', ''),
            speed: chattySetting('tts.speed', 1),
          }),
        })
        if (!res.ok) {
          let message = `TTS HTTP ${res.status}`
          try {
            const data = await res.json()
            if (data && data.error && data.error.message) message = data.error.message
          } catch { /* 非 JSON 错误体 */ }
          throw new Error(message)
        }
        const format = String(res.headers.get('X-Audio-Format') || 'pcm').toLowerCase()
        const sampleRate = Number(res.headers.get('X-Audio-Sample-Rate')) || Number(chattySetting('tts.sample_rate', 24000)) || 24000
        if (format === 'pcm') await playPcmStream(res, sampleRate, generation, controller)
        else await playEncodedBlob(res, generation, controller)
        if (generation === speech.generation) setTtsPhase('IDLE')
      } finally {
        speech.controllers.delete(controller)
      }
    }

    async function playPcmStream(res, sampleRate, generation, controller) {
      const ctxAudio = ensureSpeechAudio()
      if (!ctxAudio) throw new Error(t('unsupported'))
      await ctxAudio.resume().catch(() => {})
      const reader = res.body && res.body.getReader ? res.body.getReader() : null
      if (!reader) throw new Error('TTS response is not streamable')
      let carry = new Uint8Array(0)
      speech.activeStreams += 1
      try {
        while (true) {
          if (generation !== speech.generation || controller.signal.aborted) return
          const part = await reader.read()
          if (part.done) break
          let bytes = part.value
          if (carry.length) {
            const joined = new Uint8Array(carry.length + bytes.length)
            joined.set(carry, 0); joined.set(bytes, carry.length)
            bytes = joined
            carry = new Uint8Array(0)
          }
          if (bytes.length % 2) { carry = bytes.slice(-1); bytes = bytes.slice(0, -1) }
          if (!bytes.length) continue
          const frames = bytes.length / 2
          const buffer = ctxAudio.createBuffer(1, frames, sampleRate)
          const channel = buffer.getChannelData(0)
          const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
          for (let i = 0; i < frames; i += 1) channel[i] = view.getInt16(i * 2, true) / 32768
          const source = ctxAudio.createBufferSource()
          source.buffer = buffer
          source.connect(speech.gain)
          const startAt = Math.max(ctxAudio.currentTime + 0.04, speech.nextTime)
          source.start(startAt)
          speech.nextTime = startAt + buffer.duration
          speech.sources.add(source)
          source.onended = () => { speech.sources.delete(source) }
          if (chatty.ttsPhase !== 'PLAYING') setTtsPhase('PLAYING')
        }
      } finally {
        speech.activeStreams = Math.max(0, speech.activeStreams - 1)
      }
    }

    async function playEncodedBlob(res, generation, controller) {
      const blob = await res.blob()
      if (generation !== speech.generation || controller.signal.aborted) return
      const url = URL.createObjectURL(blob)
      speech.elementUrl = url
      const element = new Audio(url)
      speech.element = element
      element.volume = Math.max(0, Math.min(1, Number(chattySetting('tts.volume', 1)) || 1))
      await new Promise((resolve, reject) => {
        const cleanup = () => {
          element.onended = null
          element.onerror = null
          try { URL.revokeObjectURL(url) } catch { /* 已释放 */ }
          if (speech.element === element) speech.element = null
          speech.elementUrl = ''
        }
        element.onended = () => { cleanup(); resolve() }
        element.onerror = () => { cleanup(); reject(new Error('audio playback failed')) }
        controller.signal.addEventListener('abort', () => {
          try { element.pause() } catch { /* 已暂停 */ }
          cleanup()
          resolve()
        }, { once: true })
        element.play().then(() => setTtsPhase('PLAYING')).catch((error) => { cleanup(); reject(error) })
      })
    }

    function stopSpeaking(silent) {
      speech.generation += 1
      for (const controller of speech.controllers) { try { controller.abort() } catch { /* 已结束 */ } }
      speech.controllers.clear()
      for (const source of speech.sources) { try { source.stop() } catch { /* 已结束 */ } }
      speech.sources.clear()
      if (speech.element) { try { speech.element.pause() } catch { /* 已暂停 */ } }
      if (speech.elementUrl) { try { URL.revokeObjectURL(speech.elementUrl) } catch { /* 已释放 */ } }
      speech.element = null
      speech.elementUrl = ''
      speech.queue = []
      speech.activeStreams = 0
      if (speech.audioCtx) {
        speech.audioCtx.resume().catch(() => {})
        speech.nextTime = speech.audioCtx.currentTime
      }
      if (!silent) {
        postJson('/dsh-chatty/speech/stop', { sessionId: chatty.sessionId || 'default' }).catch(() => {})
      }
      setTtsPhase('IDLE')
    }

    /** 用户说话打断：停播 → 清空队列 → 回到监听（需求 §20 / §21）。 */
    function interruptSpeaking(reason) {
      stopSpeaking()
      setTtsPhase('INTERRUPTED')
      showNotice(t('interrupted'))
      setTimeout(() => {
        if (chatty.ttsPhase === 'INTERRUPTED') setTtsPhase('IDLE')
      }, 1200)
      if (reason === 'speech' && sttClient.active && chatty.sttPhase === 'PAUSED') resumeListening()
    }

    async function readLatestReply() {
      try {
        const payload = await postJson('/dsh-chatty/speech/render', { sessionId: chatty.sessionId || 'default' })
        const segments = Array.isArray(payload.segments) ? payload.segments : []
        if (!segments.length) { showNotice('没有可朗读的回复'); return }
        stopSpeaking(true)
        for (const segment of segments) enqueueSpeechSegment(segment)
      } catch (error) {
        setTtsPhase('ERROR', String(error && error.message || error))
      }
    }

    function connectSpeechEvents(sessionId) {
      const id = String(sessionId || '')
      if (speech.connectedSessionId === id) return
      disconnectSpeechEvents()
      if (!id) return
      if (typeof EventSource === 'undefined') return
      const source = new EventSource('/dsh-chatty/speech/events?sessionId=' + encodeURIComponent(id))
      speech.eventSource = source
      speech.connectedSessionId = id
      source.addEventListener('speech.segment', (event) => {
        const data = parseSseData(event)
        if (data) enqueueSpeechSegment(data)
      })
      source.addEventListener('speech.cancel', () => { stopSpeaking(true) })
      source.addEventListener('speech.end', () => { /* 队列自然播完 */ })
      source.onerror = () => { /* 断线由 EventSource 自动重连 */ }
    }

    function disconnectSpeechEvents() {
      if (speech.eventSource) {
        try { speech.eventSource.close() } catch { /* 已关闭 */ }
      }
      speech.eventSource = null
      speech.connectedSessionId = ''
    }

// ---- lib/client-src/60-ui.js ----
    // ── 界面：Voice Bar + Voice Draft 面板（需求 §9 / §10 / §23）─────

    function LevelBars(props) {
      const levels = props.levels || []
      const bars = props.bars || 7
      const slice = levels.slice(-bars)
      const padded = []
      for (let i = 0; i < bars - slice.length; i += 1) padded.push(0.05)
      const values = padded.concat(slice)
      return React.createElement('span', { className: 'dch-levels', 'aria-hidden': 'true' },
        values.map((value, index) => React.createElement('span', {
          key: index,
          style: { height: Math.max(2, Math.round(2 + value * 14)) + 'px' },
        })))
    }

    function VoiceBar(props) {
      const state = useChatty()
      chatty.sessionId = String(props.sessionId || '')
      chatty.inputActions = props.inputActions || null
      chatty.input = props.input || null

      const sessionRef = React.useRef(chatty.sessionId)
      React.useEffect(() => {
        installChattyStyle()
        refreshChattySettings().then((settings) => {
          if (!settings) return
          if (chattySetting('stt.continuous_listening', false) && !sttClient.active) startListening()
          if (chattySetting('tts.auto_read', false)) connectSpeechEvents(chatty.sessionId)
        })
        loadDraft()
        return () => { /* 卸载时保持监听状态：切会话不该掐掉麦克风 */ }
      }, [])

      React.useEffect(() => {
        if (sessionRef.current === chatty.sessionId) return
        sessionRef.current = chatty.sessionId
        chatty.draft = { text: '', size: 0, utterances: [] }
        chatty.partial = ''
        chatty.lastRenderedDraft = null
        sttClient.closeStream(true)
        sttClient.resetUtterance()
        stopSpeaking(true)
        loadDraft()
        if (chattySetting('tts.auto_read', false)) connectSpeechEvents(chatty.sessionId)
        else disconnectSpeechEvents()
        chatty.notify()
      }, [props.sessionId])

      React.useEffect(() => {
        const supported = typeof navigator !== 'undefined' && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
        if (chatty.supported !== supported) chatty.set({ supported })
      }, [])

      if (chattySetting('ui.show_voice_bar', true) === false) return null

      const listening = sttClient.active
      const paused = state.sttPhase === 'PAUSED'
      const speaking = state.ttsPhase === 'PLAYING' || state.ttsPhase === 'PREPARING'
      const status = speaking ? ttsStatusText() : sttStatusText()
      const showLevels = chattySetting('ui.visualizer', 'bars') !== 'off'
      const hasDraft = !draftIsEmpty()

      const micButton = chattyButton({
        label: listening ? t('stopListening') : t('startListening'),
        icon: iconMic(),
        active: listening && !paused,
        disabled: !chatty.supported || chatty.busy === 'send',
        onClick: () => toggleListening(),
      })
      const pauseButton = chattyButton({
        label: paused ? t('resumeListening') : t('pauseListening'),
        icon: iconPause(),
        disabled: !listening,
        onClick: () => (paused ? resumeListening() : pauseListening()),
      })
      const sendButton = chattyButton({
        label: t('sendDraft'),
        icon: iconSend(),
        disabled: !hasDraft || chatty.busy === 'send',
        onClick: () => { sendDraft() },
      })
      const readButton = chattyButton({
        label: t('readReply'),
        icon: iconSpeaker(),
        active: speaking,
        onClick: () => { readLatestReply() },
      })
      const stopButton = chattyButton({
        label: t('stopSpeaking'),
        icon: iconStop(),
        disabled: !speaking,
        onClick: () => stopSpeaking(),
      })

      return React.createElement('div', { className: 'dch-toolbar', role: 'group', 'aria-label': t('title') },
        micButton,
        pauseButton,
        sendButton,
        readButton,
        stopButton,
        showLevels ? React.createElement(LevelBars, { levels: state.levels }) : null,
        React.createElement('span', {
          className: 'dch-status',
          'data-error': state.sttPhase === 'ERROR' || state.ttsPhase === 'ERROR' ? '1' : '0',
          role: 'status',
          'aria-live': 'polite',
        }, state.notice || status),
        state.partial && chattySetting('ui.show_partial', true)
          ? React.createElement('span', { className: 'dch-partial', title: t('partial') }, state.partial)
          : null)
    }

    function DraftPanel(props) {
      const state = useChatty()
      chatty.inputActions = props.inputActions || chatty.inputActions
      chatty.input = props.input || chatty.input
      const [local, setLocal] = React.useState(null)
      const editTimer = React.useRef(null)

      React.useEffect(() => () => { if (editTimer.current) clearTimeout(editTimer.current) }, [])

      if (chattySetting('ui.show_draft_panel', true) === false) return null

      const listening = sttClient.active
      const text = local === null ? String((state.draft && state.draft.text) || '') : local
      const partial = state.partial || ''
      const visible = listening || text || partial || state.busy === 'polish' || state.busy === 'send'
      if (!visible) return null

      const onEdit = (value) => {
        setLocal(value)
        if (editTimer.current) clearTimeout(editTimer.current)
        editTimer.current = setTimeout(() => {
          editTimer.current = null
          setLocal(null)
          editDraft(value)
        }, 700)
      }

      const width = Number(chattySetting('ui.panel_width', 720)) || 720
      const busy = state.busy === 'polish' || state.busy === 'send'

      return React.createElement('div', { className: 'dch-pill', style: { maxWidth: width + 'px' } },
        React.createElement('span', { className: 'dch-dot', 'data-on': listening ? '1' : '0' }),
        React.createElement('div', { className: 'dch-pill-main' },
          React.createElement('span', { className: 'dch-draft-title' }, t('draftTitle'),
            state.draft && state.draft.size ? ` · ${state.draft.size}` : ''),
          React.createElement('textarea', {
            className: 'dch-draft-text',
            value: text,
            placeholder: t('draftEmpty'),
            'aria-label': t('draftTitle'),
            onChange: (event) => onEdit(event.target.value),
          }),
          partial && chattySetting('ui.show_partial', true)
            ? React.createElement('span', { className: 'dch-partial' }, t('partial') + '：' + partial)
            : null,
          React.createElement('div', { className: 'dch-actions' },
            React.createElement('button', {
              type: 'button', className: 'dch-action', disabled: busy || !text,
              onClick: () => { setLocal(null); undoDraft() },
            }, t('undo')),
            React.createElement('button', {
              type: 'button', className: 'dch-action', disabled: busy || !text,
              onClick: () => { setLocal(null); clearDraft() },
            }, t('clear')),
            React.createElement('button', {
              type: 'button', className: 'dch-action', disabled: busy || !text,
              onClick: () => { setLocal(null); polishDraft() },
            }, state.busy === 'polish' ? t('polishing') : t('polish')),
            React.createElement('button', {
              type: 'button', className: 'dch-action', 'data-primary': '1', disabled: busy || !text,
              onClick: () => { setLocal(null); sendDraft() },
            }, state.busy === 'send' ? t('sending') : t('send'))),
          React.createElement('span', { className: 'dch-muted' }, state.notice || sttStatusText())),
        listening
          ? React.createElement('button', {
              type: 'button', className: 'dch-action',
              onClick: () => stopListening(),
            }, t('stopListening'))
          : null)
    }

// ---- lib/client-src/70-settings.js ----
    // ── 设置卡（需求 §22 / §23）──────────────────────────────────────
    //
    // 命名空间就是插件名；配置写入走 ctx.settingsScope.set(key, value)，
    // 宿主侧 settings.register 之后立即可读，无需重启。

    function ChattyField(props) {
      return React.createElement('div', { className: 'dch-field' },
        React.createElement('label', null, props.label),
        props.children,
        props.hint ? React.createElement('span', { className: 'dch-muted' }, props.hint) : null)
    }

    function ChattyCheck(props) {
      return React.createElement('label', { className: 'dch-check' },
        React.createElement('input', {
          type: 'checkbox', checked: !!props.checked, disabled: props.disabled,
          onChange: (event) => props.onChange(event.target.checked),
        }),
        props.label)
    }

    function ChattySection(props) {
      const scope = ((props.ctx.get && props.ctx.get('lanSettings')) || props.ctx.settingsScope).bind({ namespace: NS })
      const [snap, setSnap] = React.useState(null)
      const [draft, setDraft] = React.useState(null)
      const [saved, setSaved] = React.useState(false)
      const [error, setError] = React.useState('')
      const [info, setInfo] = React.useState(null)

      React.useEffect(() => {
        let alive = true
        const render = () => { if (alive) setSnap(scope.getSnapshot()) }
        render()
        const off = scope.subscribe(render)
        return () => { alive = false; off() }
      }, [])

      const ready = !!snap && snap.status === 'ready'
      const value = ready && snap.value ? snap.value : {}
      const writable = ready && snap.writable !== false

      React.useEffect(() => {
        if (ready) return undefined
        let tries = 0
        const timer = setInterval(() => {
          if (tries >= 15) { clearInterval(timer); return }
          tries += 1
          try { ((props.ctx.get && props.ctx.get('lanSettings')) || props.ctx.settingsScope).describe().load() } catch { /* 服务还没起来 */ }
        }, 1000)
        return () => clearInterval(timer)
      }, [ready])

      React.useEffect(() => {
        if (ready && draft === null) setDraft(JSON.parse(JSON.stringify(value)))
      }, [ready, draft, value])

      React.useEffect(() => {
        getJson('/dsh-chatty/config-info').then(setInfo).catch(() => setInfo(null))
      }, [])

      if (!ready || draft === null) {
        return React.createElement('div', { className: 'dch-muted' }, ready ? '' : t('reload'))
      }

      const setIn = (section, key, next) => setDraft((current) => {
        const base = JSON.parse(JSON.stringify(current || {}))
        base[section] = Object.assign({}, base[section] || {}, { [key]: next })
        return base
      })
      const setTop = (key, next) => setDraft((current) => Object.assign({}, current || {}, { [key]: next }))

      const save = async () => {
        setError('')
        try {
          for (const key of Object.keys(draft)) await scope.set(key, draft[key])
          setSaved(true)
          setTimeout(() => setSaved(false), 1600)
          try { window.dispatchEvent(new CustomEvent('dsh-chatty:settings-saved')) } catch { /* 没有 window */ }
        } catch (saveError) {
          setError(String(saveError && saveError.message || saveError))
        }
      }

      const stt = draft.stt || {}
      const vad = stt.vad || {}
      const control = draft.voice_control || {}
      const tts = draft.tts || {}
      const ui = draft.ui || {}
      const sttProviders = (info && info.stt && info.stt.providers) || []
      const ttsProviders = (info && info.tts && info.tts.providers) || []
      const voices = (info && info.tts && info.tts.voices) || []
      const capability = sttProviders.find((item) => item.key === stt.provider)

      return React.createElement('div', { className: 'dch-card-body' },
        React.createElement('div', { className: 'dch-section-title' }, 'STT'),
        React.createElement('div', { className: 'dch-row' },
          React.createElement(ChattyField, { label: t('provider') },
            React.createElement('select', {
              value: stt.provider || 'volcano', disabled: !writable,
              onChange: (event) => setIn('stt', 'provider', event.target.value),
            }, (sttProviders.length ? sttProviders : [{ key: 'volcano' }, { key: 'siliconflow' }])
              .map((item) => React.createElement('option', { key: item.key, value: item.key }, item.key)))),
          React.createElement(ChattyField, { label: t('credential'), hint: 'DSH Credentials 名称，不写明文密钥' },
            React.createElement('input', {
              type: 'text', value: stt.credential || '', disabled: !writable,
              onChange: (event) => setIn('stt', 'credential', event.target.value),
            })),
          React.createElement(ChattyField, { label: 'App ID 凭据' },
            React.createElement('input', {
              type: 'text', value: stt.app_id_credential || '', disabled: !writable,
              onChange: (event) => setIn('stt', 'app_id_credential', event.target.value),
            }))),
        React.createElement('div', { className: 'dch-row' },
          React.createElement(ChattyField, { label: '语言' },
            React.createElement('input', {
              type: 'text', value: stt.language || '', disabled: !writable,
              onChange: (event) => setIn('stt', 'language', event.target.value),
            })),
          React.createElement(ChattyField, { label: '模型' },
            React.createElement('input', {
              type: 'text', value: stt.model || '', disabled: !writable,
              onChange: (event) => setIn('stt', 'model', event.target.value),
            }))),
        React.createElement('div', { className: 'dch-row' },
          React.createElement(ChattyCheck, {
            label: t('streaming'), checked: stt.streaming !== false, disabled: !writable,
            onChange: (next) => setIn('stt', 'streaming', next),
          }),
          React.createElement(ChattyCheck, {
            label: t('continuous'), checked: !!stt.continuous_listening, disabled: !writable,
            onChange: (next) => setIn('stt', 'continuous_listening', next),
          }),
          React.createElement(ChattyCheck, {
            label: t('partialPreview'), checked: stt.partial_preview !== false, disabled: !writable,
            onChange: (next) => setIn('stt', 'partial_preview', next),
          })),
        capability
          ? React.createElement('span', { className: 'dch-muted' },
              `capability: streaming=${capability.capability.streaming ? 'yes' : 'no'} partial=${capability.capability.partial_result ? 'yes' : 'no'}`)
          : null,

        React.createElement('div', { className: 'dch-section-title' }, t('vad')),
        React.createElement('div', { className: 'dch-row' },
          React.createElement(ChattyField, { label: t('sensitivity') },
            React.createElement('input', {
              type: 'number', step: '0.05', min: '0', max: '1', value: vad.sensitivity ?? 0.6, disabled: !writable,
              onChange: (event) => setIn('stt', 'vad', Object.assign({}, vad, { sensitivity: Number(event.target.value) })),
            })),
          React.createElement(ChattyField, { label: t('silenceTimeout') },
            React.createElement('input', {
              type: 'number', value: vad.silence_timeout_ms ?? 1200, disabled: !writable,
              onChange: (event) => setIn('stt', 'vad', Object.assign({}, vad, { silence_timeout_ms: Number(event.target.value) })),
            })),
          React.createElement(ChattyField, { label: t('minSpeech') },
            React.createElement('input', {
              type: 'number', value: vad.min_speech_ms ?? 200, disabled: !writable,
              onChange: (event) => setIn('stt', 'vad', Object.assign({}, vad, { min_speech_ms: Number(event.target.value) })),
            })),
          React.createElement(ChattyField, { label: t('preRoll') },
            React.createElement('input', {
              type: 'number', value: vad.pre_roll_ms ?? 400, disabled: !writable,
              onChange: (event) => setIn('stt', 'vad', Object.assign({}, vad, { pre_roll_ms: Number(event.target.value) })),
            }))),

        React.createElement('div', { className: 'dch-section-title' }, 'Voice Control'),
        React.createElement('div', { className: 'dch-row' },
          React.createElement(ChattyField, { label: t('commandMode'), hint: 'exact / wake / off' },
            React.createElement('input', {
              type: 'text', value: control.command_mode || 'exact', disabled: !writable,
              onChange: (event) => setIn('voice_control', 'command_mode', event.target.value),
            })),
          React.createElement(ChattyField, { label: t('wakePrefix') },
            React.createElement('input', {
              type: 'text', value: control.wake_prefix || '', disabled: !writable,
              onChange: (event) => setIn('voice_control', 'wake_prefix', event.target.value),
            }))),
        React.createElement(ChattyCheck, {
          label: '允许语音指令控制草稿', checked: control.enabled !== false, disabled: !writable,
          onChange: (next) => setIn('voice_control', 'enabled', next),
        }),

        React.createElement('div', { className: 'dch-section-title' }, 'TTS'),
        React.createElement('div', { className: 'dch-row' },
          React.createElement(ChattyField, { label: t('provider') },
            React.createElement('select', {
              value: tts.provider || 'volcano', disabled: !writable,
              onChange: (event) => setIn('tts', 'provider', event.target.value),
            }, (ttsProviders.length ? ttsProviders : [{ key: 'volcano' }, { key: 'siliconflow' }])
              .map((item) => React.createElement('option', { key: item.key, value: item.key }, item.key)))),
          React.createElement(ChattyField, { label: t('credential') },
            React.createElement('input', {
              type: 'text', value: tts.credential || '', disabled: !writable,
              onChange: (event) => setIn('tts', 'credential', event.target.value),
            })),
          React.createElement(ChattyField, { label: t('voice') },
            React.createElement('input', {
              type: 'text', value: tts.voice || '', disabled: !writable, list: 'dch-voices',
              onChange: (event) => setIn('tts', 'voice', event.target.value),
            }),
            React.createElement('datalist', { id: 'dch-voices' },
              voices.filter((item) => !tts.provider || item.provider === tts.provider)
                .map((item) => React.createElement('option', { key: item.provider + ':' + item.id, value: item.id }, item.label || item.id))))),
        React.createElement('div', { className: 'dch-row' },
          React.createElement(ChattyField, { label: t('speed') },
            React.createElement('input', {
              type: 'number', step: '0.1', min: '0.5', max: '2', value: tts.speed ?? 1, disabled: !writable,
              onChange: (event) => setIn('tts', 'speed', Number(event.target.value)),
            })),
          React.createElement(ChattyField, { label: t('volume') },
            React.createElement('input', {
              type: 'number', step: '0.1', min: '0', max: '1', value: tts.volume ?? 1, disabled: !writable,
              onChange: (event) => setIn('tts', 'volume', Number(event.target.value)),
            })),
          React.createElement(ChattyField, { label: t('format'), hint: 'pcm / mp3 / wav' },
            React.createElement('input', {
              type: 'text', value: tts.format || 'pcm', disabled: !writable,
              onChange: (event) => setIn('tts', 'format', event.target.value),
            }))),
        React.createElement('div', { className: 'dch-row' },
          React.createElement(ChattyCheck, {
            label: t('autoRead'), checked: !!tts.auto_read, disabled: !writable,
            onChange: (next) => setIn('tts', 'auto_read', next),
          }),
          React.createElement(ChattyCheck, {
            label: t('interruptOnSpeech'), checked: tts.interrupt_on_speech !== false, disabled: !writable,
            onChange: (next) => setIn('tts', 'interrupt_on_speech', next),
          }),
          React.createElement(ChattyCheck, {
            label: t('codeHint'), checked: tts.code_hint !== false, disabled: !writable,
            onChange: (next) => setIn('tts', 'code_hint', next),
          }),
          React.createElement(ChattyCheck, {
            label: t('llmSummary'), checked: tts.llm_summary !== false, disabled: !writable,
            onChange: (next) => setIn('tts', 'llm_summary', next),
          })),

        React.createElement('div', { className: 'dch-section-title' }, 'UI'),
        React.createElement('div', { className: 'dch-row' },
          React.createElement(ChattyCheck, {
            label: '显示 Voice Bar', checked: ui.show_voice_bar !== false, disabled: !writable,
            onChange: (next) => setIn('ui', 'show_voice_bar', next),
          }),
          React.createElement(ChattyCheck, {
            label: '显示 Voice Draft 面板', checked: ui.show_draft_panel !== false, disabled: !writable,
            onChange: (next) => setIn('ui', 'show_draft_panel', next),
          }),
          React.createElement(ChattyField, { label: '可视化', hint: 'bars / wave / off' },
            React.createElement('input', {
              type: 'text', value: ui.visualizer || 'bars', disabled: !writable,
              onChange: (event) => setIn('ui', 'visualizer', event.target.value),
            }))),
        React.createElement(ChattyCheck, {
          label: '允许润色调用模型', checked: (draft.polish || {}).enabled !== false, disabled: !writable,
          onChange: (next) => setIn('polish', 'enabled', next),
        }),

        React.createElement('div', { className: 'dch-actions', style: { marginTop: '6px' } },
          React.createElement('button', {
            type: 'button', className: 'dch-action', 'data-primary': '1', disabled: !writable,
            onClick: save,
          }, saved ? t('saved') : t('save')),
          React.createElement('button', {
            type: 'button', className: 'dch-action',
            onClick: () => { setDraft(JSON.parse(JSON.stringify(value))); setError('') },
          }, t('reload')),
          error ? React.createElement('span', { className: 'dch-status', 'data-error': '1' }, error) : null))
    }

    function ChattyPluginCard(props) {
      const page = !!(props && props.view === 'page')
      const [open, setOpen] = React.useState(!!page)
      const tt = (props && props.t) || t
      if (props && props.view === 'summary') {
        return React.createElement('span', { className: 'dch-muted' }, tt('cardHint'))
      }
      return React.createElement(page ? 'div' : 'li', { className: 'dch-card' },
        React.createElement('button', {
          type: 'button', className: 'dch-card-head',
          style: page ? { display: 'none' } : undefined,
          'aria-expanded': page ? 'true' : (open ? 'true' : 'false'),
          onClick: () => setOpen((current) => !current),
        },
        React.createElement('span', null,
          React.createElement('strong', null, tt('title')),
          React.createElement('span', { className: 'dch-muted', style: { marginLeft: '8px' } }, tt('cardHint')))),
        (page || open) ? React.createElement(ChattySection, Object.assign({}, props, { t: tt })) : null)
    }

    function registerSettings(ctx) {
      ctx.slots.inject('plugins.item', () => ctx.slots.register({
        name: 'plugins.item', id: ROW_ID, order: 61, label: () => 'Voice', locale: NS,
        inject: () => ({ ctx }),
      }, ChattyPluginCard))
      ctx.slots.inject('plugins.row.config', () => ctx.slots.register({
        name: 'plugins.row.config', key: ROW_CONFIG_KEY, locale: NS,
        inject: () => ({ ctx }),
      }, ChattyPluginCard))
      ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
        name: 'settings.plugin.item', key: NS, locale: NS,
        inject: () => ({ ctx }),
      }, ChattyPluginCard))
    }

// ---- lib/client-src/90-close.js ----
    // ── 注册 ──────────────────────────────────────────────────────────
    function registerChattySlots(ctx) {
      ctx.slots.inject('conversation.input.right', () => ctx.slots.register(
        { name: 'conversation.input.right', id: PKG, order: 7, locale: NS, label: () => t('barSlot') },
        (props) => React.createElement(VoiceBar, {
          sessionId: props.sessionId,
          input: props.input,
          inputActions: props.inputActions,
        }),
      ))
      ctx.slots.inject('conversation.input.dock', () => ctx.slots.register(
        { name: 'conversation.input.dock', id: 'dsh-chatty-draft', order: 1, locale: NS, label: () => t('draftSlot') },
        (props) => React.createElement(DraftPanel, {
          input: props.input,
          inputActions: props.inputActions,
        }),
      ))
    }

    exports.inject = ['timer', 'slots', 'settingsScope', 'locale', 'uiSession']
    exports.apply = function apply(ctx) {
      installChattyStyle()

      // 文案注册：英文兜底，中文（zh / zh-CN）为默认展示。
      const addLocale = (locale, dictionary) => {
        try { return ctx.locale.register(NS, locale, dictionary) } catch { return () => {} }
      }
      ctx.effect(() => {
        const undo = [addLocale('en', en), addLocale('zh', zh), addLocale('zh-CN', zh)]
        return () => { for (const off of undo) off() }
      }, 'dsh-chatty: locale dictionaries')
      moduleT = ctx.locale.bind(NS)

      // 设置保存后立刻按新配置生效：自动朗读连接、VAD 参数、可视化。
      ctx.effect(() => {
        const reload = () => {
          refreshChattySettings().then((settings) => {
            if (!settings) return
            audioEngine.configure(chattySetting('stt.vad', null))
            if (chattySetting('tts.auto_read', false)) connectSpeechEvents(chatty.sessionId)
            else disconnectSpeechEvents()
          })
        }
        window.addEventListener('dsh-chatty:settings-saved', reload)
        return () => window.removeEventListener('dsh-chatty:settings-saved', reload)
      }, 'dsh-chatty: reload settings')

      registerChattySlots(ctx)
      registerSettings(ctx)

      ctx.effect(() => () => {
        try { stopListening() } catch { /* 未在监听 */ }
        try { stopSpeaking(true) } catch { /* 未在播放 */ }
        disconnectSpeechEvents()
      }, 'dsh-chatty: release audio resources')
    }
    return module.exports
  },
})
