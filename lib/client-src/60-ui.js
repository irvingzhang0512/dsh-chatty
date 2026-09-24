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
      return React.createElement('span', { className: 'dch-levels' + (props.active ? ' dch-viz-active' : ''), 'aria-hidden': 'true' },
        values.map((value, index) => React.createElement('span', {
          key: index,
          style: { height: Math.max(3, Math.round(3 + value * 13)) + 'px' },
        })))
    }

    function chattyMainStatusText() {
      // 朗读优先（听与读互斥的场景提示谁在占用通道）。
      if (chatty.ttsPhase === 'PLAYING') return t('reading')
      if (chatty.ttsPhase === 'PREPARING') return t('preparing')
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
      }, [])

      React.useEffect(() => {
        if (sessionRef.current === chatty.sessionId) return
        sessionRef.current = chatty.sessionId
        chatty.partial = ''
        chatty.lastRenderedDraft = null
        sttClient.closeStream(true)
        sttClient.resetUtterance()
        stopSpeaking(true)
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
      const busy = state.sttPhase === 'TRANSCRIBING' || state.sttPhase === 'SPEECH_DETECTED'
      const speaking = state.ttsPhase === 'PLAYING' || state.ttsPhase === 'PREPARING'
      const showViz = chattySetting('ui.visualizer', 'bars') !== 'off' && (listening || speaking)
      const status = state.notice || chattyMainStatusText()
      const errored = state.sttPhase === 'ERROR' || state.ttsPhase === 'ERROR'

      // 主按钮：唯一的长语音开关。
      const micButton = chattyButton({
        label: !chatty.supported ? t('unsupported')
          : listening ? t('stopListening') : t('startListening'),
        icon: listening ? iconStop() : iconMic(),
        active: listening && state.sttPhase !== 'PAUSED',
        disabled: !chatty.supported || (busy && listening),
        onClick: () => toggleListening(),
      })
      // 朗读按钮：播放中变为「停止朗读」。
      const speakButton = chattyButton({
        label: speaking ? t('stopSpeaking') : t('readReply'),
        icon: speaking ? iconStop() : iconSpeaker(),
        active: speaking,
        onClick: () => { if (speaking) stopSpeaking(); else readLatestReply() },
      })

      return React.createElement('div', { className: 'dch-bar', role: 'group', 'aria-label': t('title') },
        micButton,
        React.createElement('span', {
          className: 'dch-bar-status',
          'data-error': errored ? '1' : '0',
          role: 'status', 'aria-live': 'polite',
        },
          React.createElement('span', { className: 'dch-dot', 'data-on': (listening && state.sttPhase !== 'PAUSED') ? '1' : '0' }),
          React.createElement('span', { className: 'dch-status' }, status),
          showViz ? React.createElement(LevelBars, { levels: state.levels, active: listening }) : null,
          listening && chatty.listenStartedAt
            ? React.createElement('span', { className: 'dch-timer' }, fmtElapsed(Date.now() - chatty.listenStartedAt))
            : null),
        speakButton)
    }

    /** 指令清单（动作中文名 + 说法），来自宿主 /status 的 commands 表。 */
    const CHATTY_COMMAND_NAMES = {
      send: '发送草稿', undo: '撤销最后一段', clear: '清空草稿', cancel: '取消草稿',
      polish: '润色草稿', stop_listening: '停止录音', pause: '暂停监听', resume: '继续听',
      read: '朗读回复', stop_reading: '停止朗读',
    }
    const CHATTY_COMMAND_ORDER = ['send', 'undo', 'clear', 'cancel', 'polish', 'stop_listening', 'pause', 'resume', 'read', 'stop_reading']

    function CommandHelp() {
      const commands = (chattySetting('voice_control.commands', null) || {})
      const rows = CHATTY_COMMAND_ORDER
        .filter((action) => Array.isArray(commands[action]) && commands[action].length)
        .map((action) => ({ action, name: CHATTY_COMMAND_NAMES[action] || action, say: commands[action].slice(0, 3).join(' / ') }))
      return React.createElement('div', { className: 'dch-help', role: 'note' },
        React.createElement('strong', null, '语音指令（必须整句说成一句）'),
        rows.map((row) => React.createElement('div', { className: 'dch-help-row', key: row.action },
          React.createElement('b', null, row.name),
          React.createElement('code', null, row.say))),
        React.createElement('span', { className: 'dch-muted' },
          '正文里出现指令词不会被误判；判定方式可在设置卡调整（整句匹配 / 唤醒前缀）。'))
    }

    function DraftPanel(props) {
      const state = useChatty()
      chatty.inputActions = props.inputActions || chatty.inputActions
      chatty.input = props.input || chatty.input
      const [showHelp, setShowHelp] = React.useState(false)
      const [, forceTick] = React.useReducer((value) => value + 1, 0)

      // 监听中每秒刷新计时。
      React.useEffect(() => {
        if (state.sttPhase !== 'LISTENING' && state.sttPhase !== 'SPEECH_DETECTED') return undefined
        const timer = setInterval(forceTick, 1000)
        return () => clearInterval(timer)
      }, [state.sttPhase])

      if (chattySetting('ui.show_draft_panel', true) === false) return null

      const listening = sttClient.active
      const partial = state.partial || ''
      const composerHasText = readComposerDraft().trim() !== ''
      const visible = listening || composerHasText || partial || state.busy === 'polish'
      if (!visible) return null

      const status = state.notice || sttStatusText()
      const elapsed = listening && chatty.listenStartedAt ? fmtElapsed(Date.now() - chatty.listenStartedAt) : ''

      return React.createElement('div', { className: 'dch-panel', style: { maxWidth: width() + 'px' } },
        React.createElement('div', { className: 'dch-panel-head' },
          React.createElement('span', { className: 'dch-dot', 'data-on': listening ? '1' : '0' }),
          React.createElement('span', {
            className: 'dch-status',
            'data-error': state.sttPhase === 'ERROR' ? '1' : '0',
          }, status + (elapsed ? ` · ${elapsed}` : '')),
          listening ? React.createElement(LevelBars, { levels: state.levels, active: true }) : null,
          React.createElement('span', { className: 'dch-spacer' }),
          listening ? React.createElement('button', {
            type: 'button', className: 'dch-action',
            onClick: () => stopListening(),
          }, t('stopListening')) : null),
        partial && chattySetting('ui.show_partial', true)
          ? React.createElement('div', { className: 'dch-partial' }, t('partial') + '：' + partial)
          : null,
        composerHasText && !listening
          ? React.createElement('div', { className: 'dch-partial' },
              '识别内容已在输入框中，直接编辑后按发送即可。')
          : null,
        showHelp ? React.createElement(CommandHelp) : null,
        React.createElement('div', { className: 'dch-panel-actions' },
          React.createElement('button', {
            type: 'button', className: 'dch-action',
            title: '语音指令有哪些', 'aria-expanded': showHelp ? 'true' : 'false',
            onClick: () => setShowHelp((current) => !current),
          }, '? 指令'),
          React.createElement('button', {
            type: 'button', className: 'dch-action',
            disabled: state.busy === 'polish',
            title: '对输入框全文润色', onClick: () => polishComposer(),
          }, state.busy === 'polish' ? t('polishing') : t('polish')),
          React.createElement('button', {
            type: 'button', className: 'dch-action',
            title: t('undo'), onClick: () => undoLastInsert(),
          }, t('undo'))))
    }

    function width() { return Number(chattySetting('ui.panel_width', 720)) || 720 }
