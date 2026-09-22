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
