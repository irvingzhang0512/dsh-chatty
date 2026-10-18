
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
      dictationMode: 'Dictation: speech goes into the input box',
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
      dictationMode: '听写模式：语音写进输入框',
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
.dch-bar { display: flex; align-items: center; gap: 8px; min-width: 0; }
.dch-bar-status { display: flex; align-items: center; gap: 8px; min-width: 0; }
.dch-timer { font-size: 11px; opacity: .6; font-variant-numeric: tabular-nums; }
/* 悬停提示：任何带 data-tip 的元素（图标按钮等），即时显示、黑底白字通用 */
.dch-tipwrap, .dch-btn, .dch-action { position: relative; }
[data-tip]::after { content: attr(data-tip); position: absolute; bottom: calc(100% + 6px); left: 50%;
  transform: translateX(-50%); padding: 4px 8px; border-radius: 6px; background: rgba(24,24,28,.94); color: #fff;
  font-size: 11px; line-height: 1.4; white-space: nowrap; opacity: 0; pointer-events: none;
  transition: opacity .1s ease .15s; z-index: 40; box-shadow: 0 2px 8px rgba(0,0,0,.25); }
[data-tip]:hover::after { opacity: 1; }
.dch-btn { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px;
  padding: 0; border: none; border-radius: 50%; background: transparent; color: inherit; cursor: pointer; }
.dch-btn:hover:not(:disabled) { background: var(--dsw-alias-bg-secondary, rgba(127,127,127,.16)); }
.dch-btn:disabled { opacity: .45; cursor: default; }
.dch-btn[data-active="1"] { color: var(--dsw-alias-state-error-primary, #d9534f); }
.dch-panel { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px;
  border: 1px solid var(--dsw-alias-border-secondary, rgba(127,127,127,.25)); border-radius: 10px;
  background: var(--dsw-alias-bg-secondary, rgba(127,127,127,.06)); font-size: 12px; }
.dch-panel-head { display: flex; align-items: center; gap: 8px; }
.dch-spacer { flex: 1 1 auto; }
.dch-panel-actions { display: flex; gap: 6px; justify-content: flex-end; flex-wrap: wrap; }
.dch-help { display: flex; flex-direction: column; gap: 4px; font-size: 12px; padding: 8px 10px;
  border-radius: 8px; background: var(--dsw-alias-bg-secondary, rgba(127,127,127,.08)); }
.dch-help-row { display: flex; gap: 10px; align-items: baseline; }
.dch-help-row > b { flex: 0 0 96px; font-weight: 600; }
.dch-help-row > code { font-family: ui-monospace, Consolas, monospace; opacity: .85; }
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
.dch-levels { display: inline-flex; align-items: flex-end; gap: 2px; height: 18px; }
.dch-levels span { display: block; width: 3px; border-radius: 2px; background: currentColor; opacity: .65; }
.dch-levels.dch-viz-active span { background: var(--dsw-alias-bg-accent, #3b82f6); opacity: .95; }
.dch-notice { font-size: 12px; opacity: .8; }
.dch-dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; opacity: .8; }
.dch-dot[data-on="1"] { background: var(--dsw-alias-state-error-primary, #d9534f); animation: dch-pulse 1.1s infinite; }
@keyframes dch-pulse { 0%,100% { opacity: 1 } 50% { opacity: .3 } }
.dch-card { list-style: none; border: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.25)); background: var(--dsw-alias-bg-layer-3, transparent); border-radius: 12px; margin-top: 8px; }
.dch-card-head { appearance: none; width: 100%; font: inherit; color: inherit; text-align: left; cursor: pointer;
  background: 0 0; border: 0; border-radius: 12px; display: flex; align-items: center; gap: 12px; padding: 14px 16px; }
.dch-card-text { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
.dch-card-title { color: var(--dsw-alias-label-primary, inherit); font-size: 15px; font-weight: 600; line-height: 1.4; }
.dch-card-desc { color: var(--dsw-alias-label-secondary, rgba(127,127,127,.75)); font-size: 13px; }
.dch-chev { flex: none; display: flex; color: var(--dsw-alias-label-secondary, rgba(127,127,127,.6)); transition: transform .15s ease; }
.dch-card[data-open="1"] .dch-chev { transform: rotate(180deg); }
.dch-card-body { border-top: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.2)); margin: 0 16px;
  padding: 12px 0 14px; display: flex; flex-direction: column; gap: 10px; }
.dch-tabs { display: flex; gap: 4px; flex-wrap: wrap; }
.dch-tab { font-size: 12px; padding: 4px 10px; border-radius: 8px; cursor: pointer;
  border: 1px solid transparent; background: transparent; color: inherit; }
.dch-tab:hover { background: var(--dsw-alias-bg-secondary, rgba(127,127,127,.14)); }
.dch-tab[data-active="1"] { background: var(--dsw-alias-bg-secondary, rgba(127,127,127,.14));
  border-color: var(--dsw-alias-border-secondary, rgba(127,127,127,.3)); }
.dch-cred { display: flex; flex-direction: column; gap: 6px; padding: 8px 10px;
  border: 1px solid var(--dsw-alias-border-secondary, rgba(127,127,127,.25)); border-radius: 8px; }
.dch-cred-row { display: flex; align-items: center; gap: 6px; font-size: 12px; flex-wrap: wrap; }
.dch-cred-ok { color: var(--dsw-alias-state-success-primary, #2e9e5b); }
.dch-cred-bad { color: var(--dsw-alias-state-error-primary, #d9534f); }
.dch-cred-hint { font-size: 11px; opacity: .75; white-space: pre-wrap; margin: 0;
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
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
/* v6: 与 Desktop 原生设置同一主题，所有选择器限定在 Chatty 卡片。 */
.dch-settings{font-size:14px;line-height:1.6;gap:20px;max-width:1040px;padding:20px 0;color:var(--dsw-alias-label-primary)}
.dch-settings-top{display:flex;justify-content:space-between;gap:16px;align-items:center;flex-wrap:wrap}
.dch-settings button{font:inherit;min-height:36px;box-sizing:border-box;border-radius:8px;color:var(--dsw-alias-label-primary);cursor:pointer}
.dch-settings button:disabled{opacity:.45;cursor:default}
.dch-settings button.dch-primary{background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}
.dch-unit{min-height:36px;display:flex;align-items:center;color:var(--dsw-alias-label-secondary);font-size:12px;white-space:nowrap;flex:none}
.dch-settings button:not([class]){border:1px solid var(--dsw-alias-border-l3);background:transparent;padding:0 12px}
.dch-settings button:focus-visible,.dch-settings summary:focus-visible,.dch-settings input:focus-visible,.dch-settings select:focus-visible,.dch-settings textarea:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}
.dch-settings input:not([type=checkbox]),.dch-settings select,.dch-settings textarea{box-sizing:border-box;width:100%;min-width:0;min-height:36px;border:1px solid var(--dsw-alias-border-l3);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;padding:6px 10px}
.dch-settings textarea{min-height:84px;resize:vertical}
.dch-settings .dch-muted{font-size:12px;line-height:1.6;color:var(--dsw-alias-label-tertiary);opacity:1;overflow-wrap:anywhere}
.dch-settings .dch-tabs{gap:8px;align-items:center}
.dch-settings .dch-segmented{box-sizing:border-box;width:100%;min-width:0;max-width:640px}
.dch-settings .dch-segmented button{font-size:14px;white-space:normal;padding:4px 8px;height:auto}
.dch-group-tab[data-active=1],.dch-settings .dch-tab[data-active=1]{background:var(--dsw-alias-interactive-bg-hover-solid);font-weight:600}
.dch-selection-summary{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:12px 16px;border-radius:10px;background:var(--dsw-alias-bg-module-platform)}
.dch-setting-section{border:1px solid var(--dsw-alias-settings-card-stroke,var(--dsw-alias-border-l3));border-radius:12px;padding:16px 20px;margin:0 0 24px;background:var(--dsw-alias-settings-card-fill,var(--dsw-alias-bg-layer-1))}
.dch-setting-section h3,.dch-setting-section>summary{margin:0 0 12px;font-size:14px;line-height:22px;font-weight:600}
.dch-setting-section>summary{margin-bottom:0;cursor:pointer}
.dch-setting-section[open]>summary{margin-bottom:16px}
.dch-settings .dch-field{display:grid;grid-template-columns:minmax(160px,32%) minmax(0,1fr);gap:16px;font-size:14px;padding:14px 0;border-bottom:1px solid var(--dsw-alias-border-l4);align-items:start}
.dch-settings .dch-field:last-child{border-bottom:0}
.dch-field-label{display:flex;gap:4px;align-items:center;min-height:36px}
.dch-field-control{display:flex;align-items:flex-start;gap:8px;min-width:0}
.dch-field-control>:first-child{flex:1;min-width:0}
.dch-field-control>button[role=switch]{flex:none;width:40px;min-height:24px;margin-top:6px}
.dch-settings .dch-reset,.dch-settings .dch-help{min-height:28px;width:28px;padding:0;flex:none}
.dch-settings .dch-reset{margin-top:4px;opacity:.65}
.dch-settings .dch-reset:hover{opacity:1}
.dch-advanced,.dch-custom,.dch-source,.dch-diagnostics{margin-top:12px;color:var(--dsw-alias-label-secondary);font-size:12px}
.dch-advanced>summary,.dch-custom>summary,.dch-source>summary,.dch-diagnostics>summary{cursor:pointer;padding:4px 0;min-height:24px}
.dch-custom input{margin:8px 0}
.dch-control-line{display:flex;align-items:flex-start;gap:8px}
.dch-control-line>:first-child{flex:1;min-width:0}
.dch-model-control{display:flex;flex-direction:column;gap:6px}
.dch-picker{position:relative;min-width:0}
.dch-picker>summary{box-sizing:border-box;list-style:none;min-height:36px;border:1px solid var(--dsw-alias-border-l3);border-radius:8px;padding:6px 10px;background:var(--dsw-alias-bg-layer-1);cursor:pointer;display:flex;justify-content:space-between;gap:8px;overflow-wrap:anywhere}
.dch-picker>summary::-webkit-details-marker{display:none}
.dch-picker-menu{position:absolute;z-index:20;left:0;right:0;min-width:min(360px,70vw);padding:10px;margin-top:4px;border-radius:10px;border:1px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-layer-1);box-shadow:0 8px 24px #0002}
.dch-picker-options{display:flex;flex-direction:column;max-height:240px;overflow-y:auto;margin-top:8px}
.dch-picker-options button{justify-content:flex-start;text-align:left;white-space:normal;overflow-wrap:anywhere;min-height:36px;height:auto;padding:8px}
.dch-picker-options button[aria-selected=true]{background:var(--dsw-alias-interactive-bg-hover-solid)}
.dch-ready{color:var(--dsw-alias-state-success-primary)}
.dch-error{color:var(--dsw-alias-state-error-primary);font-size:12px;overflow-wrap:anywhere}
.dch-settings-footer{position:sticky;bottom:0;z-index:10;align-items:center;gap:8px;padding:14px 0;background:var(--dsw-alias-bg-layer-1);border-top:1px solid var(--dsw-alias-border-l3)}
.dch-settings-footer>span{margin-right:auto;font-size:12px;color:var(--dsw-alias-label-secondary)}
.dch-settings .dch-diagnostics pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}
.dch-enhancement-title{font-size:18px;margin:0;padding:16px;border-bottom:1px solid var(--dsw-alias-border-l3)}
.dch-official-advanced{margin-top:24px;padding:16px;border:1px solid var(--dsw-alias-border-l3);border-radius:12px}
.dch-official-advanced>summary{cursor:pointer;font-weight:600}
.dch-advanced-owner{margin-top:24px}
.dch-owner-actions[data-owner-actions=chatty]{display:contents}
.dch-owner-fields{border:0;padding:0;margin:0;min-width:0}
.dch-help-fallback{position:relative;font-size:12px}
.dch-help-fallback>span{display:none;position:absolute;z-index:25;width:300px;padding:12px;border:1px solid var(--dsw-alias-border-l3);border-radius:8px;background:var(--dsw-alias-bg-layer-1);white-space:pre-line}
.dch-help-fallback[open]>span,.dch-help-fallback:hover>span,.dch-help-fallback:focus-within>span{display:block}
@media(max-width:640px){.dch-settings .dch-field{grid-template-columns:1fr;gap:6px}.dch-setting-section{padding:12px}.dch-settings-top{align-items:flex-start}.dch-settings-footer{flex-wrap:wrap}.dch-picker-menu{min-width:0}}

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
  sttPhase: 'OFF', // OFF | LISTENING | SPEECH_DETECTED | TRANSCRIBING | PAUSED | RECONNECTING | ERROR
  ttsPhase: 'IDLE', // IDLE | PREPARING | PLAYING | INTERRUPTED | ERROR
  sttError: '',
  ttsError: '',
  levels: [],
  partial: '',
  draft: { text: '', size: 0, utterances: [] },
  notice: '',
  busy: '',
  supported: true,
  pendingResults: [],
  ledger: null,
  ttsProgress: null, // { index, total } 朗读进度
  ttsStage: '', // PREPARING 子阶段：render | synth
  settings: null, // 宿主 /status 下发的实时配置
  inputActions: null,
  input: null,
  lastRenderedDraft: null,
  listeners: new Set(),
  notify() {
    this.listeners.forEach((listener) => listener())
  },
  set(patch) {
    Object.assign(this, patch)
    this.notify()
  },
  subscribe(listener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
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
    if (chatty.notice === message) {
      chatty.notice = ''
      chatty.notify()
    }
  }, 1800)
}

function sttStatusText() {
  const settings = chatty.settings
  switch (chatty.sttPhase) {
    case 'LISTENING':
      return t('listening')
    case 'SPEECH_DETECTED':
      return t('speechDetected')
    case 'TRANSCRIBING':
      return t('transcribing')
    case 'PAUSED':
      return t('paused')
    case 'RECONNECTING':
      return t('reconnecting')
    case 'ERROR':
      return chatty.sttError || t('error')
    default:
      return t('off')
  }
}

function ttsStatusText() {
  switch (chatty.ttsPhase) {
    case 'PREPARING':
      return t('preparing')
    case 'PLAYING':
      return t('reading')
    case 'INTERRUPTED':
      return t('interrupted')
    case 'ERROR':
      return chatty.ttsError || t('error')
    default:
      return ''
  }
}

// ── 图标（16px / 1.5 描边，与 DSH 图标库一致） ────────────────────
const CHATTY_ICON = {
  width: 16,
  height: 16,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round'
}
const iconMic = () =>
  React.createElement(
    'svg',
    CHATTY_ICON,
    React.createElement('rect', {
      x: 6,
      y: 2.75,
      width: 4,
      height: 6.75,
      rx: 2
    }),
    React.createElement('path', { d: 'M3.75 7.25a4.25 4.25 0 0 0 8.5 0' }),
    React.createElement('path', { d: 'M8 11.75v1.5M5.25 13.25h5.5' })
  )
const iconPause = () =>
  React.createElement(
    'svg',
    CHATTY_ICON,
    React.createElement('rect', {
      x: 4,
      y: 3,
      width: 3,
      height: 10,
      rx: 1,
      fill: 'currentColor',
      stroke: 'none'
    }),
    React.createElement('rect', {
      x: 9,
      y: 3,
      width: 3,
      height: 10,
      rx: 1,
      fill: 'currentColor',
      stroke: 'none'
    })
  )
const iconPlay = () =>
  React.createElement(
    'svg',
    CHATTY_ICON,
    React.createElement('polygon', {
      points: '5 3.5 13.5 8 5 12.5 5 3.5',
      fill: 'currentColor',
      stroke: 'none'
    })
  )
const iconStop = () =>
  React.createElement(
    'svg',
    CHATTY_ICON,
    React.createElement('rect', {
      x: 4.5,
      y: 4.5,
      width: 7,
      height: 7,
      rx: 1.75,
      fill: 'currentColor',
      stroke: 'none'
    })
  )
const iconSpeaker = () =>
  React.createElement(
    'svg',
    CHATTY_ICON,
    React.createElement('path', { d: 'M3 6.25h2L8 3.75v8.5L5 9.75H3z' }),
    React.createElement('path', { d: 'M10.5 6a3 3 0 0 1 0 4' }),
    React.createElement('path', { d: 'M12.25 4.25a5.5 5.5 0 0 1 0 7.5' })
  )
const iconChat = () =>
  React.createElement(
    'svg',
    CHATTY_ICON,
    React.createElement('path', {
      d: 'M13.25 7.75a5.25 5.25 0 0 1-7.9 4.55L2.75 13.25l.95-2.6a5.25 5.25 0 1 1 9.55-2.9z'
    }),
    React.createElement('path', { d: 'M5.75 7.25h4.5M5.75 9.25h3' })
  )
const iconClose = () =>
  React.createElement(
    'svg',
    CHATTY_ICON,
    React.createElement('line', { x1: 12, y1: 4, x2: 4, y2: 12 }),
    React.createElement('line', { x1: 4, y1: 4, x2: 12, y2: 12 })
  )
const iconSend = () =>
  React.createElement(
    'svg',
    CHATTY_ICON,
    React.createElement('path', { d: 'M2.5 8l11-5-4 11-2.5-4z' })
  )
const iconUndo = () =>
  React.createElement(
    'svg',
    CHATTY_ICON,
    React.createElement('path', { d: 'M3 7h6.5a3.5 3.5 0 0 1 0 7H6' }),
    React.createElement('path', { d: 'M5.5 4.5L3 7l2.5 2.5' })
  )

function chattyButton(spec) {
  if (PRIM && PRIM.Button) {
    // 自研 CSS 悬停提示（data-tip）——PRIM.Tooltip 的属性名跨版本不稳定，不依赖。
    return React.createElement(
      'span',
      { className: 'dch-tipwrap', 'data-tip': spec.label },
      React.createElement(PRIM.Button, {
        type: 'button',
        variant: 'toolbar',
        size: 'sm',
        icon: spec.icon,
        'aria-label': spec.label,
        disabled: spec.disabled,
        onClick: spec.onClick,
        'data-active': spec.active ? '1' : undefined
      })
    )
  }
  return React.createElement(
    'button',
    {
      type: 'button',
      className: 'dch-btn',
      'data-tip': spec.label,
      'aria-label': spec.label,
      disabled: spec.disabled,
      onClick: spec.onClick,
      'data-active': spec.active ? '1' : undefined
    },
    spec.icon
  )
}

// ── 传输 ──────────────────────────────────────────────────────────
async function postJson(url, body, options = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal: options.signal,
    body: JSON.stringify(body || {})
  })
  let parsed = null
  try {
    parsed = await res.json()
  } catch {
    /* 非 JSON 响应 */
  }
  if (!res.ok || !parsed || parsed.ok !== true) {
    const message =
      (parsed && parsed.error && parsed.error.message) || `HTTP ${res.status}`
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
    throw new Error(
      (parsed && parsed.error && parsed.error.message) || `HTTP ${res.status}`
    )
  }
  return parsed
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    if (typeof FileReader === 'undefined') {
      reject(new Error('FileReader not supported'))
      return
    }
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
  const write = (offset, text) => {
    for (let i = 0; i < text.length; i += 1)
      view.setUint8(offset + i, text.charCodeAt(i))
  }
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
    if(typeof signalChattyStatus==='function')signalChattyStatus()
    chatty.notify()
    return data
  } catch (error) {
    chatty.settings = chatty.settings || null
    chatty.sttError = String((error && error.message) || error)
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
  requestGeneration: 0,
  paused: false,
  stream: null,
  audioCtx: null,
  source: null,
  analyser: null,
  processor: null,
  callbacks: {},
  vad: {
    enabled: true,
    sensitivity: 0.6,
    silence_timeout_ms: 1200,
    min_speech_ms: 200,
    pre_roll_ms: 400
  },
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
      sensitivity: Number(vad.sensitivity ?? 0.6),
      silence_timeout_ms: Number(vad.silence_timeout_ms ?? 1200),
      min_speech_ms: Number(vad.min_speech_ms ?? 200),
      pre_roll_ms: Number(vad.pre_roll_ms ?? 400)
    }
    this.vad = next
    this.preRollLimit = Math.max(
      0,
      Math.round((next.pre_roll_ms * TARGET_SAMPLE_RATE * 2) / 1000)
    )
  },

  async start(callbacks, options = {}) {
    if (this.running) return true
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      throw new Error(t('unsupported'))
    }
    const requestGeneration = ++this.requestGeneration
    this.callbacks = callbacks || {}
    this.configure(options.vad)
    this.preRollLimit = Math.max(
      0,
      Math.round((this.vad.pre_roll_ms * TARGET_SAMPLE_RATE * 2) / 1000)
    )

    const constraints = {
      audio: {
        deviceId: options.deviceId ? { exact: options.deviceId } : undefined,
        noiseSuppression: options.noiseSuppression !== false,
        echoCancellation: options.echoCancellation !== false,
        autoGainControl: options.autoGainControl !== false,
        channelCount: 1
      },
      video: false
    }
    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints)
    } catch (error) {
      // 设备 ID 失效时退回到系统默认设备，否则用户会被卡死在错误上。
      if (
        options.deviceId &&
        ['NotFoundError', 'OverconstrainedError'].includes(error.name)
      )
        stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false
        })
      else throw error
    }
    if (requestGeneration !== this.requestGeneration) {
      stream.getTracks().forEach((t) => t.stop())
      throw Error('录音请求已取消')
    }
    this.stream = stream

    const Ctx =
      typeof AudioContext !== 'undefined'
        ? AudioContext
        : typeof webkitAudioContext !== 'undefined'
          ? webkitAudioContext
          : null
    if (!Ctx) {
      this.stop()
      throw new Error(t('unsupported'))
    }
    let ctx
    try {
      ctx = new Ctx({ sampleRate: TARGET_SAMPLE_RATE })
    } catch {
      ctx = new Ctx()
    }
    this.audioCtx = ctx
    this.sampleRate = ctx.sampleRate || TARGET_SAMPLE_RATE
    this.resampleTail = new Float32Array(0)
    this.resamplePosition = 0

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
    this.requestGeneration++
    this.running = false
    this.paused = false
    this.speaking = false
    if (this.processor) {
      try {
        this.processor.disconnect()
      } catch {
        /* 已断开 */
      }
      this.processor.onaudioprocess = null
    }
    if (this.source) {
      try {
        this.source.disconnect()
      } catch {
        /* 已断开 */
      }
    }
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        try {
          track.stop()
        } catch {
          /* 已停止 */
        }
      }
    }
    if (this.audioCtx) {
      try {
        this.audioCtx.close()
      } catch {
        /* 已关闭 */
      }
    }
    this.stream = null
    this.audioCtx = null
    this.source = null
    this.analyser = null
    this.processor = null
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
    if (this.pendingVad) {
      this.configure(this.pendingVad)
      this.pendingVad = null
    }
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
    const sensitivity = Math.max(
      0,
      Math.min(1, Number(this.vad.sensitivity ?? 0.6))
    )
    return Math.max(
      this.noiseFloor * (1.6 + (1 - sensitivity) * 2.4),
      0.003 + (1 - sensitivity) * 0.02
    )
  },

  handleFrame(event) {
    if (!this.running || this.paused) return
    const input = event.inputBuffer.getChannelData(0)
    const pcm = this.toPcm16(input)
    const rms = Math.sqrt(
      input.reduce((sum, value) => sum + value * value, 0) /
        Math.max(1, input.length)
    )
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

    // 在采集帧内切句，保留跨上限的剩余 PCM，避免每次切句丢掉帧尾。
    const limits = sttClient.current?.cfg?.limits || chatty.settings?.limits
    const bound =
      Math.floor(
        Math.min(
          limits?.maxAudioBytes - 44 || 4194260,
          (limits?.maxDurationSeconds || 30) * 32000
        ) / 2
      ) * 2
    const available = Math.max(0, bound - this.utteranceBytes),
      accepted = pcm.subarray(0, available),
      remainder = pcm.subarray(accepted.length)
    this.utterance.push(accepted)
    this.utteranceBytes += accepted.length
    this.speechMs += accepted.length / 32
    if (accepted.length) this.emit('onFrame', accepted)
    if (speech) this.silenceMs = 0
    else this.silenceMs += frameMs
    this.pushLevel(rms)

    if (this.utteranceBytes >= bound) {
      this.finishUtterance('limit')
      if (this.running && sttClient.active && remainder.length) {
        this.speaking = true
        this.emit('onSpeechStart', new Uint8Array(0))
        if (this.running) {
          this.utterance = [remainder]
          this.utteranceBytes = remainder.length
          this.speechMs = remainder.length / 32
          this.emit('onFrame', remainder)
        }
      }
      return
    }

    if (
      this.vad.enabled !== false &&
      this.silenceMs >= this.vad.silence_timeout_ms
    ) {
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
    const cap = chatty.settings?.limits
    const limit = Math.min(
      this.preRollLimit || 0,
      cap?.maxAudioBytes - 44 || 4194260,
      (cap?.maxDurationSeconds || 30) * 32000
    )
    if (limit <= 0) return
    this.preRoll.push(pcm)
    this.preRollBytes += pcm.length
    while (this.preRollBytes > limit && this.preRoll.length > 1) {
      const dropped = this.preRoll.shift()
      this.preRollBytes -= dropped.length
    }
    if (this.preRollBytes > limit) {
      const trim = this.preRollBytes - limit
      this.preRoll[0] = this.preRoll[0].subarray(Math.ceil(trim / 2) * 2)
      this.preRollBytes = this.preRoll[0].length
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
    try {
      handler(...args)
    } catch (error) {
      if (typeof this.callbacks.onError === 'function')
        this.callbacks.onError(error)
    }
  },

  /** Float32 [-1,1] → PCM16 小端字节。 */
  toPcm16(input) {
    if (this.sampleRate !== TARGET_SAMPLE_RATE) {
      const tail = this.resampleTail || new Float32Array(0),
        merged = new Float32Array(tail.length + input.length)
      merged.set(tail)
      merged.set(input, tail.length)
      const values = [],
        step = this.sampleRate / TARGET_SAMPLE_RATE
      let position = this.resamplePosition || 0
      while (position + 1 < merged.length) {
        const i = Math.floor(position),
          fraction = position - i
        values.push(merged[i] * (1 - fraction) + merged[i + 1] * fraction)
        position += step
      }
      const used = Math.min(merged.length, Math.floor(position))
      this.resampleTail = merged.slice(used)
      this.resamplePosition = position - used
      input = Float32Array.from(values)
    }
    const out = new Uint8Array(input.length * 2)
    const view = new DataView(out.buffer)
    for (let i = 0; i < input.length; i += 1) {
      const value = Math.max(-1, Math.min(1, input[i]))
      view.setInt16(i * 2, value < 0 ? value * 0x8000 : value * 0x7fff, true)
    }
    return out
  }
}

function concatPcm(chunks) {
  const list = (chunks || []).filter((item) => item && item.length)
  const total = list.reduce((sum, item) => sum + item.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const item of list) {
    out.set(item, offset)
    offset += item.length
  }
  return out
}

// ---- lib/client-src/45-stt.js ----
const sttClient = {
  active: false,
  generation: 0,
  current: null,
  tasks: new Set(),
  order: Promise.resolve()
}
async function consumeSse(url, onEvent, signal, ready) {
  const response = await fetch(url, { signal, cache: 'no-store' })
  if (!response.ok) throw Error('识别事件连接失败')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    for (;;) {
      const result = await reader.read()
      if (result.done) break
      buffer += decoder.decode(result.value, { stream: true })
      let index
      while ((index = buffer.indexOf('\n\n')) >= 0) {
        const event = buffer.slice(0, index)
        buffer = buffer.slice(index + 2)
        const kind = event.match(/^event: (.+)$/m)?.[1]
        const value = event.match(/^data: (.+)$/m)?.[1]
        if (!kind || !value) continue
        const data = JSON.parse(value)
        if (kind === 'ready') ready?.()
        onEvent(kind, data)
      }
    }
  } finally {
    reader.releaseLock()
  }
}
async function startListening() {
  if (sttClient.active || sttClient.starting) return
  const request = {},
    before = sttClient.generation
  sttClient.starting = request
  chatty.notify()
  try {
    const cfg = await refreshChattySettings()
    if (before !== sttClient.generation) return
    if (cfg?.migrationPending) {
      showNotice('请先在高级设置迁移旧配置')
      return
    }
    if (!cfg?.compatibility?.matched) {
      showNotice('请先匹配官方语音 Bundle')
      return
    }
    if (!chatty.sessionId || !chatty.ledger) {
      showNotice('请先选择会话')
      return
    }
    if (
      Math.min(
        cfg.limits.maxAudioBytes - 44,
        cfg.limits.maxDurationSeconds * 32000
      ) < Math.max(4096, cfg.stt.vad.min_speech_ms * 32)
    ) {
      showNotice('音频上限太短，请调整官方上限或最短人声参数')
      return
    }
    const gen = ++sttClient.generation
    sttClient.active = true
    sttClient.counter = 0
    chatty.listenStartedAt = Date.now()
    try {
      await audioEngine.start(
        {
          onSpeechStart: beginUtterance,
          onFrame: feedUtterance,
          onSpeechEnd: endUtterance,
          onSpeechDiscard: () => discardUtterance(),
          onError: handleSttFailure
        },
        {
          vad: cfg.stt.vad,
          deviceId: cfg.mic_device_id,
          noiseSuppression: cfg.noise_suppression,
          echoCancellation: cfg.echo_cancellation,
          autoGainControl: cfg.auto_gain_control
        }
      )
      if (gen !== sttClient.generation) return
      setSttPhase('LISTENING')
    } catch (error) {
      if (gen !== sttClient.generation) return
      sttClient.active = false
      audioEngine.stop()
      setSttPhase('ERROR', String(error.message))
    }
  } finally {
    if (sttClient.starting === request) {
      sttClient.starting = null
      chatty.notify()
    }
  }
}
async function stopListening() {
  if (!sttClient.active) return
  sttClient.active = false
  if (audioEngine.speaking) audioEngine.finishUtterance('manual')
  audioEngine.stop()
  if (!sttClient.tasks.size) setSttPhase('OFF')
}
function cancelListening() {
  sttClient.starting = null
  chatty.polishController?.abort()
  for (const controller of sttClient.retries || []) controller.abort()
  sttClient.retries?.clear()
  sttClient.active = false
  sttClient.generation++
  audioEngine.stop()
  for (const task of sttClient.tasks) {
    cancelBatchCapture(task)
    task.controller.abort()
    task.eventController.abort()
    task.settle('')
    if (task.streamId)
      postJson('/dsh-chatty/stt/stream/cancel', {
        streamId: task.streamId
      }).catch(() => {})
  }
  sttClient.tasks.clear()
  sttClient.current = null
  chatty.partial = ''
  setSttPhase('OFF')
}
function pauseListening() {
  cancelListening()
}
function resumeListening() {
  return startListening()
}
function toggleListening() {
  return sttClient.active ? stopListening() : startListening()
}
function beginUtterance(preRoll) {
  const cfg = chatty.settings
  if (
    sttClient.tasks.size + chatty.pendingResults.length >=
    cfg.stt.max_pending
  ) {
    sttClient.active = false
    audioEngine.stop()
    showNotice('待处理句已满，请先处理结果后重新开始')
    return
  }
  if (['PLAYING', 'PREPARING'].includes(chatty.ttsPhase)) {
    if (cfg.tts.interrupt_on_speech) interruptSpeaking('speech')
    else return
  }
  const task = {
    id:
      globalThis.crypto?.randomUUID?.() ||
      Date.now().toString(36) + '-' + Math.random().toString(36).slice(2),
    generation: sttClient.generation,
    sessionId: chatty.sessionId,
    utteranceSeq: ++sttClient.counter,
    anchor: chatty.ledger.capture(),
    cfg: JSON.parse(JSON.stringify(cfg)),
    chunks: [],
    bytes: 0,
    push: Promise.resolve(),
    sequence: 0,
    controller: new AbortController(),
    eventController: new AbortController(),
    partial: '',
    final: false
  }
  task.done = new Promise((resolve) => {
    task.settle = resolve
  })
  sttClient.current = task
  sttClient.tasks.add(task)
  sttClient.order = sttClient.order
    .then(async () => {
      try {
        const text = await task.done
        if (
          task.generation === sttClient.generation &&
          task.sessionId === chatty.sessionId &&
          text
        )
          await handleRecognizedText(text, task)
      } finally {
        sttClient.tasks.delete(task)
        if (!sttClient.active && !sttClient.tasks.size) setSttPhase('OFF')
      }
    })
    .catch((error) => showNotice(String(error.message)))
  task.timer = setTimeout(() => {
    cancelBatchCapture(task)
    task.controller.abort()
    task.eventController.abort()
    task.error = Error('识别超时')
    if (sttClient.current === task) audioEngine.finishUtterance('timeout')
    task.settle('')
    if (task.streamId)
      postJson('/dsh-chatty/stt/stream/cancel', {
        streamId: task.streamId
      }).catch(() => {})
  }, cfg.timeout_ms)
  if (cfg.stt.streaming && cfg.stt.capability.streaming) {
    task.open = (async () => {
      const result = await postJson(
        '/dsh-chatty/stt/stream/start',
        {
          sessionId: task.sessionId,
          recordingGeneration: task.generation,
          utteranceId: task.id,
          utteranceSeq: task.utteranceSeq,
          providerId: cfg.stt.provider,
          language: cfg.stt.language,
          sampleRate: 16000
        },
        { signal: task.controller.signal }
      )
      task.streamId = result.streamId
      await new Promise((resolve, reject) => {
        task.events = consumeSse(
          '/dsh-chatty/stt/stream/events?streamId=' +
            encodeURIComponent(task.streamId),
          (kind, data) => {
            if (
              data.recordingGeneration !== undefined &&
              data.recordingGeneration !== task.generation
            )
              return
            if (kind === 'partial') {
              task.partial = data.text
              chatty.partial = data.text
              chatty.notify()
            }
            if (kind === 'final') {
              task.final = true
              task.finalText = data.text
            }
            if (kind === 'error') task.error = Error(data.message)
          },
          task.eventController.signal,
          resolve
        ).catch(reject)
      })
      if (task.controller.signal.aborted) throw Error('识别已取消')
    })()
    task.open.catch((error) => {
      task.error = error
      if (error.code === 'compatibility') handleSttFailure(error)
    })
  } else {
    task.capture = postJson(
      '/dsh-chatty/stt/capture/start',
      {
        sessionId: task.sessionId,
        recordingGeneration: task.generation,
        utteranceId: task.id,
        utteranceSeq: task.utteranceSeq,
        providerId: cfg.stt.provider,
        language: cfg.stt.language
      },
      { signal: task.controller.signal }
    ).then((info) => {
      task.captureId = info.captureId
      task.cfg = {
        ...info.config,
        stt: { ...info.config.stt, capability: task.cfg.stt.capability },
        limits: info.limits || task.cfg.limits
      }
      if (task.controller.signal.aborted) cancelBatchCapture(task)
      return info
    })
    task.capture.catch((error) => {
      task.error = error
      if (error.code === 'compatibility') handleSttFailure(error)
    })
  }
  if (preRoll?.length) feedUtterance(preRoll)
}
function cancelBatchCapture(task) {
  if (task.open) return
  postJson('/dsh-chatty/stt/capture/cancel', {
    captureId: task.captureId,
    sessionId: task.sessionId,
    recordingGeneration: task.generation,
    utteranceId: task.id
  }).catch(() => {})
}
function feedUtterance(pcm) {
  const task = sttClient.current
  if (!task) return
  if (
    task.bytes + pcm.length + 44 > task.cfg.limits.maxAudioBytes ||
    task.bytes + pcm.length > task.cfg.limits.maxDurationSeconds * 32000
  ) {
    audioEngine.finishUtterance('limit')
    return
  }
  task.chunks.push(pcm)
  task.bytes += pcm.length
  if (task.open) {
    queueStreamAudio(task, pcm)
  }
}
function queueStreamAudio(task, pcm, flush = false) {
  let combined = concatPcm([task.uploadBuffer || new Uint8Array(0), pcm])
  let offset = 0
  while (
    combined.length - offset >= 6400 ||
    (flush && combined.length > offset)
  ) {
    const part = combined.slice(offset, offset + 6400)
    offset += part.length
    task.push = task.push
      .then(async () => {
        await task.open
        if (task.error) throw task.error
        await postJson(
          '/dsh-chatty/stt/stream/push',
          {
            streamId: task.streamId,
            sequence: ++task.sequence,
            audioBase64: bytesToBase64(part)
          },
          { signal: task.controller.signal }
        )
      })
      .catch((error) => {
        task.error = error
        if (error.code === 'compatibility') handleSttFailure(error)
      })
  }
  task.uploadBuffer = combined.slice(offset)
}
function discardUtterance() {
  const task = sttClient.current
  sttClient.current = null
  if (!task) return
  clearTimeout(task.timer)
  task.controller.abort()
  task.eventController.abort()
  task.settle('')
  cancelBatchCapture(task)
  if (task.streamId)
    postJson('/dsh-chatty/stt/stream/cancel', {
      streamId: task.streamId
    }).catch(() => {})
}
async function endUtterance() {
  const task = sttClient.current
  sttClient.current = null
  if (!task) return
  try {
    let text = ''
    if (task.open) {
      queueStreamAudio(task, new Uint8Array(0), true)
      await task.push
      await task.open
      if (task.error) throw task.error
      const result = await postJson(
        '/dsh-chatty/stt/stream/stop',
        { streamId: task.streamId, lastSequence: task.sequence },
        { signal: task.controller.signal }
      )
      text = result.text
      if (!text && !task.final) throw Error('没有正式最终结果')
    } else {
      await task.capture
      if (task.error) throw task.error
      const wav = pcm16ToWavClient(concatPcm(task.chunks), 16000)
      const result = await postJson(
        '/dsh-chatty/stt/transcribe',
        {
          sessionId: task.sessionId,
          captureId: task.captureId,
          providerId: task.cfg.stt.provider,
          language: task.cfg.stt.language,
          audioBase64: bytesToBase64(wav)
        },
        { signal: task.controller.signal }
      )
      text = result.text
    }
    task.settle(String(text || ''))
  } catch (error) {
    task.error = error
    task.settle('')
    cancelBatchCapture(task)
    if (task.generation === sttClient.generation) {
      showNotice(String(error.message))
      chatty.pendingResults.push({
        id: task.id,
        text: task.partial || '识别失败，可重试本句',
        unconfirmed: true,
        retry: task
      })
    }
    if (task.streamId)
      postJson('/dsh-chatty/stt/stream/cancel', {
        streamId: task.streamId
      }).catch(() => {})
  } finally {
    clearTimeout(task.timer)
    task.eventController.abort()
    task.chunks = task.error ? task.chunks : []
    chatty.partial = ''
    chatty.notify()
    if (sttClient.active) setSttPhase('LISTENING')
  }
}
function handleSttFailure(error) {
  showNotice(String(error.message || error))
  cancelListening()
}

// ---- lib/client-src/50-draft.js ----
let commandParserClient = null
function getCommandParser(cfg) {
  if (cfg)
    return createCommandParser({
      commands: cfg.voice_control.commands,
      mode: cfg.voice_control.command_mode,
      wakePrefix: cfg.voice_control.wake_prefix,
      wakeWords: cfg.voice_control.wake_words
    })
  return createCommandParser({
    commands: chattySetting('voice_control.commands', DEFAULT_COMMANDS),
    mode: chattySetting('voice_control.command_mode', 'exact'),
    wakePrefix: chattySetting('voice_control.wake_prefix', 'DSH'),
    wakeWords: chattySetting('voice_control.wake_words', [])
  })
}
function getVoiceBuffer() {
  return chatty.ledger?.text() || ''
}
function resetVoiceSession() {
  chatty.ledger = null
}
async function handleRecognizedText(text, task) {
  if (task.cfg.voice_control.enabled) {
    const parsed = getCommandParser(task.cfg).parse(text)
    if (parsed) {
      if (
        ['send', 'undo', 'clear', 'polish'].includes(parsed.command) &&
        !chatty.ledger?.rebase(task.anchor)
      ) {
        chatty.pendingResults.push({ id: task.id, text })
        showNotice('草稿已变化，口令未执行，结果已保留')
        chatty.notify()
        return { command: null, conflict: true }
      }
      await runVoiceCommand(parsed.command)
      return { command: parsed.command }
    }
  }
  if (!chatty.ledger?.insert(text, task.anchor, task.cfg.draft.separator)) {
    chatty.pendingResults.push({ id: task.id, text })
    showNotice('草稿已变化，识别结果保留在下方')
  }
  chatty.notify()
  return { command: null }
}
function appendRecognized(text) {
  const anchor = chatty.ledger?.capture()
  if (anchor)
    chatty.ledger.insert(text, anchor, chattySetting('draft.separator', '\n'))
}
function undoLastInsert() {
  showNotice(
    chatty.ledger?.undo() ? '已撤销语音插入' : '无法可靠追踪，请使用输入框撤销'
  )
  chatty.notify()
}
function clearVoiceInserts() {
  showNotice(
    chatty.ledger?.clear() ? '已清除可追踪语音内容' : '草稿已变化，保留内容'
  )
  chatty.notify()
}
async function polishComposer() {
  if (chatty.busy) return
  if (!chattySetting('polish.enabled', true)) return
  const records = chatty.ledger?.records() || []
  if (!records.length) {
    showNotice('没有可追踪语音内容')
    return
  }
  const groups = []
  for (const r of records) {
    const last = groups.at(-1)
    if (last && last.end === r.start) {
      last.end = r.end
      last.text += r.text
    } else groups.push({ ...r })
  }
  let record = groups[0]
  if (groups.length > 1) {
    const answer = window.prompt(
      '请选择润色段号（1-' + groups.length + '）',
      '1'
    )
    record = groups[Number(answer) - 1]
    if (!record) return
  }
  record = { ...record, rev: chatty.ledger.capture().draftRev }
  const ledger = chatty.ledger,
    sessionId = chatty.sessionId
  const epoch = ledger.epoch()
  const controller = new AbortController()
  chatty.polishController = controller
  chatty.busy = 'polish'
  chatty.notify()
  try {
    const result = await postJson(
      '/dsh-chatty/draft',
      {
        action: 'polish',
        sessionId: chatty.sessionId,
        text: record.text
      },
      { signal: controller.signal }
    )
    if (
      controller.signal.aborted ||
      chatty.ledger !== ledger ||
      chatty.sessionId !== sessionId
    )
      return
    const text = result.draft.text
    if (
      epoch !== chatty.ledger?.epoch() ||
      !chatty.ledger.replace(text, { ...record, draftRev: record.rev, epoch })
    ) {
      chatty.pendingResults.push({ id: 'polish:' + Date.now(), text })
      showNotice('草稿已修改，润色结果已保留')
    }
  } catch (error) {
    if (!controller.signal.aborted) showNotice(String(error.message))
  } finally {
    if (chatty.polishController === controller) {
      chatty.polishController = null
      chatty.busy = ''
    }
    chatty.notify()
  }
}
function sendComposer() {
  if (!chatty.inputActions) return
  chatty.inputActions.submit()
}
async function insertPending(index) {
  const item = chatty.pendingResults[index]
  if (!item || !chatty.ledger) return
  if (item.unconfirmed) {
    showNotice('临时结果未经确认，请重试本句')
    return
  }
  if (chatty.ledger.insert(item.text, chatty.ledger.capture(), '')) {
    chatty.pendingResults.splice(index, 1)
    chatty.notify()
  }
}
async function retryPending(index) {
  const item = chatty.pendingResults[index]
  if (!item?.retry || item.busy) return
  const task = item.retry
  const controller = new AbortController(),
    generation = sttClient.generation
  item.busy = true
  sttClient.retries ||= new Set()
  sttClient.retries.add(controller)
  try {
    const result = await postJson(
      '/dsh-chatty/stt/transcribe',
      {
        sessionId: task.sessionId,
        providerId: task.cfg.stt.provider,
        language: task.cfg.stt.language,
        audioBase64: bytesToBase64(
          pcm16ToWavClient(concatPcm(task.chunks), 16000)
        )
      },
      { signal: controller.signal }
    )
    if (
      controller.signal.aborted ||
      generation !== sttClient.generation ||
      task.sessionId !== chatty.sessionId
    )
      return
    item.text = result.text
    item.unconfirmed = false
    delete item.retry
    chatty.notify()
  } catch (error) {
    if (!controller.signal.aborted) showNotice(String(error.message))
  } finally {
    item.busy = false
    sttClient.retries.delete(controller)
  }
}
async function runVoiceCommand(command) {
  if (command === 'send') sendComposer()
  else if (command === 'undo') undoLastInsert()
  else if (command === 'clear') clearVoiceInserts()
  else if (
    command === 'polish' &&
    chattySetting('draft.polish_on_command', true)
  )
    await polishComposer()
  else if (command === 'stop_listening') await stopListening()
  else if (command === 'read') await readLatestReply()
  else if (command === 'stop_reading') stopSpeaking()
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
  totalQueued: 0,
  doneCount: 0
}

function ensureSpeechAudio() {
  if (speech.audioCtx) {
    const volume = Number(chattySetting('tts.volume', 1))
    speech.gain.gain.value = Number.isFinite(volume)
      ? Math.max(0, Math.min(1, volume))
      : 1
    if (speech.audioCtx.state === 'suspended')
      speech.audioCtx.resume().catch(() => {})
    return speech.audioCtx
  }
  const Ctx =
    typeof AudioContext !== 'undefined'
      ? AudioContext
      : typeof webkitAudioContext !== 'undefined'
        ? webkitAudioContext
        : null
  if (!Ctx) return null
  speech.audioCtx = new Ctx()
  speech.gain = speech.audioCtx.createGain()
  const volume = Number(chattySetting('tts.volume', 1))
  speech.gain.gain.value = Number.isFinite(volume)
    ? Math.max(0, Math.min(1, volume))
    : 1
  speech.gain.connect(speech.audioCtx.destination)
  speech.nextTime = speech.audioCtx.currentTime
  return speech.audioCtx
}

function enqueueSpeechSegment(segment) {
  if (!segment || !String(segment.text || '').trim()) return
  const limit = Math.max(1, Math.floor(chattySetting('tts.max_chars', 4000))),
    pieces = []
  let piece = ''
  for (const char of String(segment.text)) {
    if (piece && piece.length + char.length > limit) {
      pieces.push(piece)
      piece = ''
    }
    piece += char
  }
  if (piece) pieces.push(piece)
  speech.queue.push(...pieces.map((text) => ({ ...segment, text })))
  // 进度：total = 本次 generation 累计入队段数。
  if (!speech.totalQueued) speech.totalQueued = 0
  speech.totalQueued += pieces.length
  chatty.ttsProgress = {
    index: speech.doneCount + 1,
    total: speech.totalQueued
  }
  pumpSpeechQueue()
}

async function pumpSpeechQueue() {
  if (speech.pumping) return
  speech.pumping = true
  try {
    let prefetch = null
    while (speech.queue.length) {
      const generation = speech.generation
      const segment = speech.queue.shift()
      // 播放当前段的同时预发起下一段的合成，段间停顿从「整段合成时间」缩到接近 0。
      const current = prefetch || startSynthesis(segment, generation)
      prefetch = speech.queue.length
        ? startSynthesis(speech.queue[0], generation)
        : null
      try {
        await playSpeechSegment(segment, generation, current)
        if (generation !== speech.generation) break
        speech.doneCount += 1
        if (chatty.ttsProgress)
          chatty.ttsProgress.index = Math.min(
            speech.doneCount + 1,
            speech.totalQueued
          )
      } catch (error) {
        if (generation === speech.generation && error.name !== 'AbortError') {
          setTtsPhase('ERROR', String((error && error.message) || error))
        }
      }
      if (generation !== speech.generation) break
    }
    prefetch = null
  } finally {
    speech.pumping = false
    if (speech.queue.length) void pumpSpeechQueue()
    if (
      speech.generation &&
      speech.queue.length === 0 &&
      chatty.ttsPhase !== 'ERROR'
    ) {
      if (chatty.ttsPhase === 'PLAYING' || chatty.ttsPhase === 'PREPARING')
        setTtsPhase('IDLE')
    }
  }
}

/** 发起一次合成请求（可被预取；controller 在 stopSpeaking 时统一 abort）。 */
function startSynthesis(segment, generation) {
  void generation
  const controller = new AbortController()
  speech.controllers.add(controller)
  const promise = fetch('/dsh-chatty/tts/synthesize', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal: controller.signal,
    body: JSON.stringify({
      text: segment.text,
      voice: chattySetting('tts.voice', ''),
      speed: chattySetting('tts.speed', 1)
    })
  }).then((res) => {
    if (!res.ok) {
      return res.json().then(
        (data) => {
          throw new Error(
            (data && data.error && data.error.message) ||
              `TTS HTTP ${res.status}`
          )
        },
        () => {
          throw new Error(`TTS HTTP ${res.status}`)
        }
      )
    }
    return res
  })
  promise.catch(() => {}) // 预取失败仍由消费段报告，避免提前的未处理拒绝。
  return { controller, promise }
}

async function playSpeechSegment(segment, generation, started) {
  const { controller, promise } = started || startSynthesis(segment, generation)
  setTtsPhase('PREPARING')
  chatty.ttsStage = 'synth'
  try {
    const res = await promise
    if (generation !== speech.generation || controller.signal.aborted) return
    const format = String(
      res.headers.get('X-Audio-Format') || 'pcm'
    ).toLowerCase()
    const sampleRate =
      Number(res.headers.get('X-Audio-Sample-Rate')) ||
      Number(chattySetting('tts.sample_rate', 24000)) ||
      24000
    if (format === 'pcm')
      await playPcmStream(res, sampleRate, generation, controller)
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
  const finishes = []
  speech.activeStreams += 1
  try {
    while (true) {
      if (generation !== speech.generation || controller.signal.aborted) return
      const part = await reader.read()
      if (part.done) break
      let bytes = part.value
      if (carry.length) {
        const joined = new Uint8Array(carry.length + bytes.length)
        joined.set(carry, 0)
        joined.set(bytes, carry.length)
        bytes = joined
        carry = new Uint8Array(0)
      }
      if (bytes.length % 2) {
        carry = bytes.slice(-1)
        bytes = bytes.slice(0, -1)
      }
      if (!bytes.length) continue
      const frames = bytes.length / 2
      const buffer = ctxAudio.createBuffer(1, frames, sampleRate)
      const channel = buffer.getChannelData(0)
      const view = new DataView(
        bytes.buffer,
        bytes.byteOffset,
        bytes.byteLength
      )
      for (let i = 0; i < frames; i += 1)
        channel[i] = view.getInt16(i * 2, true) / 32768
      const source = ctxAudio.createBufferSource()
      source.buffer = buffer
      source.connect(speech.gain)
      const startAt = Math.max(ctxAudio.currentTime + 0.04, speech.nextTime)
      source.start(startAt)
      speech.nextTime = startAt + buffer.duration
      speech.sources.add(source)
      finishes.push(
        new Promise((resolve) => {
          const abort = () => {
            try {
              source.stop()
            } catch {}
            done()
          }
          const done = () => {
            speech.sources.delete(source)
            controller.signal.removeEventListener('abort', abort)
            resolve()
          }
          source.onended = done
          controller.signal.addEventListener('abort', abort, { once: true })
        })
      )
      if (chatty.ttsPhase !== 'PLAYING') setTtsPhase('PLAYING')
    }
    await Promise.all(finishes)
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
  element.volume = Math.max(
    0,
    Math.min(1, Number(chattySetting('tts.volume', 1) ?? 1))
  )
  await new Promise((resolve, reject) => {
    const cleanup = () => {
      element.onended = null
      element.onerror = null
      try {
        URL.revokeObjectURL(url)
      } catch {
        /* 已释放 */
      }
      if (speech.element === element) {
        speech.element = null
        speech.elementUrl = ''
      }
    }
    element.onended = () => {
      cleanup()
      resolve()
    }
    element.onerror = () => {
      cleanup()
      reject(new Error('audio playback failed'))
    }
    controller.signal.addEventListener(
      'abort',
      () => {
        try {
          element.pause()
        } catch {
          /* 已暂停 */
        }
        cleanup()
        resolve()
      },
      { once: true }
    )
    element
      .play()
      .then(() => {
        if (generation === speech.generation && !controller.signal.aborted)
          setTtsPhase('PLAYING')
      })
      .catch((error) => {
        cleanup()
        reject(error)
      })
  })
}

function stopSpeaking(silent) {
  speech.generation += 1
  for (const controller of speech.controllers) {
    try {
      controller.abort()
    } catch {
      /* 已结束 */
    }
  }
  speech.controllers.clear()
  for (const source of speech.sources) {
    try {
      source.stop()
    } catch {
      /* 已结束 */
    }
  }
  speech.sources.clear()
  if (speech.element) {
    try {
      speech.element.pause()
    } catch {
      /* 已暂停 */
    }
  }
  if (speech.elementUrl) {
    try {
      URL.revokeObjectURL(speech.elementUrl)
    } catch {
      /* 已释放 */
    }
  }
  speech.element = null
  speech.elementUrl = ''
  speech.queue = []
  speech.activeStreams = 0
  speech.totalQueued = 0
  speech.doneCount = 0
  chatty.ttsProgress = null
  chatty.ttsStage = ''
  if (speech.audioCtx) {
    speech.audioCtx.resume().catch(() => {})
    speech.nextTime = speech.audioCtx.currentTime
  }
  if (!silent) {
    postJson('/dsh-chatty/speech/stop', {
      sessionId: chatty.sessionId || 'default'
    }).catch(() => {})
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
  if (reason === 'speech' && sttClient.active && chatty.sttPhase === 'PAUSED')
    resumeListening()
}

async function readLatestReply() {
  stopSpeaking(true)
  const generation = speech.generation,
    sessionId = chatty.sessionId
  const controller = new AbortController()
  speech.controllers.add(controller)
  // 立即反馈：render（含表格 LLM 摘要）可能需要数秒，不能无状态等待。
  setTtsPhase('PREPARING')
  chatty.ttsStage = 'render'
  chatty.ttsProgress = null
  try {
    const payload = await postJson(
      '/dsh-chatty/speech/render',
      { sessionId: sessionId || 'default' },
      { signal: controller.signal }
    )
    if (
      generation !== speech.generation ||
      sessionId !== chatty.sessionId ||
      controller.signal.aborted
    )
      return
    const segments = Array.isArray(payload.segments) ? payload.segments : []
    if (!segments.length) {
      setTtsPhase('IDLE')
      showNotice('没有可朗读的回复')
      return
    }
    chatty.ttsStage = 'synth'
    speech.totalQueued = 0
    speech.doneCount = 0
    for (const segment of segments) enqueueSpeechSegment(segment)
  } catch (error) {
    if (generation === speech.generation && !controller.signal.aborted)
      setTtsPhase('ERROR', String((error && error.message) || error))
  } finally {
    speech.controllers.delete(controller)
  }
}

function connectSpeechEvents(sessionId) {
  if (!sessionId || speech.connectedSessionId === sessionId) return
  disconnectSpeechEvents()
  speech.connectedSessionId = sessionId
  const controller = new AbortController()
  speech.eventSource = { close: () => controller.abort() }
  consumeSse(
    '/dsh-chatty/speech/events?sessionId=' + encodeURIComponent(sessionId),
    (kind, data) => {
      if (speech.connectedSessionId !== sessionId) return
      if (kind === 'speech.segment') enqueueSpeechSegment(data)
      if (kind === 'speech.cancel') stopSpeaking(true)
    },
    controller.signal
  ).catch((error) => {
    if (!controller.signal.aborted)
      setTtsPhase('ERROR', '自动朗读连接中断，请重新开启')
  })
}

function disconnectSpeechEvents() {
  if (speech.eventSource) {
    try {
      speech.eventSource.close()
    } catch {
      /* 已关闭 */
    }
  }
  speech.eventSource = null
  speech.connectedSessionId = ''
}

// ---- lib/client-src/60-ui.js ----
// ── 界面：Voice Bar + Voice Draft 面板（v0.2 重设计）────────────
//
// Voice Bar 只保留两个按键 + 一个状态文本（用户要求：含义要一眼清楚）：
//   🎙 主按钮  开始 / 停止语音输入（长语音的唯一开关）
//   状态文本  未开启 / 正在聆听（+音量柱+计时）/ 正在识别 / 已暂停 / 错误
//   🔊 按钮   朗读最新回复（播放中变为「停止朗读」）
// 发送 / 撤销 / 清空 / 润色 / 停止聆听 全部在 Draft 面板里，不再重复。
//
// Draft 面板结构（全宽对齐、无悬浮按钮）：
//   ● 状态  [音量柱]  计时                       [停止聆听]
//   ┌ 草稿输入框（全宽）┐
//   实时预览…
//                          [? 指令] [撤销] [清空] [润色] [发送]
//   （? 指令展开指令清单：动作 → 说法，来自宿主 /status 的 commands）

function fmtElapsed(ms) {
  const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000))
  return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0')
}

/** 音量柱：只在收音时渲染；柱体 3–16px、底部对齐（修复旧版"一串点"）。 */
function LevelBars(props) {
  const levels = props.levels || []
  const bars = props.bars || 9
  const slice = levels.slice(-bars)
  const padded = []
  for (let i = 0; i < bars - slice.length; i += 1) padded.push(0.06)
  const values = padded.concat(slice)
  return React.createElement(
    'span',
    {
      className: 'dch-levels' + (props.active ? ' dch-viz-active' : ''),
      'aria-hidden': 'true'
    },
    values.map((value, index) =>
      React.createElement('span', {
        key: index,
        style: { height: Math.max(3, Math.round(3 + value * 13)) + 'px' }
      })
    )
  )
}

function chattyMainStatusText() {
  // 朗读优先（听与读互斥的场景提示谁在占用通道）。
  if (chatty.ttsPhase === 'PLAYING') {
    const progress = chatty.ttsProgress
    const suffix =
      progress && progress.total > 1
        ? ` ${progress.index}/${progress.total}`
        : ''
    return t('reading') + suffix
  }
  if (chatty.ttsPhase === 'PREPARING') {
    // render 阶段（表格 LLM 摘要）可能需要数秒，与合成阶段分开提示。
    return chatty.ttsStage === 'render' ? '正在整理朗读内容…' : '正在合成语音…'
  }
  switch (chatty.sttPhase) {
    case 'LISTENING':
      return t('listening')
    case 'SPEECH_DETECTED':
      return t('speechDetected')
    case 'TRANSCRIBING':
      return t('transcribing')
    case 'PAUSED':
      return t('paused')
    case 'RECONNECTING':
      return t('reconnecting')
    case 'ERROR':
      return chatty.sttError || t('error')
    default:
      return t('off')
  }
}

function VoiceBar(props) {
  const state = useChatty()
  chatty.sessionId = String(props.sessionId || '')
  chatty.inputActions = props.inputActions || null
  chatty.input = props.input || null
  if (!chatty.ledger && chatty.inputActions && chatty.input)
    chatty.ledger = createDraftLedger({
      actions: () => chatty.inputActions,
      state: chatty.input,
      limit: chattySetting('draft.max_utterances', 200)
    })
  chatty.ledger?.receive(chatty.input)

  const sessionRef = React.useRef(chatty.sessionId)
  React.useEffect(() => {
    installChattyStyle()
    refreshChattySettings().then((settings) => {
      if (!settings) return
      if (chattySetting('stt.auto_start', false) && !sttClient.active)
        startListening()
      if (chattySetting('tts.auto_read', false))
        connectSpeechEvents(chatty.sessionId)
    })
  }, [])

  React.useEffect(() => {
    if (sessionRef.current === chatty.sessionId) return
    sessionRef.current = chatty.sessionId
    chatty.partial = ''
    chatty.lastRenderedDraft = null
    cancelListening()
    chatty.ledger = null
    chatty.pendingResults = []
    stopSpeaking(true)
    if (chattySetting('tts.auto_read', false))
      connectSpeechEvents(chatty.sessionId)
    else disconnectSpeechEvents()
    chatty.notify()
    const sessionId = chatty.sessionId,
      generation = sttClient.generation
    setTimeout(() => {
      if (
        sessionId === chatty.sessionId &&
        generation === sttClient.generation &&
        chatty.ledger &&
        chattySetting('stt.auto_start', false)
      )
        startListening()
    }, 0)
  }, [props.sessionId])

  React.useEffect(() => {
    const supported =
      typeof navigator !== 'undefined' &&
      !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
    if (chatty.supported !== supported) chatty.set({ supported })
  }, [])

  if (chattySetting('ui.show_voice_bar', true) === false) return null

  const listening = sttClient.active
  const busy =
    state.sttPhase === 'TRANSCRIBING' || state.sttPhase === 'SPEECH_DETECTED'
  const speaking =
    state.ttsPhase === 'PLAYING' || state.ttsPhase === 'PREPARING'
  const showViz =
    chattySetting('ui.visualizer', 'bars') !== 'off' && (listening || speaking)
  const status = state.notice || chattyMainStatusText()
  const errored = state.sttPhase === 'ERROR' || state.ttsPhase === 'ERROR'

  // 听写按钮：说 → 文字进输入框（手动发送）。
  const micButton = chattyButton({
    label: !chatty.supported
      ? t('unsupported')
      : listening
        ? t('stopListening')
        : t('startListening'),
    icon: listening ? iconStop() : iconMic(),
    active: listening,
    disabled:
      !!sttClient.starting ||
      !chatty.supported ||
      !chatty.settings?.compatibility?.matched,
    onClick: () => {
      toggleListening()
    }
  })
  // 朗读按钮：播放中变为「停止朗读」（单条手动朗读，独立于对话模式）。
  const speakButton = chattyButton({
    label: speaking ? t('stopSpeaking') : t('readReply'),
    icon: speaking ? iconStop() : iconSpeaker(),
    active: speaking,
    onClick: () => {
      if (speaking) stopSpeaking()
      else readLatestReply()
    }
  })

  return React.createElement(
    'div',
    { className: 'dch-bar', role: 'group', 'aria-label': t('title') },
    micButton,
    React.createElement(
      'span',
      {
        className: 'dch-bar-status',
        'data-error': errored ? '1' : '0',
        role: 'status',
        'aria-live': 'polite'
      },
      React.createElement('span', {
        className: 'dch-dot',
        'data-on': listening && state.sttPhase !== 'PAUSED' ? '1' : '0'
      }),
      React.createElement('span', { className: 'dch-status' }, status),
      showViz
        ? React.createElement(LevelBars, {
            levels: state.levels,
            active: listening
          })
        : null,
      listening && chatty.listenStartedAt
        ? React.createElement(
            'span',
            { className: 'dch-timer' },
            fmtElapsed(Date.now() - chatty.listenStartedAt)
          )
        : null
    ),
    speakButton
  )
}

/** 指令清单（动作中文名 + 说法），来自宿主 /status 的 commands 表。 */
const CHATTY_COMMAND_NAMES = {
  send: '发送草稿',
  undo: '撤销最后一段',
  clear: '清空语音内容',
  polish: '润色语音内容',
  stop_listening: '停止录音',
  read: '朗读回复',
  stop_reading: '停止朗读'
}
const CHATTY_COMMAND_ORDER = [
  'send',
  'undo',
  'clear',
  'polish',
  'stop_listening',
  'read',
  'stop_reading'
]

function CommandHelp() {
  const commands = chattySetting('voice_control.commands', null) || {}
  const rows = CHATTY_COMMAND_ORDER.filter(
    (action) => Array.isArray(commands[action]) && commands[action].length
  ).map((action) => ({
    action,
    name: CHATTY_COMMAND_NAMES[action] || action,
    say: commands[action].slice(0, 3).join(' / ')
  }))
  return React.createElement(
    'div',
    { className: 'dch-help', role: 'note' },
    React.createElement('strong', null, '语音指令（必须整句说成一句）'),
    rows.map((row) =>
      React.createElement(
        'div',
        { className: 'dch-help-row', key: row.action },
        React.createElement('b', null, row.name),
        React.createElement('code', null, row.say)
      )
    ),
    React.createElement(
      'span',
      { className: 'dch-muted' },
      '正文里出现指令词不会被误判；判定方式可在设置卡调整（整句匹配 / 唤醒前缀）。'
    )
  )
}

function DraftPanel(props) {
  const state = useChatty()
  chatty.inputActions = props.inputActions || chatty.inputActions
  chatty.input = props.input || chatty.input
  const [showHelp, setShowHelp] = React.useState(false)
  const [, forceTick] = React.useReducer((value) => value + 1, 0)

  // 监听中每秒刷新计时。
  React.useEffect(() => {
    if (state.sttPhase !== 'LISTENING' && state.sttPhase !== 'SPEECH_DETECTED')
      return undefined
    const timer = setInterval(forceTick, 1000)
    return () => clearInterval(timer)
  }, [state.sttPhase])

  if (chattySetting('ui.show_draft_panel', true) === false) return null

  const listening = sttClient.active
  const partial = state.partial || ''
  const hasVoiceContent = getVoiceBuffer().trim() !== ''
  const visible =
    listening ||
    hasVoiceContent ||
    partial ||
    state.notice ||
    state.pendingResults.length ||
    state.busy === 'polish'
  if (!visible) return null

  const status = state.notice || sttStatusText()
  const elapsed =
    listening && chatty.listenStartedAt
      ? fmtElapsed(Date.now() - chatty.listenStartedAt)
      : ''

  return React.createElement(
    'div',
    { className: 'dch-panel', style: { maxWidth: width() + 'px' } },
    React.createElement(
      'div',
      { className: 'dch-panel-head' },
      React.createElement('span', {
        className: 'dch-dot',
        'data-on': listening ? '1' : '0'
      }),
      React.createElement(
        'span',
        {
          className: 'dch-status',
          'data-error': state.sttPhase === 'ERROR' ? '1' : '0'
        },
        status + (elapsed ? ` · ${elapsed}` : '')
      ),
      listening
        ? React.createElement(LevelBars, { levels: state.levels, active: true })
        : null,
      React.createElement('span', { className: 'dch-spacer' }),
      listening
        ? React.createElement(
            'button',
            {
              type: 'button',
              className: 'dch-action',
              onClick: () => stopListening()
            },
            t('stopListening')
          )
        : null,
      listening
        ? React.createElement(
            'button',
            { className: 'dch-action', onClick: () => cancelListening() },
            '取消本句'
          )
        : null
    ),
    partial && chattySetting('stt.partial_preview', true)
      ? React.createElement(
          'div',
          { className: 'dch-partial' },
          t('partial') + '：' + partial
        )
      : null,
    hasVoiceContent && !listening
      ? React.createElement(
          'div',
          { className: 'dch-partial' },
          '语音内容在原生输入框中，明确发送后可继续听写。'
        )
      : null,
    state.pendingResults.map((item, index) =>
      React.createElement(
        'div',
        { key: item.id, className: 'dch-partial' },
        item.text,
        item.retry
          ? React.createElement(
              'button',
              { onClick: () => retryPending(index) },
              '重试本句'
            )
          : null,
        React.createElement(
          'button',
          { onClick: () => insertPending(index) },
          '插入'
        ),
        React.createElement(
          'button',
          {
            onClick: () => {
              state.pendingResults.splice(index, 1)
              state.notify()
            }
          },
          '丢弃'
        )
      )
    ),
    showHelp ? React.createElement(CommandHelp) : null,
    React.createElement(
      'div',
      { className: 'dch-panel-actions' },
      React.createElement(
        'button',
        {
          type: 'button',
          className: 'dch-action',
          'data-tip': '语音指令有哪些',
          'aria-expanded': showHelp ? 'true' : 'false',
          onClick: () => setShowHelp((current) => !current)
        },
        '? 指令'
      ),
      React.createElement(
        'button',
        {
          type: 'button',
          className: 'dch-action',
          'data-tip': '移除最后一段语音',
          onClick: () => undoLastInsert()
        },
        t('undo')
      ),
      React.createElement(
        'button',
        {
          type: 'button',
          className: 'dch-action',
          'data-tip': '清空全部语音内容',
          onClick: () => clearVoiceInserts()
        },
        t('clear')
      ),
      React.createElement(
        'button',
        {
          type: 'button',
          className: 'dch-action',
          disabled: state.busy === 'polish',
          'data-tip': '对语音全文润色',
          onClick: () => polishComposer()
        },
        state.busy === 'polish' ? t('polishing') : t('polish')
      )
    )
  )
}

function width() {
  return Number(chattySetting('ui.panel_width', 720)) || 720
}

// ---- lib/client-src/70-settings.js ----
function ChattyField(props) {
  const label=props.label,help=props.help||props.hint
  return React.createElement('div',{className:'dch-field','data-field':props.path},
    React.createElement('div',{className:'dch-field-label'},React.createElement('span',null,label),help?React.createElement(FieldHelp,{label,help}):null),
    React.createElement('div',{className:'dch-field-control'},props.children))
}
const CHATTY_TABS = ['语音输入', '语音输出', '指令与草稿', '界面', '高级']
function fieldTab(owner, p) {
  if (owner === 'speech') return '语音输入'
  if (owner !== 'chatty') return '高级'
  if (p.startsWith('ui.')) return '界面'
  if (
    p.startsWith('voice_control.') ||
    p.startsWith('draft.') ||
    p === 'polish.enabled'
  )
    return '指令与草稿'
  if (p.startsWith('stt.vad.')) return '语音输入'
  if (
    p.startsWith('polish.') ||
    /url|resource_id|timeout|max_|sample_rate/.test(p)
  )
    return '高级'
  return p.startsWith('tts.') ? '语音输出' : '语音输入'
}
function fieldLabel(f) {
  if(f.presentation) return f.presentation.label
  const names = {
    providerId: '本地服务 ID',
    defaultProvider: '识别服务',
    language: '语言',
    dataRoot: '本地缓存目录',
    modelDirectory: '外部识别模型目录',
    vadModelPath: '外部 VAD 模型',
    precision: '模型精度',
    modelOrigin: '固定模型来源',
    modelOrigins: '模型来源列表',
    modelProbeTimeoutMs: '来源探测超时（毫秒）',
    threads: 'CPU 线程',
    segmentSeconds: '本地推理分段（秒）',
    vadThreshold: '模型 VAD 阈值',
    minSpeechSeconds: '模型最短人声（秒）',
    minSilenceSeconds: '模型最短静音（秒）',
    maxAudioBytes: '音频字节上限',
    maxDurationSeconds: '录音时长上限（秒）',
    prepareTimeoutMs: '准备超时（毫秒）',
    inferenceTimeoutMs: '推理超时（毫秒）',
    idleTimeoutMs: '空闲释放（毫秒）',
    maxPending: '本地排队上限',
    graceMs: '退出宽限（毫秒）',
    maxLogBytes: '诊断日志字节上限',
    maxResponseBytes: '工作进程响应上限',
    progressIntervalMs: '准备进度间隔（毫秒）',
    model: '模型',
    credential: '凭据引用',
    voice: '音色',
    base_url: '端点',
    batch_url: '完整句端点',
    stream_url: '真实流式端点',
    resource_id: '资源 ID'
  }
  const labels = {
    'stt.streaming': '优先真实流式（火山）',
    'stt.auto_start': '进入会话后自动监听',
    'stt.partial_preview': '显示临时预览',
    'stt.vad.enabled': '启用浏览器分句',
    'stt.vad.sensitivity': '分句灵敏度',
    'stt.vad.silence_timeout_ms': '句尾静音（毫秒）',
    'stt.vad.min_speech_ms': '最短人声（毫秒）',
    'stt.vad.pre_roll_ms': '句首缓冲（毫秒）',
    mic_device_id: '麦克风',
    noise_suppression: '浏览器降噪',
    echo_cancellation: '浏览器回声消除',
    auto_gain_control: '自动增益',
    'voice_control.commands': '口令词表',
    'ui.show_draft_panel': '显示语音操作区'
  }
  if (labels[f.path]) return labels[f.path]
  const key = f.path.split('.').at(-1)
  const provider = f.path.includes('.volcano.')
    ? '火山 '
    : f.path.includes('.siliconflow.')
      ? '硅基流动 '
      : ''
  return provider + (names[key] || f.label || f.path)
}
function formValue(object, p) {
  return p.split('.').reduce((v, k) => v?.[k], object)
}
function formEdit(object, p, v) {
  const copy = JSON.parse(JSON.stringify(object))
  const keys = p.split('.')
  let node = copy
  for (const k of keys.slice(0, -1)) node = node[k] ||= {}
  node[keys.at(-1)] = v
  return copy
}
function CredentialEditor(props) {
  const [open, setOpen] = React.useState(false),
    [ref, setRef] = React.useState(''),
    [secret, setSecret] = React.useState(''),
    [notice, setNotice] = React.useState('')
  async function save(unset) {
    try {
      await postJson('/dsh-chatty/credentials', {
        ref: ref || props.credentials[0]?.ref,
        value: secret,
        unset
      })
      setSecret('')
      setNotice('DSH Credentials 已更新')
      await props.onSaved()
    } catch (e) {
      setNotice(e.message)
    }
  }
  return React.createElement(
    'div',
    null,
    React.createElement(
      ChattyButton,
      { onClick: () => setOpen(!open) },
      '管理 DSH 凭据'
    ),
    open
      ? React.createElement(
          'div',
          { className: 'dch-field' },
          React.createElement(
            'select',
            {
              value: ref || props.credentials[0]?.ref || '',
              onChange: (e) => setRef(e.target.value)
            },
            props.credentials.map((c) =>
              React.createElement('option', { key: c.ref, value: c.ref }, c.ref+' · '+(c.configured?'已配置':'未配置')+(c.writable===false?' · 只读':''))
            )
          ),
          React.createElement('input', {
            type: 'password',
            disabled: props.credentials.find(c=>c.ref===(ref||props.credentials[0]?.ref))?.writable===false,
            autoComplete: 'new-password',
            value: secret,
            placeholder: '新密钥（不会显示已有值）',
            onChange: (e) => setSecret(e.target.value)
          }),
          React.createElement(
            ChattyButton,
            { onClick: () => save(false), disabled: !secret || props.credentials.find(c=>c.ref===(ref||props.credentials[0]?.ref))?.writable===false },
            '保存到 Credentials'
          ),
          React.createElement(
            ChattyButton,
            {
              disabled: props.credentials.find(c=>c.ref===(ref||props.credentials[0]?.ref))?.writable===false,
              onClick: () => {
                if (window.confirm('删除该凭据引用？')) save(true)
              }
            },
            '移除引用'
          ),
          React.createElement('span', { role: 'status' }, notice)
        )
      : null
  )
}
function ChattySection(props) {
  const [owners, setOwners] = React.useState([]),
    [drafts, setDrafts] = React.useState({}),
    [changes, setChanges] = React.useState({}),
    [tab, setTab] = React.useState('语音输入'),
    [fileState,setFileState]=React.useState(null),
    [message, setMessage] = React.useState(''),
    [cred, setCred] = React.useState([]),
    [preview, setPreview] = React.useState(null),
    [backup, setBackup] = React.useState(''),
    [test, setTest] = React.useState(''),
    [devices, setDevices] = React.useState([]),
    [resolutions, setResolutions] = React.useState({}),
    [backups, setBackups] = React.useState([]),
    [saving, setSaving] = React.useState({}),
    [saveMessages,setSaveMessages]=React.useState({})
  const savingOwners=React.useRef(new Set())
  const refreshCredentials = async () => {
    const [c,f]=await Promise.all([getJson('/dsh-chatty/credentials/state'),getJson('/dsh-chatty/credentials/file')])
    setCred(c.credentials);setFileState(f.file)
  }
  const selectedOwners = owners.filter(o=>o.owner==='chatty')
  const dirtyCount=Object.keys(changes.chatty||{}).length
  const ownerLabel=owner=>({chatty:'Chatty 设置',api:'API 参数',sensevoice:'本地模型参数'}[owner]||'设置')
  async function discard(owner='chatty'){
    if(saving[owner])return
    if(Object.keys(changes[owner]||{}).length&&!window.confirm('放弃'+ownerLabel(owner)+'未保存的修改？其它配置将保留。'))return
    const r=await getJson('/dsh-chatty/settings');const ids=new Set([owner])
    setOwners(x=>x.map(o=>ids.has(o.owner)?r.owners.find(n=>n.owner===o.owner)||o:o))
    setDrafts(x=>({...x,...Object.fromEntries(r.owners.filter(o=>ids.has(o.owner)).map(o=>[o.owner,o.effective]))}))
    setChanges(x=>({...x,[owner]:{}}));setSaveMessages(x=>({...x,[owner]:'已重新加载'+ownerLabel(owner)}))
  }
  const reload = async () => {
    const result = await getJson('/dsh-chatty/settings')
    setOwners(result.owners)
    setDrafts(
      Object.fromEntries(result.owners.map((o) => [o.owner, o.effective]))
    )
    setChanges({})
    await refreshChattySettings()
    await refreshCredentials()
    const b = await postJson('/dsh-chatty/migration', { action: 'list' })
    setBackups(b.backups)
  }
  React.useEffect(() => {
    reload().catch((e) => setMessage(String(e.message)))
    return () => {
      if (audioEngine.testing) {
        audioEngine.stop()
        audioEngine.testing = false
      }
    }
  }, [])
  React.useEffect(()=>{
    const update=()=>setOwners(x=>[...x])
    window.addEventListener('dsh-chatty:speech-state',update)
    return()=>window.removeEventListener('dsh-chatty:speech-state',update)
  },[])
  React.useEffect(() => {
    if (
      !chatty.settings?.catalog?.providers.some((p) =>
        ['downloading', 'checking', 'loading', 'waking', 'cancelling'].includes(
          p.preparation.phase
        )
      )
    )
      return
    const timer = setInterval(
      () =>
        refreshChattySettings()
          .then(() => setOwners((x) => [...x]))
          .catch(() => {}),
      1000
    )
    return () => clearInterval(timer)
  }, [owners])
  function change(owner, f, value) {
    setDrafts((x) => ({ ...x, [owner]: formEdit(x[owner], f.path, value) }))
    setChanges((x) => ({
      ...x,
      [owner]: { ...x[owner], [f.path]: { op: 'set', path: f.path, value } }
    }))
  }
  function reset(owner, f) {
    setChanges((x) => ({
      ...x,
      [owner]: { ...x[owner], [f.path]: { op: 'unset', path: f.path } }
    }))
    setDrafts((x) => ({
      ...x,
      [owner]: formEdit(
        x[owner],
        f.path,
        owners.find((o) => o.owner === owner).base[f.path] ?? f.default ?? ''
      )
    }))
  }
  const save = async (ownerId='chatty') => {
    if (savingOwners.current.has(ownerId)) return
    savingOwners.current.add(ownerId)
    setSaving(x=>({...x,[ownerId]:true}))
    const results = []
    let succeeded=false
    for (const owner of owners.filter(o=>o.owner===ownerId&&['chatty','api','sensevoice'].includes(o.owner))) {
      const ops = Object.values(changes[owner.owner] || {})
      if (!ops.length) continue
      if (
        (sttClient.active ||
          ['PLAYING', 'PREPARING'].includes(chatty.ttsPhase)) &&
        !['chatty', 'speech'].includes(owner.owner)
      ) {
        results.push('请先停止听写与朗读后保存运行参数')
        continue
      }
      try {
        const result = await postJson('/dsh-chatty/settings', {
          owner: owner.owner,
          entryId: owner.entryId,
          expectedRevisionToken: owner.revisionToken,
          operations: ops
        })
        const fresh = result.owners.find((o) => o.owner === owner.owner)
        setOwners((x) =>
          x.map((o) => o.owner === owner.owner ? fresh : o)
        )
        setDrafts((x) => ({ ...x, [owner.owner]: fresh.effective }))
        results.push(({chatty:'Irving · 语音增强',speech:'识别偏好',api:'API 音频限制',sensevoice:'本地模型'}[owner.owner]||'设置') + ' 已保存（' + owner.applies + '）')
        setChanges((x) => ({ ...x, [owner.owner]: {} }))
        succeeded=true
      } catch (e) {
        results.push(({chatty:'Chatty 增强',speech:'识别偏好',api:'API 音频限制',sensevoice:'本地模型'}[owner.owner]||'设置') + ' 保存失败：' + e.message)
      }
    }
    setSaving(x=>({...x,[ownerId]:false}))
    savingOwners.current.delete(ownerId)
    setSaveMessages(x=>({...x,[ownerId]:results.join('；')}))
    if(succeeded)window.dispatchEvent(new Event('dsh-chatty:settings-saved'))
  }
  function control(o, f) {
    const value = formValue(drafts[o.owner], f.path)
    const key=f.path.split('.').at(-1),provider=f.presentation?.provider==='火山'?'volcano':f.presentation?.provider==='硅基流动'?'siliconflow':null
    const purpose=f.path.startsWith('stt.')?'stt':f.path.startsWith('tts.')?'tts':'llm'
    const params=purpose==='llm'?drafts.chatty?.polish:drafts.chatty?.[purpose]?.providers?.[provider]
    if(o.owner==='chatty'&&(key==='model'||key==='model_id'||key==='voice'))return React.createElement(ModelPicker,{
      value,onChange:v=>change(o.owner,f,v),purpose,provider:provider||drafts.chatty?.polish?.provider||'',label:fieldLabel(f),voice:key==='voice',model:params?.model,
      draft:purpose==='llm'?{base_url:params?.base_url||'',key_env:params?.key_env||''}:{base_url:params?.base_url||'',credential:params?.credential||''}
    })
    if(f.path==='polish.provider')return React.createElement(LlmProviderChoice,{value,onChange:v=>change(o.owner,f,v)})
    if(key==='credential'||key==='key_env')return React.createElement('div',null,
      React.createElement(SearchChoice,{value,options:cred.map(c=>({id:c.ref,label:c.ref+'（'+(c.configured?'已配置':'未配置')+'）'})),label:fieldLabel(f),onChange:v=>change(o.owner,f,v)}),
      React.createElement('details',{className:'dch-custom'},React.createElement('summary',null,'自定义凭据名称'),React.createElement('input',{'aria-label':fieldLabel(f),value:value||'',onChange:e=>change(o.owner,f,e.target.value)})))
    if (f.path === 'voice_control.commands')
      return React.createElement(
        'div',
        null,
        CHATTY_COMMAND_ORDER.map((action) =>
          React.createElement(
            ChattyField,
            { key: action, label: CHATTY_COMMAND_NAMES[action] },
            React.createElement('textarea', {
              value: (value?.[action] || []).join('\n'),
              onChange: (e) =>
                change(o.owner, f, {
                  ...value,
                  [action]: e.target.value.split('\n').filter(Boolean)
                })
            })
          )
        )
      )
    if (f.path === 'mic_device_id')
      return React.createElement(
        'div',
        null,
        React.createElement(
          'select',
          {
            value: value || '',
            onChange: (e) => change(o.owner, f, e.target.value)
          },
          React.createElement('option', { value: '' }, '系统默认麦克风'),
          devices.map((d) =>
            React.createElement(
              'option',
              { key: d.deviceId, value: d.deviceId },
              d.label || '麦克风'
            )
          ),
          value && !devices.some((d) => d.deviceId === value)
            ? React.createElement(
                'option',
                { value },
                '已保存的设备（尚未检测）'
              )
            : null
        ),
        React.createElement(
          ChattyButton,
          {
            onClick: async () =>
              setDevices(
                (await navigator.mediaDevices.enumerateDevices()).filter(
                  (d) => d.kind === 'audioinput'
                )
              )
          },
          '刷新设备'
        )
      )
    let options = f.schema?.list
      ?.filter((n) => n.type === 'const' && n.value !== undefined)
      .map((n) => n.value)
    if (f.path === 'defaultProvider')
      options = chatty.settings?.catalog?.providers.map((p) => p.id)
    if (f.path === 'language')
      options = chatty.settings?.catalog?.providers.find(
        (p) => p.id === formValue(drafts.speech, 'defaultProvider')
      )?.languages
    if (f.path === 'tts.provider') options = ['volcano', 'siliconflow']
    if (f.path === 'voice_control.command_mode')
      options = ['exact', 'wake', 'off']
    if (f.path === 'tts.format') options = ['pcm', 'mp3', 'wav']
    if (f.path.startsWith('tts.renderer.'))
      options = ['read', 'skip', 'summarize', 'smart', 'label_only']
    if (options?.length)
      return React.createElement(
        'select',
        {
          value: value ?? '',
          onChange: (e) => {
            change(
              o.owner,
              f,
              typeof value === 'number'
                ? Number(e.target.value)
                : e.target.value
            )
            if (f.path === 'defaultProvider') {
              const languages =
                chatty.settings.catalog.providers.find(
                  (p) => p.id === e.target.value
                )?.languages || []
              if (!languages.includes(formValue(drafts.speech, 'language')))
                change(
                  o.owner,
                  { path: 'language' },
                  languages.includes('auto') ? 'auto' : languages[0]
                )
            }
          }
        },
        options.map((v) =>
          React.createElement(
            'option',
            { key: String(v), value: v },
            f.path === 'defaultProvider'
              ? chatty.settings.catalog.providers.find((p) => p.id === v)
                  ?.name || v
              : f.path === 'language'
                ? {
                    auto: '自动',
                    zh: '中文',
                    en: '英语',
                    ja: '日语',
                    ko: '韩语',
                    yue: '粤语'
                  }[v] || v
                : ({exact:'整句匹配',wake:'先说文字前缀',off:'关闭',read:'直接朗读',skip:'跳过',summarize:'摘要朗读',smart:'按内容判断',label_only:'简短标签',bars:'音量柱',volcano:'火山 Agent Plan',siliconflow:'硅基流动',int8:'INT8（较省内存）',fp32:'FP32（较高精度）'}[v] || String(v))
          )
        )
      )
    if (typeof value === 'boolean' && PRIM?.Switch) return React.createElement(PRIM.Switch,{checked:value,onChange:v=>change(o.owner,f,v),label:fieldLabel(f)})
    if (typeof value === 'boolean')
      return React.createElement('input', {
        type: 'checkbox',
        checked: value,
        onChange: (e) => change(o.owner, f, e.target.checked)
      })
    if (Array.isArray(value))
      return React.createElement('textarea', {
        value: value.join('\n'),
        onChange: (e) =>
          change(o.owner, f, e.target.value.split('\n').filter(Boolean))
      })
    const multiline = /prompt|separator/.test(f.path)
    return React.createElement(multiline ? 'textarea' : 'input', {
      type: typeof value === 'number' ? 'number' : 'text',
      value: value ?? '',
      step: typeof value === 'number' ? 'any' : undefined,
      onChange: (e) => {
        if (
          !e.target.value &&
          f.schema?.list?.some(
            (n) => n.type === 'const' && n.value === undefined
          )
        )
          reset(o.owner, f)
        else
          change(
            o.owner,
            f,
            typeof value === 'number' ? Number(e.target.value) : e.target.value
          )
      }
    })
  }
  const micTest = async () => {
    if (sttClient.active) {
      setMessage('请先停止持续听写')
      return
    }
    const chunks = []
    audioEngine.testing = true
    try {
      await audioEngine.start(
        {
          onSpeechStart: (p) => chunks.push(p),
          onFrame: (p) => chunks.push(p)
        },
        {
          vad: chatty.settings.stt.vad,
          deviceId: chatty.settings.mic_device_id,
          noiseSuppression: chatty.settings.noise_suppression,
          echoCancellation: chatty.settings.echo_cancellation,
          autoGainControl: chatty.settings.auto_gain_control
        }
      )
      setTest('请说话，3.5 秒后识别')
      await new Promise((resolve) => setTimeout(resolve, 3500))
      if (!audioEngine.testing) return
      audioEngine.stop()
      audioEngine.testing = false
      const cfg = chatty.settings
      const result = await postJson('/dsh-chatty/stt/transcribe', {
        sessionId: chatty.sessionId,
        providerId: cfg.stt.provider,
        language: cfg.stt.language,
        audioBase64: bytesToBase64(pcm16ToWavClient(concatPcm(chunks), 16000))
      })
      setTest(result.text || '没有识别到语音')
    } catch (e) {
      audioEngine.stop()
      setTest(String(e.message))
    } finally {
      audioEngine.testing = false
    }
  }
  function renderOwnerFields(o) {
      const fields=o.fields.filter(f=>o.owner!=='chatty'||f.presentation?.tab===tab)
      const groups={}
      for(const f of fields){const p=f.path;const name=o.owner!=='chatty'?f.presentation.section:f.presentation.provider?f.presentation.provider+(p.startsWith('stt.')?'识别':'朗读'):p.startsWith('tts.renderer.')?'朗读内容':p.startsWith('polish.')?'润色与摘要模型':p.startsWith('voice_control.')?'语音口令':p.startsWith('draft.')?'语音草稿':p.startsWith('stt.vad.')?'分句参数':p.startsWith('stt.')?'持续听写':p.startsWith('tts.')?'朗读偏好':p.startsWith('ui.')?'界面显示':'采集与运行';(groups[name]||=[]).push(f)}
      function row(f){return React.createElement(ChattyField,{key:o.owner+'/'+f.path,path:f.path,label:fieldLabel(f),help:f.presentation.help},control(o,f),f.presentation.unit?React.createElement('span',{className:'dch-unit'},f.presentation.unit):null,React.createElement(ChattyButton,{className:'dch-reset',size:'sm','aria-label':'重置'+fieldLabel(f),title:'恢复组装默认（保存后生效）',onClick:()=>reset(o.owner,f)},'↺'))}
      return React.createElement('fieldset',{key:o.owner,disabled:!!saving[o.owner]||o.writable===false,className:'dch-owner-fields','data-owner':o.owner},o.unavailableReason?React.createElement('p',{role:'alert'},o.unavailableReason):null,
        Object.entries(groups).map(([name,items])=>{
          const active=name.startsWith('火山')?(tab==='语音输出'?drafts.chatty?.tts.provider==='volcano':chatty.settings?.stt.provider==='chatty-volcano'):name.startsWith('硅基')?(tab==='语音输出'?drafts.chatty?.tts.provider==='siliconflow':chatty.settings?.stt.provider==='chatty-siliconflow'):true
          const regular=items.filter(f=>!f.presentation.advanced),advanced=items.filter(f=>f.presentation.advanced)
          const body=React.createElement('div',null,
            name==='火山朗读'?React.createElement(ChattyField,{label:'火山合成模型',help:'由服务资源标识决定。默认资源 seed-tts-2.0 对应豆包语音合成 2.0；刷新可查看官方型号，新协议不自动适配。'},React.createElement(ModelPicker,{purpose:'tts',provider:'volcano',label:'火山合成模型',value:'doubao-'+(drafts.chatty.tts.providers.volcano.resource_id||'seed-tts-2.0'),onChange:id=>id==='doubao-seed-tts-2.0'?change('chatty',{path:'tts.providers.volcano.resource_id'},'seed-tts-2.0'):setMessage('该型号未适配；请检查高级资源标识，不会自动替换')})):null,
            regular.map(row),advanced.length?React.createElement('details',{className:'dch-advanced'},React.createElement('summary',null,'高级参数 · '+advanced.length),advanced.map(row)):null)
          return active?React.createElement('section',{className:'dch-setting-section',key:name},React.createElement('h3',null,name),body):React.createElement('details',{className:'dch-setting-section',key:name},React.createElement('summary',null,name+'（未使用）'),body)
        }))
  }

  function ownerActions(owner,sticky=false) {
    const count=Object.keys(changes[owner]||{}).length
    return React.createElement('div',{className:'dch-owner-actions','data-owner-actions':owner},
      React.createElement('div',{className:'dch-actions'+(sticky?' dch-settings-footer':'')},
        React.createElement('span',null,count?'有 '+count+' 项未保存':ownerLabel(owner)+'无待保存修改'),
        React.createElement(ChattyButton,{onClick:()=>save(owner),disabled:!!saving[owner]||!count||owners.find(o=>o.owner===owner)?.writable===false,variant:'primary'},saving[owner]?'保存中…':'保存'+ownerLabel(owner)),
        React.createElement(ChattyButton,{disabled:!!saving[owner],onClick:()=>discard(owner).catch(e=>setSaveMessages(x=>({...x,[owner]:e.message})))},count?'放弃修改':'重新加载'+ownerLabel(owner))),
      React.createElement('p',{role:'status','data-owner-message':owner,className:'dch-muted'},saveMessages[owner]||''))
  }
  const local = chatty.settings?.catalog?.providers.find(
    (p) => p.location === 'host-local'
  )
  return React.createElement(
    'div',
    { className: 'dch-card-body dch-settings' },
    React.createElement('div',{className:'dch-settings-top'},
      React.createElement('span',{className:chatty.settings?.compatibility?.matched?'dch-ready':'dch-error'},chatty.settings?.compatibility?.matched?'● 版本匹配':'版本不匹配'),
      React.createElement('div',{className:'dch-row'},React.createElement(ChattyButton,{disabled:!fileState?.available,title:fileState?.reason||'',onClick:()=>postJson('/dsh-chatty/credentials/file',{}).then(()=>setMessage('已请求系统编辑器打开凭据文件')).catch(e=>setMessage(e.message))},'打开凭据文件'),
      React.createElement(CredentialEditor,{credentials:cred,onSaved:refreshCredentials}))),
    fileState?.reason?React.createElement('span',{className:'dch-muted'},fileState.reason):null,
    React.createElement('div',{className:'dch-selection-summary'},
      React.createElement('span',null,'当前识别：'+(chatty.settings?.catalog?.providers.find(p=>p.id===chatty.settings.stt.provider)?.name||'不可用')),
      React.createElement(FieldHelp,{label:'识别服务',help:owners.find(o=>o.owner==='speech')?.fields.find(f=>f.path==='defaultProvider')?.presentation.help||'在上方官方原控件选择识别服务；原方式即时保存，下一句采用新选择。'}),
      React.createElement('span',null,'语言：'+({auto:'自动',zh:'中文',en:'英语',ja:'日语',ko:'韩语',yue:'粤语'}[chatty.settings?.stt.language]||chatty.settings?.stt.language||'自动')),
      React.createElement(FieldHelp,{label:'识别语言',help:owners.find(o=>o.owner==='speech')?.fields.find(f=>f.path==='language')?.presentation.help||'在上方官方控件选择语言，即时保存。'})),
    React.createElement('p',{className:'dch-muted'},'上方为官方语音设置；以下增强设置点击保存后生效。'),
    chatty.integrationError||chatty.speechStateError?React.createElement('p',{role:'status'},chatty.integrationError||chatty.speechStateError):null,
    React.createElement(ChattyTabs,{label:'Chatty 设置类别',value:tab,onChange:setTab,items:CHATTY_TABS.map(name=>({value:name,label:name}))}),
    tab === '语音输入'
      ? React.createElement(
          'div',
          null,
          React.createElement(ChattyButton, { onClick: micTest }, '麦克风测试'),
          local
            ? React.createElement(
                'div',
                null,
                React.createElement(ChattyField,{label:'本地识别模型',help:'使用官方 SenseVoiceSmall，本地精度与目录在官方底座中配置。刷新仅读取注册与准备状态，不下载新型号。'},React.createElement(ModelPicker,{purpose:'stt',provider:'sensevoice-local',label:'本地识别模型',value:'SenseVoiceSmall',readOnly:true})),
                '本地状态：' + ({ready:'已就绪',standby:'待加载',unprepared:'待准备',checking:'检查中',downloading:'下载中',loading:'加载中',waking:'唤醒中',cancelling:'取消中',failed:'准备失败',error:'准备失败'}[local.preparation.phase]||'状态待更新')
              )
            : null
        )
      : null,
    tab === '语音输出'
      ? React.createElement(
          ChattyButton,
          {
            onClick: () => {
              stopSpeaking(true)
              enqueueSpeechSegment({ text: '这是语音朗读测试。' })
            }
          },
          '试听'
        )
      : null,
    selectedOwners.map(renderOwnerFields),
    React.createElement('details',{className:'dch-diagnostics'},React.createElement('summary',null,'版本与加载诊断'),React.createElement('pre',null,JSON.stringify(chatty.settings?.compatibility,null,2))),
    tab === '高级'
      ? React.createElement(
          'div',
          null,
          React.createElement(
            ChattyButton,
            {
              onClick: () =>
                postJson('/dsh-chatty/migration', { action: 'preview' })
                  .then(setPreview)
                  .catch((e) => setMessage(e.message))
            },
            '预览旧配置迁移'
          ),
          preview
            ? React.createElement(
                'div',
                null,
                preview.changes.map((c) => c.old + ' → ' + c.target).join('；'),
                preview.conflicts.map((c) =>
                  React.createElement(
                    ChattyField,
                    {
                      key: c.id,
                      label: c.old + ' → ' + c.target,
                      hint:
                        '旧值：' +
                        JSON.stringify(c.oldValue ?? '未设置') +
                        '；当前：' +
                        JSON.stringify(c.newValue ?? '未设置')
                    },
                    React.createElement(
                      'select',
                      {
                        value: resolutions[c.id] || '',
                        onChange: (e) =>
                          setResolutions((x) => ({
                            ...x,
                            [c.id]: e.target.value
                          }))
                      },
                      React.createElement('option', { value: '' }, '请选择'),
                      c.choices.map((v) =>
                        React.createElement('option', { key: v, value: v }, v)
                      )
                    )
                  )
                ),
                React.createElement(
                  ChattyButton,
                  {
                    onClick: async () => {
                      if (preview.conflicts.some((c) => !resolutions[c.id])) {
                        setMessage('请逐项选择冲突处理方式')
                        return
                      }
                      if(Object.values(changes).some(x=>Object.keys(x).length)){setMessage('请先保存或放弃各分区的配置修改再迁移');return}
                      try {
                        const r = await postJson('/dsh-chatty/migration', {
                          action: 'apply',
                          revisionToken: preview.revisionToken,
                          resolutions
                        })
                        setBackup(r.backupId)
                        await reload()
                        setMessage('迁移已完成，备份 ' + r.backupId)
                      } catch (e) {
                        setMessage(e.message)
                      }
                    }
                  },
                  '备份并应用'
                )
              )
            : null,
          React.createElement(
            'select',
            { value: backup, onChange: (e) => setBackup(e.target.value) },
            React.createElement('option', { value: '' }, '选择迁移或更名备份'),
            backups.map((b) =>
              React.createElement(
                'option',
                { key: b.id, value: b.id },
                (b.createdAt || b.id) +
                  ' · ' +
                  b.state +
                  ' · ' +
                  b.owners.join('/')
              )
            )
          ),
          React.createElement(
            ChattyButton,
            {
              onClick: () => {
                if(Object.values(changes).some(x=>Object.keys(x).length)){setMessage('请先保存或放弃各分区的配置修改再恢复');return}
                return postJson('/dsh-chatty/migration', {
                  action: 'restore',
                  backupId: backup
                })
                  .then(reload)
                  .catch((e) => setMessage(e.message))
              }
            },
            '恢复备份'
          )
        )
      : null,
    ownerActions('chatty',true),
    React.createElement('details',{className:'dch-official-advanced'},React.createElement('summary',null,'官方高级参数（补充） · 24'),
      React.createElement('p',{className:'dch-muted'},'官方原页面未展示的参数，保存仍写回官方所有者。请先停止听写与朗读再保存运行参数。'),
      owners.filter(o=>['api','sensevoice'].includes(o.owner)).map(o=>React.createElement('section',{key:o.owner,className:'dch-advanced-owner','data-advanced-owner':o.owner},React.createElement('h3',null,ownerLabel(o.owner)),renderOwnerFields(o),ownerActions(o.owner)))),
    React.createElement(
      'div',
      { role: 'status', className: 'dch-muted' },
      message
    ),
    test ? React.createElement('div', { className: 'dch-partial' }, test) : null
  )
}
function ChattyPluginCard(props) {
  const navigation=props.ctx?.get?.('pluginNavigation')
  if(props?.view==='summary')return React.createElement('span',{className:'dch-card-desc'},'配置位于官方语音输入详情下方')
  return React.createElement('div',{className:'dch-shortcut'},React.createElement('p',null,'持续听写、语音口令与朗读配置已统一放在官方语音输入详情。'),
    React.createElement(ChattyButton,{disabled:!navigation,onClick:()=>navigation.openBundle(OFFICIAL_VOICE_BUNDLE)},'前往语音增强设置'),
    !navigation?React.createElement('span',{role:'status'},'插件导航暂不可用，请从插件列表打开官方语音输入'):null)
}
function registerSettings(ctx) {
  ctx.slots.inject('plugins.bundle.config',()=>ctx.slots.register({name:'plugins.bundle.config',key:PKG,locale:NS,label:'Irving · 语音增强',inject:()=>({ctx})},ChattyPluginCard))
  ctx.slots.inject('plugins.detail.section',()=>ctx.slots.register({name:'plugins.detail.section',id:'dsh-chatty-settings',order:50,locale:NS},props=>
    props.subject?.kind==='bundle'&&props.subject.pkg.name===OFFICIAL_VOICE_BUNDLE?
      React.createElement('section',{className:'dch-card','data-chatty-enhancement':true},React.createElement('h2',{className:'dch-enhancement-title'},'Chatty 增强'),React.createElement(ChattySection,props)):null))
}

// ---- lib/client-src/71-settings-controls.js ----
function ChattyButton(props) {
  return React.createElement(PRIM?.Button || 'button', {type:'button',variant:'ghost',size:'md',...props,className:(props.className||'')+(props.variant==='primary'?' dch-primary':'')},props.children)
}
function ChattyTabs({items,value,onChange,label}) {
  const id=React.useId()
  if(PRIM?.SegmentedTabs)return React.createElement(PRIM.SegmentedTabs,{className:'dch-segmented',label,value,onChange,items:items.map((item,i)=>({...item,id:id+'-'+i}))})
  return React.createElement('div',{className:'dch-tabs',role:'tablist','aria-label':label},items.map(item=>React.createElement(ChattyButton,{key:item.value,role:'tab','aria-selected':item.value===value,'data-active':item.value===value?'1':'0',className:'dch-tab',onClick:()=>onChange(item.value)},item.label)))
}
function FieldHelp(props) {
  const button=React.createElement(PRIM?.Button || 'button',{type:'button',variant:'ghost',className:'dch-help',size:'sm','aria-label':props.label+'说明'},'ⓘ')
  if(PRIM?.Tooltip) return React.createElement(PRIM.Tooltip,{label:props.help,openOnClick:true,portal:true,side:'top',maxWidth:360},button)
  return React.createElement('details',{className:'dch-help-fallback'},React.createElement('summary',{'aria-label':props.label+'说明'},'ⓘ'),React.createElement('span',{role:'tooltip'},props.help))
}
function SearchChoice({value,options,onChange,placeholder='请选择',label}) {
  const [search,setSearch]=React.useState('')
  const root=React.useRef(null)
  const chosen=options.find(o=>o.id===value)
  const list=options.some(o=>o.id===value)||!value?options:[{id:value,label:value+'（已保存／自定义）'},...options]
  return React.createElement('details',{className:'dch-picker',ref:root},
    React.createElement('summary',{'aria-label':label||placeholder},chosen?.label||value||placeholder,React.createElement('span',null,'⌄')),
    React.createElement('div',{className:'dch-picker-menu'},
      React.createElement('input',{type:'search',placeholder:'搜索名称或型号','aria-label':'搜索'+(label||''),value:search,onChange:e=>setSearch(e.target.value)}),
      React.createElement('div',{className:'dch-picker-options',role:'listbox','aria-label':label},list.filter(o=>(o.label+' '+o.id).toLowerCase().includes(search.toLowerCase())).map(o=>React.createElement(ChattyButton,{
        key:o.id,role:'option','aria-selected':o.id===value,disabled:o.status==='incompatible',title:o.reason||'',onClick:()=>{onChange(o.id);root.current.open=false;setSearch('')}
      },o.label||o.id,o.status==='unverified'?React.createElement('small',null,' · 未实测'):null)),!list.length?React.createElement('span',{className:'dch-muted'},'暂无目录，请刷新或使用高级输入'):null)))
}
function ModelPicker(props) {
  const [catalog,setCatalog]=React.useState(null),[loading,setLoading]=React.useState(false),[notice,setNotice]=React.useState('')
  const current=React.useRef(null),generation=React.useRef(0)
  const identity=JSON.stringify([props.purpose,props.provider,props.draft?.base_url,props.draft?.credential,props.draft?.key_env,chatty.sessionId])
  async function load(refresh) {
    current.current?.abort();const controller=new AbortController();current.current=controller;const n=++generation.current
    setLoading(true);setNotice('')
    try{const r=await postJson('/dsh-chatty/models/catalog',{purpose:props.purpose,provider:props.provider,sessionId:chatty.sessionId,refresh,draft:props.draft},{signal:controller.signal});if(n!==generation.current)return;setCatalog(r.catalog);setNotice(r.catalog.warning||'')}
    catch(e){if(n===generation.current&&!controller.signal.aborted)setNotice(e.message)}
    finally{if(n===generation.current)setLoading(false)}
  }
  React.useEffect(()=>{setCatalog(null);load(false);return()=>{generation.current++;current.current?.abort()}},[identity])
  let options=props.voice?(catalog?.voices||[]).map(v=>({id:v.id,label:v.label||v.name||v.id})):catalog?.models||[]
  if(props.readOnly) options=options.map(o=>({...o,status:'incompatible',reason:'本地模型由官方插件管理，精度在官方底座中选择'}))
  const incompatible=props.voice&&props.model&&props.value&&!props.value.startsWith('speech:')&&props.value.includes(':')&&!props.value.startsWith(props.model+':')
  if(props.voice&&props.model)options=options.filter(v=>v.id.startsWith('speech:')||v.id.startsWith(props.model+':')||!v.id.includes(':'))
  if(props.purpose==='llm'&&!props.voice)options=[{id:'',label:'跟随当前会话模型'},...options]
  return React.createElement('div',{className:'dch-model-control'},
    React.createElement('div',{className:'dch-control-line'},React.createElement(SearchChoice,{label:props.label,value:props.value,options,onChange:props.onChange}),React.createElement(ChattyButton,{onClick:()=>load(true),disabled:loading,'aria-label':'刷新'+props.label},loading?'刷新中…':'刷新')),
    React.createElement('div',{className:'dch-muted',role:'status'},notice||(props.readOnly?'官方固定模型；刷新更新注册与准备状态':catalog?.updatedAt?'更新于 '+new Date(catalog.updatedAt).toLocaleString():props.purpose==='llm'?'缓存目录；点击刷新读取 DSH 模型':'内置目录；点击刷新读取官方来源')),
    catalog?.sources?.length?React.createElement('details',{className:'dch-source'},React.createElement('summary',null,'目录来源'),catalog.sources.map(s=>React.createElement('div',{key:s},s.startsWith('https:')?React.createElement('a',{href:s,target:'_blank',rel:'noreferrer'},s):s))):null,
    incompatible?React.createElement('div',{className:'dch-error',role:'alert'},'已保存音色与当前型号不匹配，请选择对应音色；不会自动修改'):null,
    props.onChange&&!props.readOnly?React.createElement('details',{className:'dch-custom'},React.createElement('summary',null,'高级：自定义'+(props.voice?'音色':'型号')),React.createElement('input',{'aria-label':'自定义'+props.label,value:props.value||'',onChange:e=>props.onChange(e.target.value)}),React.createElement('small',null,'自定义值保留，兼容性需自行确认；不会自动试调。')):null)
}
function LlmProviderChoice(props) {
  const [providers,setProviders]=React.useState([]),[error,setError]=React.useState('')
  React.useEffect(()=>{let alive=true;postJson('/dsh-chatty/models/catalog',{purpose:'llm',provider:'',refresh:false}).then(r=>{if(alive)setProviders(r.catalog.llmProviders)}).catch(e=>{if(alive)setError(e.message)});return()=>{alive=false}},[])
  return React.createElement('div',null,React.createElement(SearchChoice,{label:'文本模型供应商',value:props.value,options:[{id:'',label:'跟随当前会话供应商'},...providers],onChange:props.onChange}),error?React.createElement('span',{role:'status'},error):null)
}

// ---- lib/client-src/72-official-integration.js ----
// 官方配置保持原注册；只在公开 activity 单槽遮蔽重复麦克风。
const OFFICIAL_VOICE_BUNDLE='@deepseek-ai/dsh-experimental-voice-input-bundle'
function signalChattyStatus() {
  window.dispatchEvent(new Event('dsh-chatty:speech-state'))
}
function registerOfficialVoiceIntegration(ctx) {
  ctx.slots.inject('conversation.input.activity',()=>ctx.effect(()=>{
    let shadow=null,updating=false,disposed=false
    const update=()=>{
      if(updating||disposed)return
      updating=true
      try{
        const entries=ctx.slots.entries('conversation.input.activity').filter(e=>e.registrant!=='dsh-chatty:microphone')
        const official=entries[0]?.locale==='voice-input'
        const hide=official&&chatty.settings?.compatibility?.matched===true
        if(!hide&&shadow){const off=shadow;shadow=null;off()}
        if(hide&&!shadow){
          shadow=ctx.slots.register({name:'conversation.input.activity',priority:-100,registrant:'dsh-chatty:microphone'},()=>null)
          chatty.integrationError=''
        }
      }catch(e){chatty.integrationError='官方录音入口协调失败：'+e.message}
      finally{updating=false}
    }
    const off=ctx.slots.subscribe('conversation.input.activity',update)
    window.addEventListener('dsh-chatty:speech-state',update)
    update()
    return()=>{disposed=true;off();window.removeEventListener('dsh-chatty:speech-state',update);shadow?.();shadow=null}
  },'dsh-chatty: official microphone'))
  // 实验 Remote 由官方客户端挂载。服务迟到／重挂载都由可选注入处理。
  if(typeof ctx.inject!=='function')return
  ctx.effect(()=>{
    const injection=ctx.inject(['remote.speech'],sub=>sub.effect(()=>{
      let disposed=false
      const stream=sub.remote.$stream({name:'Chatty speech state',open:signal=>sub.remote.speech.follow(signal),ended:()=>new Error('官方语音状态流已结束'),carrierFailed:error=>{
        if(disposed)return
        chatty.speechStateError='官方语音状态连接中断：'+error.message
        signalChattyStatus()
      }})
      const work=(async()=>{
        try{
          for await(const item of stream){
            if(disposed)break
            if(chatty.settings){
              chatty.settings={...chatty.settings,catalog:item.value,stt:{...chatty.settings.stt,provider:item.value.selection.providerId,language:item.value.selection.language}}
              chatty.speechStateError=''
              chatty.notify()
              signalChattyStatus()
            }
            item.accept()
          }
        }catch(error){if(!disposed){chatty.speechStateError='官方语音状态连接中断：'+error.message;signalChattyStatus()}}
      })()
      return async()=>{disposed=true;await stream.dispose();await work}
    },'dsh-chatty: speech readiness stream'))
    return()=>injection.dispose()
  },'dsh-chatty: optional speech Remote')
}

// ---- lib/client-src/90-close.js ----
    // ── 注册 ──────────────────────────────────────────────────────────
    function registerChattySlots(ctx) {
      ctx.slots.inject('conversation.input.right', () => ctx.slots.register(
        { name: 'conversation.input.right', id: PKG, order: 7, locale: NS, label: () => t('barSlot') },
        (props) => React.createElement(VoiceBar, {
          sessionId: props.sessionId || (props.useSession && props.useSession(x=>x?.sessionId)),
          input: props.useInput ? props.useInput(x=>x) : props.input,
          inputActions: props.inputActions,
        }),
      ))
      ctx.slots.inject('conversation.input.dock', () => ctx.slots.register(
        { name: 'conversation.input.dock', id: 'dsh-chatty-draft', order: 1, locale: NS, label: () => t('draftSlot') },
        (props) => React.createElement(DraftPanel, {
          input: props.useInput ? props.useInput(x=>x) : props.input,
          inputActions: props.inputActions,
        }),
      ))
    }

    exports.inject = ['timer', 'slots', 'configForms', 'locale', 'remote']
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
      chatty.ctx=ctx

      // 设置保存后立刻按新配置生效：自动朗读连接、VAD 参数、可视化。
      ctx.effect(() => {
        const reload = () => {
          refreshChattySettings().then((settings) => {
            if (!settings) return
            if(audioEngine.speaking)audioEngine.pendingVad=chattySetting('stt.vad',null)
            else audioEngine.configure(chattySetting('stt.vad',null))
            if (chattySetting('tts.auto_read', false)) connectSpeechEvents(chatty.sessionId)
            else disconnectSpeechEvents()
          })
        }
        window.addEventListener('dsh-chatty:settings-saved', reload)
        return () => window.removeEventListener('dsh-chatty:settings-saved', reload)
      }, 'dsh-chatty: reload settings')

      registerChattySlots(ctx)
      registerSettings(ctx)
      registerOfficialVoiceIntegration(ctx)

      ctx.effect(() => () => {
        try { cancelListening() } catch { /* 未在监听 */ }
        try { stopSpeaking(true) } catch { /* 未在播放 */ }
        disconnectSpeechEvents()
      }, 'dsh-chatty: release audio resources')
    }
    return module.exports
  },
})

// ---- inlined from lib/composer-text.js ----
// composer 即草稿：语音识别结果直写 Session 输入框的纯文本逻辑。
//
// 设计：
//   - appendSegment：把一段识别结果追加到输入框现有内容之后（空输入框直接写入；
//     已有内容先去掉尾部空白再用换行衔接），并给出本次插入的区间，
//     供「撤销最后一段」按区间回退。
//   - revertLastInsert：按插入历史回退最近一次追加。回退前校验目标区间
//     仍是当初写入的内容——用户已经手改过就放弃回退（保守，不吞用户输入）。
//
// 纯函数、零依赖：宿主单测直接 import；构建脚本把它内联进浏览器 bundle
// （去掉 export 前缀），两端共享同一实现。

/**
 * 追加一段识别结果。
 * @param {string} current 输入框当前文本
 * @param {string} segment 本段识别结果
 * @param {string} [separator] 衔接符（默认换行）
 * @returns {{ text: string, insertStart: number, insertEnd: number }}
 */
function appendSegment(current, segment, separator = '\n') {
  const base = String(current ?? '')
  const clean = String(segment ?? '').trim()
  if (!clean) return { text: base, insertStart: base.length, insertEnd: base.length }
  if (!base.trim()) return { text: clean, insertStart: 0, insertEnd: clean.length }
  // 插入区间包含衔接符：撤销时连换行一起删，不会残留空行。
  const trimmed = base.replace(/\s+$/, '')
  return {
    text: trimmed + separator + clean,
    insertStart: trimmed.length,
    insertEnd: trimmed.length + separator.length + clean.length,
  }
}

/**
 * 记录一次插入（生成撤销条目）。
 * @returns {{ before: string, added: string, start: number, end: number } | null}
 */
function recordInsert(before, result) {
  if (!result || result.insertStart === result.insertEnd) return null
  const added = result.text.slice(result.insertStart, result.insertEnd)
  if (!added) return null
  return { before: String(before ?? ''), added, start: result.insertStart, end: result.insertEnd }
}

/**
 * 回退最近一次插入。
 * @param {string} current 输入框当前文本
 * @param {Array<{before: string, added: string, start: number, end: number}>} history 插入历史（可变，回退成功时弹出一条）
 * @returns {{ text: string, removed: string | null }}
 */
function revertLastInsert(current, history) {
  const last = Array.isArray(history) ? history[history.length - 1] : null
  if (!last) return { text: String(current ?? ''), removed: null }
  const text = String(current ?? '')
  if (text.slice(last.start, last.end) !== last.added) {
    // 目标区间已被用户修改：放弃回退，避免吞掉用户输入。
    return { text, removed: null }
  }
  history.pop()
  return { text: text.slice(0, last.start) + text.slice(last.end), removed: last.added }
}

/**
 * 回退所有由语音插入的段落（「清空」指令）。逐条尝试回退，
 * 遇到被用户改动的段落即停止（保护用户输入）。
 */
function revertAllInserts(current, history) {
  let text = String(current ?? '')
  let removed = 0
  while (history.length) {
    const result = revertLastInsert(text, history)
    if (!result.removed) break
    text = result.text
    removed += 1
  }
  return { text, removed }
}

// ---- inlined from lib/command-parser.js ----
// 语音指令解析（需求 §5）。
//
// 红线：不能做子串包含匹配 ——
//   「发送」          → 命令
//   「这个请求发送以后需要等待服务器响应」 → 普通正文
// 第一阶段策略：一个 Utterance 归一化后必须**整体等于**指令词才算命令；
// 唤醒模式下还必须带前缀（「DSH，发送」/「dsh send」）。
// 后续阶段可以在这里替换成 Command Classifier，调用方无需改动。

const DEFAULT_COMMANDS = {
  send: ['发送', '提交', '发送消息', 'send', 'submit'],
  undo: ['撤销', '重说', '撤回', 'undo'],
  clear: ['清空', '清除', 'clear'],
  polish: ['润色', '整理一下', 'polish'],
  stop_listening: ['停止录音', '停止监听', '结束监听', 'stop listening'],
  read: ['朗读', '读一下', 'read'],
  stop_reading: ['停止朗读', '别读了', 'stop reading'],
}

/** 动作名顺序即 UI/文档中的展示顺序。 */
const COMMAND_ACTIONS = Object.keys(DEFAULT_COMMANDS)

const FULL_WIDTH_START = 0xff01
const FULL_WIDTH_END = 0xff5e
const FULL_WIDTH_OFFSET = 0xfee0

/**
 * 归一化：全角转半角、小写、去掉首尾空白与尾部标点、压缩内部空白。
 * 注意内部标点保留，否则「这个请求发送以后」会被误拼成一个词。
 */
function normalizeCommandText(text) {
  let out = String(text == null ? '' : text)
  out = out.replace(/[\uff01-\uff5e]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - FULL_WIDTH_OFFSET))
  out = out.replace(/\u3000/g, ' ')
  out = out.toLowerCase().trim()
  out = out.replace(/[，。！？,.!?；;：:\s]+$/g, '')
  out = out.replace(/\s+/g, ' ')
  return out.trim()
}

function buildTable(commands) {
  const table = new Map()
  for (const [action, phrases] of Object.entries(commands || {})) {
    for (const phrase of Array.isArray(phrases) ? phrases : []) {
      const key = normalizeCommandText(phrase)
      if (key) table.set(key, action)
    }
  }
  return table
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * @param {object} [options]
 * @param {Record<string, string[]>} [options.commands] 覆盖默认指令表
 * @param {'exact'|'wake'|'off'} [options.mode] 指令模式
 * @param {string} [options.wakePrefix] 唤醒前缀，例如 DSH
 * @param {string[]} [options.wakeWords] 额外唤醒词，例如 小D
 */
function createCommandParser(options = {}) {
  const commands = options.commands && typeof options.commands === 'object'
    ? options.commands
    : DEFAULT_COMMANDS
  const table = buildTable(commands)
  const mode = options.mode === 'wake' || options.mode === 'off' ? options.mode : 'exact'
  const wakeWords = [options.wakePrefix, ...(Array.isArray(options.wakeWords) ? options.wakeWords : [])]
    .map((word) => normalizeCommandText(word))
    .filter(Boolean)
  const wakePattern = wakeWords.length
    ? new RegExp('^(?:' + wakeWords.map(escapeRegExp).join('|') + ')\\s*[,、:：]?\\s*')
    : null

  /**
   * @param {string} text 一个 Utterance 的识别结果
   * @returns {{command: string, phrase: string, mode: 'exact'|'wake', rest: string}|null}
   */
  function parse(text) {
    if (mode === 'off') return null
    const clean = normalizeCommandText(text)
    if (!clean) return null

    // exact 模式：整句等于指令词。wake 模式不认裸指令词，必须带前缀。
    if (mode === 'exact') {
      const direct = table.get(clean)
      return direct ? { command: direct, phrase: clean, mode: 'exact', rest: '' } : null
    }

    if (!wakePattern) return null
    const stripped = clean.replace(wakePattern, '')
    if (stripped === clean) return null
    const command = table.get(stripped)
    if (!command) return null
    return { command, phrase: stripped, mode: 'wake', rest: '' }
  }

  return {
    parse,
    mode,
    wakeWords,
    commands,
    /** 当前指令表（归一化后的短语 → 动作），设置页展示用。 */
    table: () => Object.fromEntries(table),
  }
}

// ---- inlined from lib/draft-ledger.js ----
// 原生编辑器是唯一正文；此账本只记录可靠的语音区间和 CAS 锚点。
function createDraftLedger({ actions, state, limit = 200 }) {
  let current = state
  let epoch = 0
  let edits = []
  let records = []
  let floor = state?.draftRev || 0
  function detect(s) {
    let text = String(s?.draft || '')
    for (const o of [...(s?.occurrences || [])].sort(
      (a, b) => b.offset - a.offset
    ))
      text =
        text.slice(0, o.offset) + '\ufffc' + text.slice(o.offset + o.length)
    return text
  }
  function receive(s) {
    if (!s) return
    if (current && s.draftRev < current.draftRev) return
    if (
      current &&
      (s.draftRev !== current.draftRev || detect(s) !== detect(current))
    ) {
      epoch++
      edits = []
      records = []
      floor = s.draftRev
    }
    current = s
  }
  function capture() {
    const span = actions().captureInsertion()
    return { ...span, start: span.end, epoch }
  }
  function rebase(span) {
    if (
      !current ||
      span.epoch !== epoch ||
      span.draftRev < floor ||
      span.draftRev > current.draftRev
    )
      return null
    let start = span.start,
      end = span.end
    for (const e of edits) {
      if (e.rev <= span.draftRev) continue
      if (e.end <= start) {
        start += e.delta
        end += e.delta
      } else if (e.start < end) return null
    }
    return { start, end, draftRev: current.draftRev }
  }
  function apply(text, span) {
    const rebased = rebase(span)
    if (!rebased || (current.phase && current.phase !== 'plain')) return false
    const { start, end } = rebased
    const adjusted = { start, end, draftRev: current.draftRev }
    const before = detect(current)
    if (!actions().insertText(text, adjusted)) return false
    const clean = String(text).replace(/\ufffc/g, '')
    const after = before.slice(0, start) + clean + before.slice(end)
    const nextRev = current.draftRev + 1
    const delta = clean.length - (end - start)
    records = records.flatMap((r) =>
      r.end <= start
        ? [r]
        : r.start >= end
          ? [{ ...r, start: r.start + delta, end: r.end + delta }]
          : []
    )
    edits.push({ rev: nextRev, start, end, delta })
    if (edits.length > limit * 2) floor = edits.shift().rev
    current = { ...current, draft: after, occurrences: [], draftRev: nextRev }
    return {
      start,
      end: start + clean.length,
      text: clean,
      rev: nextRev,
      epoch
    }
  }
  function insert(text, anchor, separator = '\n') {
    const previous = records.at(-1)
    const adjusted = rebase(anchor)
    if (!adjusted) return false
    const prefix =
      previous && previous.end === adjusted.start && previous.epoch === epoch
        ? separator
        : ''
    const record = apply(prefix + text, anchor)
    if (record) {
      records.push(record)
      if (records.length > limit) records.shift()
    }
    return !!record
  }
  function replace(text, span) {
    const record = apply(text, span)
    if (!record) return false
    records.push(record)
    records.sort((a, b) => a.start - b.start)
    return true
  }
  function remove(record) {
    if (!record || record.epoch !== epoch) return false
    const result = apply('', {
      start: record.start,
      end: record.end,
      draftRev: current.draftRev,
      epoch
    })
    if (!result) return false
    records = records.filter((r) => r !== record)
    return true
  }
  return {
    receive,
    capture,
    insert,
    apply,
    replace,
    rebase,
    undo: () => remove(records.at(-1)),
    clear: () => {
      while (records.length) if (!remove(records.at(-1))) return false
      return true
    },
    records: () => records.slice(),
    text: () => records.map((r) => r.text).join(''),
    epoch: () => epoch,
    reset() {
      epoch++
      records = []
      edits = []
      floor = current?.draftRev || 0
    }
  }
}
