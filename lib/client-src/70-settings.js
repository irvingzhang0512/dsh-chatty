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
        return React.createElement('div', { className: 'dch-card-body' },
          React.createElement('span', { className: 'dch-card-desc' }, ready ? '' : t('reload')))
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

    /** 与 DSH 原生设置卡片一致的展开箭头：优先用平台图标，老版本回退到手绘。 */
    function chattyChevron() {
      const primChevron = PRIM && (PRIM.IconChevronDownOutline14 || PRIM.IconChevronDownOutline)
      if (primChevron) return React.createElement(primChevron)
      return React.createElement('svg', {
        width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor',
        strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true',
      }, React.createElement('path', { d: 'M4 6l4 4 4-4' }))
    }

    function ChattyPluginCard(props) {
      const page = !!(props && props.view === 'page')
      const [open, setOpen] = React.useState(!!page)
      const tt = (props && props.t) || t
      if (props && props.view === 'summary') {
        return React.createElement('span', { className: 'dch-card-desc' }, tt('cardHint'))
      }
      // 卡片头部与 DSH 原生设置卡对齐：标题一行、描述一行、右侧可旋转的展开箭头。
      return React.createElement(page ? 'div' : 'li', {
        className: 'dch-card',
        'data-open': open ? '1' : '0',
      },
        React.createElement('button', {
          type: 'button', className: 'dch-card-head',
          style: page ? { display: 'none' } : undefined,
          'aria-expanded': page ? 'true' : (open ? 'true' : 'false'),
          'aria-label': (open ? '收起' : '展开') + ': ' + tt('title'),
          onClick: () => setOpen((current) => !current),
        },
          React.createElement('span', { className: 'dch-card-text' },
            React.createElement('span', { className: 'dch-card-title' }, tt('title')),
            React.createElement('span', { className: 'dch-card-desc' }, tt('cardHint'))),
          React.createElement('span', { className: 'dch-chev' }, chattyChevron())),
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
