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
      voiceBuffer: '',      // 语音文本缓冲（composer 即草稿的事实源，见 50-draft）
      voiceChat: false,     // 语音对话模式（🗣 按钮；宿主 /voice-chat 同步运行时状态）
      ttsProgress: null,    // { index, total } 朗读进度
      ttsStage: '',         // PREPARING 子阶段：render | synth
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
    const iconChat = () => React.createElement('svg', CHATTY_ICON,
      React.createElement('path', { d: 'M13.25 7.75a5.25 5.25 0 0 1-7.9 4.55L2.75 13.25l.95-2.6a5.25 5.25 0 1 1 9.55-2.9z' }),
      React.createElement('path', { d: 'M5.75 7.25h4.5M5.75 9.25h3' }))
    const iconClose = () => React.createElement('svg', CHATTY_ICON,
      React.createElement('line', { x1: 12, y1: 4, x2: 4, y2: 12 }),
      React.createElement('line', { x1: 4, y1: 4, x2: 12, y2: 12 }))
    const iconSend = () => React.createElement('svg', CHATTY_ICON,
      React.createElement('path', { d: 'M2.5 8l11-5-4 11-2.5-4z' }))
    const iconUndo = () => React.createElement('svg', CHATTY_ICON,
      React.createElement('path', { d: 'M3 7h6.5a3.5 3.5 0 0 1 0 7H6' }),
      React.createElement('path', { d: 'M5.5 4.5L3 7l2.5 2.5' }))

    function chattyButton(spec) {
      if (PRIM && PRIM.Button) {
        // 自研 CSS 悬停提示（data-tip）——PRIM.Tooltip 的属性名跨版本不稳定，不依赖。
        return React.createElement('span', { className: 'dch-tipwrap', 'data-tip': spec.label },
          React.createElement(PRIM.Button, {
            type: 'button', variant: 'toolbar', size: 'sm', icon: spec.icon,
            'aria-label': spec.label, disabled: spec.disabled, onClick: spec.onClick,
            'data-active': spec.active ? '1' : undefined,
          }))
      }
      return React.createElement('button', {
        type: 'button', className: 'dch-btn', 'data-tip': spec.label, 'aria-label': spec.label,
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
