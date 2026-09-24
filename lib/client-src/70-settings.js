    // ── 设置卡（需求 §22 / §23）──────────────────────────────────────
    //
    // 结构（v0.2 重构）：
    //   卡片头部（对齐 DSH 原生：标题一行、描述一行、右侧箭头）
    //   └─ 展开后：
    //       ① 凭据区（固定顶部）：每把 Key 的 ✓/✗、打开凭据文件、重新检查
    //       ② 子页签：语音输入 / 语音输出 / 指令与草稿 / 界面 / 高级
    //       ③ 保存 / 重新加载（所有页签共用）
    // 原则：能下拉的绝不手填；切 provider 时凭据名等字段自动跟随；
    //       低频项（端点、resource id、润色端点）全部收进「高级」。

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

    /** 下拉：options = [{value,label}]；当前值不在列表里时自动补一项，保证不丢用户配置。 */
    function ChattySelect(props) {
      const options = (props.options || []).slice()
      const value = props.value == null ? '' : String(props.value)
      if (value && !options.some((option) => String(option.value) === value)) {
        options.unshift({ value, label: value + '（当前）' })
      }
      return React.createElement('select', {
        value, disabled: props.disabled,
        onChange: (event) => props.onChange(event.target.value),
      }, options.map((option) => React.createElement('option', {
        key: String(option.value), value: String(option.value),
      }, option.label)))
    }

    const CHATTY_LANGUAGES = [
      { value: 'zh-CN', label: '中文（普通话）' },
      { value: 'en-US', label: '英语（美式）' },
      { value: 'auto', label: '自动检测' },
    ]
    const CHATTY_FORMATS = [
      { value: 'pcm', label: 'PCM（推荐，直接播放）' },
      { value: 'mp3', label: 'MP3' },
      { value: 'wav', label: 'WAV' },
    ]
    const CHATTY_VISUALIZERS = [
      { value: 'bars', label: '音量柱' },
      { value: 'wave', label: '波形' },
      { value: 'off', label: '关闭' },
    ]
    const CHATTY_COMMAND_MODES = [
      { value: 'exact', label: '整句匹配（推荐）' },
      { value: 'wake', label: '唤醒前缀（如「DSH，发送」）' },
      { value: 'off', label: '关闭语音指令' },
    ]

    function ChattySection(props) {
      const ctx = props.ctx
      const scope = ((ctx.get && ctx.get('lanSettings')) || ctx.settingsScope).bind({ namespace: NS })
      const [snap, setSnap] = React.useState(null)
      const [draft, setDraft] = React.useState(null)
      const [saved, setSaved] = React.useState(false)
      const [error, setError] = React.useState('')
      const [info, setInfo] = React.useState(null)
      const [tab, setTab] = React.useState('stt')
      const [cred, setCred] = React.useState(null)
      // 试用状态：STT = { status: 'idle'|'recording'|'busy'|'done'|'error', text, error }
      //           TTS = { status: 'idle'|'busy'|'done'|'error', error }（成功即出声）
      const [sttTest, setSttTest] = React.useState({ status: 'idle', text: '', error: '' })
      const [ttsTest, setTtsTest] = React.useState({ status: 'idle', error: '' })

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
          try { ((ctx.get && ctx.get('lanSettings')) || ctx.settingsScope).describe().load() } catch { /* 服务还没起来 */ }
        }, 1000)
        return () => clearInterval(timer)
      }, [ready])

      React.useEffect(() => {
        if (ready && draft === null) setDraft(JSON.parse(JSON.stringify(value)))
      }, [ready, draft, value])

      const refreshInfo = React.useCallback(() => {
        getJson('/dsh-chatty/config-info').then(setInfo).catch(() => setInfo(null))
      }, [])
      const refreshCredentials = React.useCallback(() => {
        getJson('/dsh-chatty/credentials/state').then(setCred).catch(() => setCred(null))
      }, [])
      React.useEffect(() => { refreshInfo(); refreshCredentials() }, [refreshInfo, refreshCredentials])

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

      const stt = draft.stt || {}
      const vad = stt.vad || {}
      const control = draft.voice_control || {}
      const tts = draft.tts || {}
      const ui = draft.ui || {}
      const polish = draft.polish || {}

      const sttProviders = (info && info.stt && info.stt.providers) || [{ key: 'volcano', label: '火山引擎（Agent Plan）' }, { key: 'siliconflow', label: '硅基流动' }]
      const ttsProviders = (info && info.tts && info.tts.providers) || [{ key: 'siliconflow', label: '硅基流动' }, { key: 'volcano', label: '火山引擎（经典合成）' }]
      const sttMeta = sttProviders.find((item) => item.key === stt.provider) || {}
      const voices = ((info && info.tts && info.tts.voices) || [])
        .filter((item) => !tts.provider || item.provider === tts.provider)
        .map((item) => ({ value: item.id, label: item.label || item.id }))

      /** 切 provider：凭据名、模型自动跟随该 provider 的默认值（联动核心）。 */
      const switchProvider = (section, next) => {
        const meta = (section === 'stt' ? sttProviders : ttsProviders).find((item) => item.key === next) || {}
        setIn(section, 'provider', next)
        if (meta.defaultCredential) setIn(section, 'credential', meta.defaultCredential)
        const firstModel = meta.models && meta.models[0] && meta.models[0].id
        if (section === 'stt' && firstModel) setIn('stt', 'model', firstModel)
      }

      const openCredentialsFile = async () => {
        try { await postJson('/dsh-chatty/credentials/open', {}) } catch (openError) {
          setError(String(openError && openError.message || openError))
        }
      }

      // ── STT 试用：录 3.5 秒 → 当前 provider 识别 → 显示结果 ──────────
      async function testStt() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          setSttTest({ status: 'error', text: '', error: t('unsupported') })
          return
        }
        setSttTest({ status: 'recording', text: '', error: '' })
        let stream = null
        let audioCtx = null
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              deviceId: chattySetting('mic_device_id', '') ? { exact: chattySetting('mic_device_id', '') } : undefined,
              noiseSuppression: chattySetting('noise_suppression', true),
              echoCancellation: chattySetting('echo_cancellation', true),
              autoGainControl: chattySetting('auto_gain_control', true),
              channelCount: 1,
            },
          })
          const Ctx = typeof AudioContext !== 'undefined' ? AudioContext : webkitAudioContext
          audioCtx = new Ctx({ sampleRate: 16000 })
          const source = audioCtx.createMediaStreamSource(stream)
          const processor = audioCtx.createScriptProcessor(4096, 1, 1)
          const chunks = []
          processor.onaudioprocess = (event) => {
            const input = event.inputBuffer.getChannelData(0)
            const pcm = new Uint8Array(input.length * 2)
            const view = new DataView(pcm.buffer)
            for (let i = 0; i < input.length; i += 1) {
              const v = Math.max(-1, Math.min(1, input[i]))
              view.setInt16(i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true)
            }
            chunks.push(pcm)
          }
          source.connect(processor)
          const mute = audioCtx.createGain()
          mute.gain.value = 0
          processor.connect(mute)
          mute.connect(audioCtx.destination)
          // 3.5 秒采集窗口。
          await new Promise((resolve) => setTimeout(resolve, 3500))
          processor.onaudioprocess = null
          processor.disconnect()
          source.disconnect()
          stream.getTracks().forEach((track) => track.stop())
          await audioCtx.close()
          audioCtx = null
          stream = null

          const total = chunks.reduce((sum, item) => sum + item.length, 0)
          const pcmAll = new Uint8Array(total)
          let offset = 0
          for (const item of chunks) { pcmAll.set(item, offset); offset += item.length }
          const wav = pcm16ToWavClient(pcmAll, audioCtx && audioCtx.sampleRate ? 16000 : 16000)
          setSttTest((current) => ({ ...current, status: 'busy' }))
          const started = Date.now()
          const payload = await postJson('/dsh-chatty/stt/transcribe', {
            dataBase64: bytesToBase64(wav),
            mimeType: 'audio/wav',
            language: chattySetting('stt.language', 'zh-CN'),
          })
          setSttTest({
            status: 'done',
            text: String(payload.text || '') || '（未识别到内容——刚才可能没说话）',
            error: '',
            tookMs: payload.tookMs || (Date.now() - started),
          })
        } catch (testError) {
          if (stream) stream.getTracks().forEach((track) => track.stop())
          if (audioCtx) { try { await audioCtx.close() } catch { /* 已关闭 */ } }
          setSttTest({ status: 'error', text: '', error: String(testError && testError.message || testError) })
        }
      }

      // ── TTS 试听：当前 provider 合成一句固定文案并播放 ────────────────
      async function testTts() {
        setTtsTest({ status: 'busy', error: '' })
        try {
          // 主播放通道先停，避免两个声音叠加。
          try { stopSpeaking() } catch { /* 未在播放 */ }
          const res = await fetch('/dsh-chatty/tts/synthesize', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              text: '你好，这是 dsh-chatty 的语音合成试听。',
              voice: chattySetting('tts.voice', ''),
              speed: chattySetting('tts.speed', 1),
              format: 'mp3',
            }),
          })
          if (!res.ok) {
            let message = `HTTP ${res.status}`
            try { const data = await res.json(); if (data && data.error && data.error.message) message = data.error.message } catch { /* 非 JSON */ }
            throw new Error(message)
          }
          const blob = await res.blob()
          const url = URL.createObjectURL(blob)
          const audio = new Audio(url)
          audio.onended = () => { try { URL.revokeObjectURL(url) } catch { /* 已释放 */ } }
          audio.onerror = () => {
            try { URL.revokeObjectURL(url) } catch { /* 已释放 */ }
            setTtsTest({ status: 'error', error: '音频播放失败' })
          }
          await audio.play()
          setTtsTest({ status: 'done', error: '' })
        } catch (testError) {
          setTtsTest({ status: 'error', error: String(testError && testError.message || testError) })
        }
      }

      const save = async () => {
        setError('')
        try {
          for (const key of Object.keys(draft)) await scope.set(key, draft[key])
          setSaved(true)
          setTimeout(() => setSaved(false), 1600)
          refreshCredentials()
          try { window.dispatchEvent(new CustomEvent('dsh-chatty:settings-saved')) } catch { /* 没有 window */ }
        } catch (saveError) {
          setError(String(saveError && saveError.message || saveError))
        }
      }

      // ── ① 凭据区（固定顶部，跨 provider） ────────────────────────────
      function renderCredentials() {
        const rows = (cred && Array.isArray(cred.credentials)) ? cred.credentials : []
        return React.createElement('div', { className: 'dch-cred' },
          React.createElement('div', { className: 'dch-cred-row' },
            React.createElement('strong', null, '凭据（API Key）'),
            React.createElement('button', {
              type: 'button', className: 'dch-action', onClick: openCredentialsFile,
            }, '打开凭据文件'),
            React.createElement('button', {
              type: 'button', className: 'dch-action', onClick: refreshCredentials,
            }, '重新检查')),
          rows.map((row, index) => React.createElement('div', { className: 'dch-cred-row', key: row.name + index },
            React.createElement('span', { className: row.configured ? 'dch-cred-ok' : 'dch-cred-bad' },
              row.configured ? '✓ 已配置' : '✗ 未配置'),
            React.createElement('span', null, `${row.role}：`),
            React.createElement('code', null, row.name))),
          cred && cred.hint ? React.createElement('pre', { className: 'dch-cred-hint' }, cred.hint) : null,
          React.createElement('span', { className: 'dch-muted' },
            '密钥保存在 DSH 凭据文件里（点「打开凭据文件」编辑并在 refs: 下加一行），插件只读引用名，不保存明文。'))
      }

      // ── ② 语音输入 ───────────────────────────────────────────────────
      function renderSttTab() {
        return React.createElement(React.Fragment, null,
          React.createElement('div', { className: 'dch-row' },
            React.createElement(ChattyField, { label: '识别提供方' },
              React.createElement(ChattySelect, {
                value: stt.provider || 'siliconflow', disabled: !writable,
                options: sttProviders.map((item) => ({ value: item.key, label: item.label || item.key })),
                onChange: (next) => switchProvider('stt', next),
              })),
            React.createElement(ChattyField, { label: '识别模型' },
              React.createElement(ChattySelect, {
                value: stt.model || '', disabled: !writable,
                options: (sttMeta.models || []).map((item) => ({ value: item.id, label: item.label || item.id })),
                onChange: (next) => setIn('stt', 'model', next),
              })),
            React.createElement(ChattyField, { label: '识别语言' },
              React.createElement(ChattySelect, {
                value: stt.language || 'zh-CN', disabled: !writable,
                options: CHATTY_LANGUAGES,
                onChange: (next) => setIn('stt', 'language', next),
              })),
            React.createElement(ChattyField, { label: 'API Key 凭据名', hint: '凭据文件里的引用名' },
              React.createElement('input', {
                type: 'text', value: stt.credential || '', disabled: !writable,
                onChange: (event) => setIn('stt', 'credential', event.target.value),
              }))),
          React.createElement('div', { className: 'dch-cred' },
            React.createElement('div', { className: 'dch-cred-row' },
              React.createElement('button', {
                type: 'button', className: 'dch-action', 'data-primary': '1',
                disabled: !writable || sttTest.status === 'recording' || sttTest.status === 'busy',
                onClick: testStt,
              }, sttTest.status === 'recording' ? '正在录音，请说一句话…'
                : sttTest.status === 'busy' ? '识别中…' : '试一下（录 3.5 秒并识别）')),
            sttTest.status === 'done'
              ? React.createElement('div', { className: 'dch-cred-row' },
                  React.createElement('span', { className: 'dch-cred-ok' }, '识别结果：'),
                  React.createElement('span', null, sttTest.text),
                  sttTest.tookMs ? React.createElement('span', { className: 'dch-muted' }, `${sttTest.tookMs}ms`) : null)
              : null,
            sttTest.status === 'error'
              ? React.createElement('div', { className: 'dch-cred-row' },
                  React.createElement('span', { className: 'dch-cred-bad' }, sttTest.error))
              : null),
          React.createElement('div', { className: 'dch-row' },
            React.createElement(ChattyCheck, {
              label: '流式识别', checked: stt.streaming !== false, disabled: !writable,
              onChange: (next) => setIn('stt', 'streaming', next),
            }),
            React.createElement(ChattyCheck, {
              label: '启动即长语音', checked: !!stt.continuous_listening, disabled: !writable,
              onChange: (next) => setIn('stt', 'continuous_listening', next),
            }),
            React.createElement(ChattyCheck, {
              label: '实时预览', checked: stt.partial_preview !== false, disabled: !writable,
              onChange: (next) => setIn('stt', 'partial_preview', next),
            })),
          React.createElement('div', { className: 'dch-row' },
            React.createElement(ChattyField, { label: 'VAD 灵敏度' },
              React.createElement('input', {
                type: 'number', step: '0.05', min: '0', max: '1', value: vad.sensitivity ?? 0.6, disabled: !writable,
                onChange: (event) => setIn('stt', 'vad', Object.assign({}, vad, { sensitivity: Number(event.target.value) })),
              })),
            React.createElement(ChattyField, { label: '静音判定（毫秒）' },
              React.createElement('input', {
                type: 'number', value: vad.silence_timeout_ms ?? 1200, disabled: !writable,
                onChange: (event) => setIn('stt', 'vad', Object.assign({}, vad, { silence_timeout_ms: Number(event.target.value) })),
              })),
            React.createElement(ChattyField, { label: '最短人声（毫秒）' },
              React.createElement('input', {
                type: 'number', value: vad.min_speech_ms ?? 200, disabled: !writable,
                onChange: (event) => setIn('stt', 'vad', Object.assign({}, vad, { min_speech_ms: Number(event.target.value) })),
              })),
            React.createElement(ChattyField, { label: '前置缓冲（毫秒）' },
              React.createElement('input', {
                type: 'number', value: vad.pre_roll_ms ?? 400, disabled: !writable,
                onChange: (event) => setIn('stt', 'vad', Object.assign({}, vad, { pre_roll_ms: Number(event.target.value) })),
              }))))
      }

      // ── ③ 语音输出 ───────────────────────────────────────────────────
      function renderTtsTab() {
        return React.createElement(React.Fragment, null,
          React.createElement('div', { className: 'dch-row' },
            React.createElement(ChattyField, { label: '合成提供方' },
              React.createElement(ChattySelect, {
                value: tts.provider || 'siliconflow', disabled: !writable,
                options: ttsProviders.map((item) => ({ value: item.key, label: item.label || item.key })),
                onChange: (next) => switchProvider('tts', next),
              })),
            React.createElement(ChattyField, { label: '音色', hint: '可下拉选择，也可直接输入音色 ID' },
              React.createElement('input', {
                type: 'text', value: tts.voice || '', disabled: !writable, list: 'dch-voice-options',
                onChange: (event) => setIn('tts', 'voice', event.target.value),
              }),
              React.createElement('datalist', { id: 'dch-voice-options' },
                voices.map((item) => React.createElement('option', { key: item.value, value: item.value }, item.label)))),
            React.createElement(ChattyField, { label: 'API Key 凭据名' },
              React.createElement('input', {
                type: 'text', value: tts.credential || '', disabled: !writable,
                onChange: (event) => setIn('tts', 'credential', event.target.value),
              }))),
          React.createElement('div', { className: 'dch-row' },
            React.createElement(ChattyField, { label: '语速' },
              React.createElement('input', {
                type: 'number', step: '0.1', min: '0.5', max: '2', value: tts.speed ?? 1, disabled: !writable,
                onChange: (event) => setIn('tts', 'speed', Number(event.target.value)),
              })),
            React.createElement(ChattyField, { label: '音量' },
              React.createElement('input', {
                type: 'number', step: '0.1', min: '0', max: '1', value: tts.volume ?? 1, disabled: !writable,
                onChange: (event) => setIn('tts', 'volume', Number(event.target.value)),
              })),
            React.createElement(ChattyField, { label: '音频格式' },
              React.createElement(ChattySelect, {
                value: tts.format || 'pcm', disabled: !writable,
                options: CHATTY_FORMATS,
                onChange: (next) => setIn('tts', 'format', next),
              }))),
          React.createElement('div', { className: 'dch-cred' },
            React.createElement('div', { className: 'dch-cred-row' },
              React.createElement('button', {
                type: 'button', className: 'dch-action', 'data-primary': '1',
                disabled: !writable || ttsTest.status === 'busy',
                onClick: testTts,
              }, ttsTest.status === 'busy' ? '合成中…' : '试听（合成一句测试语）'),
              React.createElement('span', { className: 'dch-muted' }, '会播放声音，可用下方「停止朗读」或主按钮停止')),
            ttsTest.status === 'error'
              ? React.createElement('div', { className: 'dch-cred-row' },
                  React.createElement('span', { className: 'dch-cred-bad' }, ttsTest.error))
              : null,
            ttsTest.status === 'done'
              ? React.createElement('div', { className: 'dch-cred-row' },
                  React.createElement('span', { className: 'dch-cred-ok' }, '✓ 已合成并播放'))
              : null),
          React.createElement('div', { className: 'dch-row' },
            React.createElement(ChattyCheck, {
              label: '自动朗读回复', checked: !!tts.auto_read, disabled: !writable,
              onChange: (next) => setIn('tts', 'auto_read', next),
            }),
            React.createElement(ChattyCheck, {
              label: '我说话时打断朗读', checked: tts.interrupt_on_speech !== false, disabled: !writable,
              onChange: (next) => setIn('tts', 'interrupt_on_speech', next),
            }),
            React.createElement(ChattyCheck, {
              label: '跳过代码时给提示', checked: tts.code_hint !== false, disabled: !writable,
              onChange: (next) => setIn('tts', 'code_hint', next),
            }),
            React.createElement(ChattyCheck, {
              label: '表格用模型摘要', checked: tts.llm_summary !== false, disabled: !writable,
              onChange: (next) => setIn('tts', 'llm_summary', next),
            })))
      }

      // ── ④ 指令与草稿 ─────────────────────────────────────────────────
      function renderCommandsTab() {
        return React.createElement(React.Fragment, null,
          React.createElement(ChattyCheck, {
            label: '启用语音指令（发送 / 撤销 / 清空 / 润色 / 朗读…）', checked: control.enabled !== false, disabled: !writable,
            onChange: (next) => setIn('voice_control', 'enabled', next),
          }),
          React.createElement('div', { className: 'dch-row' },
            React.createElement(ChattyField, { label: '指令判定方式' },
              React.createElement(ChattySelect, {
                value: control.command_mode || 'exact', disabled: !writable,
                options: CHATTY_COMMAND_MODES,
                onChange: (next) => setIn('voice_control', 'command_mode', next),
              })),
            React.createElement(ChattyField, { label: '唤醒前缀（wake 模式）' },
              React.createElement('input', {
                type: 'text', value: control.wake_prefix || 'DSH', disabled: !writable,
                onChange: (event) => setIn('voice_control', 'wake_prefix', event.target.value),
              })),
            React.createElement(ChattyField, { label: '额外唤醒词（空格分隔）' },
              React.createElement('input', {
                type: 'text',
                value: Array.isArray(control.wake_words) ? control.wake_words.join(' ') : '',
                disabled: !writable,
                onChange: (event) => setIn('voice_control', 'wake_words', event.target.value.split(/\s+/).filter(Boolean)),
              }))),
          React.createElement('span', { className: 'dch-muted' },
            '指令必须整句说成一句（例如「发送」「撤销」），正文里出现这些词不会被误判。'),
          React.createElement(ChattyCheck, {
            label: '识别完成自动发送（默认关闭：说完自己确认）', checked: !!draft.auto_send, disabled: !writable,
            onChange: (next) => setTop('draft', Object.assign({}, draft, { auto_send: next })),
          }),
          React.createElement(ChattyCheck, {
            label: '允许「润色」指令调用模型', checked: draft.polish_on_command !== false, disabled: !writable,
            onChange: (next) => setTop('draft', Object.assign({}, draft, { polish_on_command: next })),
          }))
      }

      // ── ⑤ 界面 ───────────────────────────────────────────────────────
      function renderUiTab() {
        return React.createElement(React.Fragment, null,
          React.createElement('div', { className: 'dch-row' },
            React.createElement(ChattyCheck, {
              label: '显示 Voice Bar', checked: ui.show_voice_bar !== false, disabled: !writable,
              onChange: (next) => setIn('ui', 'show_voice_bar', next),
            }),
            React.createElement(ChattyCheck, {
              label: '显示 Voice Draft 面板', checked: ui.show_draft_panel !== false, disabled: !writable,
              onChange: (next) => setIn('ui', 'show_draft_panel', next),
            }),
            React.createElement(ChattyCheck, {
              label: '显示实时预览', checked: ui.show_partial !== false, disabled: !writable,
              onChange: (next) => setIn('ui', 'show_partial', next),
            })),
          React.createElement('div', { className: 'dch-row' },
            React.createElement(ChattyField, { label: '音频可视化' },
              React.createElement(ChattySelect, {
                value: ui.visualizer || 'bars', disabled: !writable,
                options: CHATTY_VISUALIZERS,
                onChange: (next) => setIn('ui', 'visualizer', next),
              })),
            React.createElement(ChattyField, { label: '面板最大宽度（px）' },
              React.createElement('input', {
                type: 'number', value: ui.panel_width ?? 720, disabled: !writable,
                onChange: (event) => setIn('ui', 'panel_width', Number(event.target.value)),
              }))))
      }

      // ── ⑥ 高级（低频项全部收在这里） ─────────────────────────────────
      function renderAdvancedTab() {
        return React.createElement(React.Fragment, null,
          React.createElement('div', { className: 'dch-section-title' }, '识别（高级）'),
          React.createElement('div', { className: 'dch-row' },
            React.createElement(ChattyField, { label: '批量端点覆盖' },
              React.createElement('input', {
                type: 'text', value: stt.base_url || '', disabled: !writable,
                onChange: (event) => setIn('stt', 'base_url', event.target.value),
              })),
            React.createElement(ChattyField, { label: '流式端点覆盖' },
              React.createElement('input', {
                type: 'text', value: stt.stream_url || '', disabled: !writable,
                onChange: (event) => setIn('stt', 'stream_url', event.target.value),
              })),
            React.createElement(ChattyField, { label: '资源 ID 覆盖' },
              React.createElement('input', {
                type: 'text', value: stt.resource_id || '', disabled: !writable,
                onChange: (event) => setIn('stt', 'resource_id', event.target.value),
              }))),
          React.createElement('div', { className: 'dch-section-title' }, '合成（高级）'),
          React.createElement('div', { className: 'dch-row' },
            React.createElement(ChattyField, { label: '合成模型' },
              React.createElement('input', {
                type: 'text', value: tts.model || '', disabled: !writable,
                onChange: (event) => setIn('tts', 'model', event.target.value),
              })),
            React.createElement(ChattyField, { label: 'App ID 凭据（火山经典）' },
              React.createElement('input', {
                type: 'text', value: tts.app_id_credential || '', disabled: !writable,
                onChange: (event) => setIn('tts', 'app_id_credential', event.target.value),
              })),
            React.createElement(ChattyField, { label: '火山集群' },
              React.createElement('input', {
                type: 'text', value: tts.cluster || '', disabled: !writable,
                onChange: (event) => setIn('tts', 'cluster', event.target.value),
              })),
            React.createElement(ChattyField, { label: '采样率' },
              React.createElement('input', {
                type: 'number', value: tts.sample_rate ?? 24000, disabled: !writable,
                onChange: (event) => setIn('tts', 'sample_rate', Number(event.target.value)),
              }))),
          React.createElement('div', { className: 'dch-section-title' }, '麦克风（高级）'),
          React.createElement('div', { className: 'dch-row' },
            React.createElement(ChattyField, { label: '麦克风设备 ID（留空=系统默认）' },
              React.createElement('input', {
                type: 'text', value: draft.mic_device_id || '', disabled: !writable,
                onChange: (event) => setTop('mic_device_id', event.target.value),
              })),
            React.createElement(ChattyCheck, {
              label: '降噪', checked: draft.noise_suppression !== false, disabled: !writable,
              onChange: (next) => setTop('noise_suppression', next),
            }),
            React.createElement(ChattyCheck, {
              label: '回声消除', checked: draft.echo_cancellation !== false, disabled: !writable,
              onChange: (next) => setTop('echo_cancellation', next),
            }),
            React.createElement(ChattyCheck, {
              label: '自动增益', checked: draft.auto_gain_control !== false, disabled: !writable,
              onChange: (next) => setTop('auto_gain_control', next),
            })),
          React.createElement('div', { className: 'dch-section-title' }, '润色（高级）'),
          React.createElement(ChattyCheck, {
            label: '允许润色与语音摘要调用模型', checked: polish.enabled !== false, disabled: !writable,
            onChange: (next) => setIn('polish', 'enabled', next),
          }),
          React.createElement('span', { className: 'dch-muted' },
            '润色默认跟随当前会话模型；如需固定模型或私有网关，请在 profile 配置里设置 polish.provider / polish.base_url。'))
      }

      const TABS = [
        { key: 'stt', label: '语音输入' },
        { key: 'tts', label: '语音输出' },
        { key: 'commands', label: '指令与草稿' },
        { key: 'ui', label: '界面' },
        { key: 'advanced', label: '高级' },
      ]
      const renderers = { stt: renderSttTab, tts: renderTtsTab, commands: renderCommandsTab, ui: renderUiTab, advanced: renderAdvancedTab }

      return React.createElement('div', { className: 'dch-card-body' },
        renderCredentials(),
        React.createElement('div', { className: 'dch-tabs' },
          TABS.map((item) => React.createElement('button', {
            type: 'button', key: item.key, className: 'dch-tab',
            'data-active': tab === item.key ? '1' : '0',
            onClick: () => setTab(item.key),
          }, item.label))),
        renderers[tab] ? renderers[tab]() : null,
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
