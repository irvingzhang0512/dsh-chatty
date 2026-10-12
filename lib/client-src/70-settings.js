function ChattyField(props) {
  return React.createElement(
    'div',
    { className: 'dch-field' },
    React.createElement('label', null, props.label),
    props.children,
    props.hint
      ? React.createElement('span', { className: 'dch-muted' }, props.hint)
      : null
  )
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
      props.onSaved()
    } catch (e) {
      setNotice(e.message)
    }
  }
  return React.createElement(
    'div',
    null,
    React.createElement(
      'button',
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
              value: ref || props.credentials[0]?.ref,
              onChange: (e) => setRef(e.target.value)
            },
            props.credentials.map((c) =>
              React.createElement('option', { key: c.ref, value: c.ref }, c.ref)
            )
          ),
          React.createElement('input', {
            type: 'password',
            autoComplete: 'new-password',
            value: secret,
            placeholder: '新密钥（不会显示已有值）',
            onChange: (e) => setSecret(e.target.value)
          }),
          React.createElement(
            'button',
            { onClick: () => save(false), disabled: !secret },
            '保存到 Credentials'
          ),
          React.createElement(
            'button',
            {
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
    [message, setMessage] = React.useState(''),
    [cred, setCred] = React.useState([]),
    [preview, setPreview] = React.useState(null),
    [backup, setBackup] = React.useState(''),
    [test, setTest] = React.useState(''),
    [devices, setDevices] = React.useState([]),
    [resolutions, setResolutions] = React.useState({}),
    [backups, setBackups] = React.useState([]),
    [saving, setSaving] = React.useState(false)
  const reload = async () => {
    const result = await getJson('/dsh-chatty/settings')
    setOwners(result.owners)
    setDrafts(
      Object.fromEntries(result.owners.map((o) => [o.owner, o.effective]))
    )
    setChanges({})
    await refreshChattySettings()
    const c = await getJson('/dsh-chatty/credentials/state')
    setCred(c.credentials)
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
  const save = async () => {
    if (saving) return
    setSaving(true)
    const results = []
    for (const owner of owners) {
      const ops = Object.values(changes[owner.owner] || {})
      if (!ops.length) continue
      if (
        (sttClient.active ||
          ['PLAYING', 'PREPARING'].includes(chatty.ttsPhase)) &&
        !['chatty', 'speech'].includes(owner.owner)
      ) {
        results.push('请先停止听写后重载本地参数')
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
          x.map((o) => result.owners.find((n) => n.owner === o.owner) || o)
        )
        setDrafts((x) => ({ ...x, [owner.owner]: fresh.effective }))
        results.push(owner.owner + ' 已保存（' + owner.applies + '）')
        setChanges((x) => ({ ...x, [owner.owner]: {} }))
      } catch (e) {
        results.push(owner.owner + ' 失败：' + e.message)
      }
    }
    setSaving(false)
    setMessage(results.join('；'))
    window.dispatchEvent(new Event('dsh-chatty:settings-saved'))
  }
  function control(o, f) {
    const value = formValue(drafts[o.owner], f.path)
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
          'button',
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
                : String(v)
          )
        )
      )
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
  const local = chatty.settings?.catalog?.providers.find(
    (p) => p.location === 'host-local'
  )
  return React.createElement(
    'div',
    { className: 'dch-card-body' },
    React.createElement(
      'div',
      { className: 'dch-muted' },
      'Chatty ' +
        (chatty.settings?.compatibility?.actual.chattyVersion || '') +
        ' · 目标 Bundle ' +
        (chatty.settings?.compatibility?.target.bundleVersion || '') +
        ' · 实际 ' +
        (chatty.settings?.compatibility?.actual.speechPackages?.[
          '@deepseek-ai/dsh-experimental-voice-input-bundle'
        ] || '缺失') +
        ' · ' +
        (chatty.settings?.compatibility?.actual.source?.label || '来源未解析') +
        ' · ' +
        (chatty.settings?.compatibility?.matched
          ? '版本匹配'
          : chatty.settings?.compatibility?.reasons.join('；'))
    ),
    React.createElement(
      'div',
      { className: 'dch-muted' },
      cred
        .map((c) => c.ref + ': ' + (c.configured ? '已配置' : '未配置'))
        .join('；')
    ),
    React.createElement(CredentialEditor, {
      credentials: cred,
      onSaved: reload
    }),
    React.createElement(
      'div',
      { className: 'dch-tabs' },
      CHATTY_TABS.map((name) =>
        React.createElement(
          'button',
          {
            key: name,
            className: 'dch-tab',
            'data-active': tab === name ? '1' : '0',
            onClick: () => setTab(name)
          },
          name
        )
      )
    ),
    tab === '语音输入'
      ? React.createElement(
          'div',
          null,
          React.createElement('button', { onClick: micTest }, '麦克风测试'),
          local
            ? React.createElement(
                'div',
                null,
                '本地模型：' + local.preparation.phase,
                React.createElement(
                  'button',
                  {
                    onClick: () =>
                      postJson('/dsh-chatty/speech/prepare', {
                        providerId: local.id
                      })
                        .then(reload)
                        .catch((e) => setMessage(e.message))
                  },
                  '准备模型'
                ),
                React.createElement(
                  'button',
                  {
                    onClick: () =>
                      postJson('/dsh-chatty/speech/prepare', {
                        providerId: local.id,
                        cancel: true
                      })
                        .then(reload)
                        .catch((e) => setMessage(e.message))
                  },
                  '取消准备'
                )
              )
            : null
        )
      : null,
    tab === '语音输出'
      ? React.createElement(
          'button',
          {
            onClick: () => {
              stopSpeaking(true)
              enqueueSpeechSegment({ text: '这是语音朗读测试。' })
            }
          },
          '试听'
        )
      : null,
    owners.map((o) =>
      React.createElement(
        'div',
        { key: o.owner },
        o.unavailableReason
          ? React.createElement(
              'div',
              { className: 'dch-muted' },
              o.owner + '：' + o.unavailableReason
            )
          : null,
        o.fields
          .filter((f) => fieldTab(o.owner, f.path) === tab)
          .map((f) =>
            React.createElement(
              ChattyField,
              {
                key: o.owner + f.path,
                label: fieldLabel(f),
                hint:
                  o.applies +
                  (f.path === 'tts.sample_rate'
                    ? '；硅基流动按格式支持范围转换，播放使用实际响应值'
                    : '') +
                  (f.path === 'stt.providers.volcano.model'
                    ? '；默认产品 ID 映射 bigmodel，其它协议值需上游支持'
                    : '')
              },
              control(o, f),
              React.createElement(
                'button',
                { onClick: () => reset(o.owner, f) },
                '默认'
              )
            )
          )
      )
    ),
    tab === '高级'
      ? React.createElement(
          'div',
          null,
          React.createElement(
            'button',
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
                  'button',
                  {
                    onClick: async () => {
                      if (preview.conflicts.some((c) => !resolutions[c.id])) {
                        setMessage('请逐项选择冲突处理方式')
                        return
                      }
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
            'button',
            {
              onClick: () =>
                postJson('/dsh-chatty/migration', {
                  action: 'restore',
                  backupId: backup
                })
                  .then(reload)
                  .catch((e) => setMessage(e.message))
            },
            '恢复备份'
          )
        )
      : null,
    React.createElement(
      'div',
      { className: 'dch-actions' },
      React.createElement(
        'button',
        { onClick: save, disabled: saving },
        saving ? '保存中…' : '保存'
      ),
      React.createElement(
        'button',
        { onClick: () => reload().catch((e) => setMessage(e.message)) },
        '重新加载'
      )
    ),
    React.createElement(
      'div',
      { role: 'status', className: 'dch-muted' },
      message
    ),
    test ? React.createElement('div', { className: 'dch-partial' }, test) : null
  )
}
function ChattyPluginCard(props) {
  const [open, setOpen] = React.useState(props?.view === 'page')
  if (props?.view === 'summary')
    return React.createElement(
      'span',
      { className: 'dch-card-desc' },
      '持续听写、语音口令与朗读'
    )
  return React.createElement(
    'div',
    { className: 'dch-card', 'data-open': open ? '1' : '0' },
    React.createElement(
      'button',
      {
        className: 'dch-card-head',
        onClick: () => setOpen(!open),
        'aria-expanded': open
      },
      React.createElement('span', null, '语音输入与朗读'),
      React.createElement('span', { className: 'dch-chev' }, '⌄')
    ),
    open ? React.createElement(ChattySection, props) : null
  )
}
function registerSettings(ctx) {
  ctx.slots.inject('plugins.bundle.config', () =>
    ctx.slots.register(
      {
        name: 'plugins.bundle.config',
        key: PKG,
        locale: NS,
        label: '语音输入与朗读',
        inject: () => ({ ctx })
      },
      ChattyPluginCard
    )
  )
}
