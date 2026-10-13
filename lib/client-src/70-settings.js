function ChattyField(props) {
  const label=props.label,help=props.help||props.hint
  return React.createElement('div',{className:'dch-field'},
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
    [group,setGroup]=React.useState('chatty'),
    [fileState,setFileState]=React.useState(null),
    [message, setMessage] = React.useState(''),
    [cred, setCred] = React.useState([]),
    [preview, setPreview] = React.useState(null),
    [backup, setBackup] = React.useState(''),
    [test, setTest] = React.useState(''),
    [devices, setDevices] = React.useState([]),
    [resolutions, setResolutions] = React.useState({}),
    [backups, setBackups] = React.useState([]),
    [saving, setSaving] = React.useState(false)
  const refreshCredentials = async () => {
    const [c,f]=await Promise.all([getJson('/dsh-chatty/credentials/state'),getJson('/dsh-chatty/credentials/file')])
    setCred(c.credentials);setFileState(f.file)
  }
  const selectedOwners = owners.filter(o=>group==='chatty'?o.owner==='chatty':o.owner!=='chatty')
  const dirtyCount=selectedOwners.reduce((n,o)=>n+Object.keys(changes[o.owner]||{}).length,0)
  async function discard(){
    if(dirtyCount&&!window.confirm('放弃当前分区未保存的修改？其它分区将保留。'))return
    const r=await getJson('/dsh-chatty/settings');const ids=new Set(selectedOwners.map(o=>o.owner))
    setOwners(x=>x.map(o=>ids.has(o.owner)?r.owners.find(n=>n.owner===o.owner)||o:o))
    setDrafts(x=>({...x,...Object.fromEntries(r.owners.filter(o=>ids.has(o.owner)).map(o=>[o.owner,o.effective]))}))
    setChanges(x=>({...x,...Object.fromEntries([...ids].map(id=>[id,{}]))}));setMessage('当前分区已重新加载')
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
    for (const owner of selectedOwners) {
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
        results.push(({chatty:'Chatty 增强',speech:'识别偏好',api:'API 音频限制',sensevoice:'本地模型'}[owner.owner]||'设置') + ' 已保存（' + owner.applies + '）')
        setChanges((x) => ({ ...x, [owner.owner]: {} }))
      } catch (e) {
        results.push(({chatty:'Chatty 增强',speech:'识别偏好',api:'API 音频限制',sensevoice:'本地模型'}[owner.owner]||'设置') + ' 保存失败：' + e.message)
      }
    }
    setSaving(false)
    setMessage(results.join('；'))
    window.dispatchEvent(new Event('dsh-chatty:settings-saved'))
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
    React.createElement(ChattyTabs,{label:'配置所有者',value:group,onChange:setGroup,items:[{value:'chatty',label:'Chatty 增强 · 74'},{value:'official',label:'官方语音底座 · 26'}]}),
    group==='chatty'?React.createElement('div',{className:'dch-selection-summary'},'当前识别：'+(chatty.settings?.catalog?.providers.find(p=>p.id===chatty.settings.stt.provider)?.name||chatty.settings?.stt.provider||'不可用')+' · '+(chatty.settings?.stt.language||'自动'),React.createElement(ChattyButton,{onClick:()=>setGroup('official'),size:'sm'},'调整官方设置')):React.createElement('p',{className:'dch-muted'},'这些设置属于官方语音插件，保存时写回各自所有者。普通运行参数保存会重载服务，请先停止语音任务。'),
    group==='chatty' ?
    React.createElement(ChattyTabs,{label:'Chatty 设置类别',value:tab,onChange:setTab,items:CHATTY_TABS.map(name=>({value:name,label:name}))}) : null,
    group==='chatty' && tab === '语音输入'
      ? React.createElement(
          'div',
          null,
          React.createElement(ChattyButton, { onClick: micTest }, '麦克风测试'),
          local
            ? React.createElement(
                'div',
                null,
                React.createElement(ChattyField,{label:'本地识别模型',help:'使用官方 SenseVoiceSmall，本地精度与目录在官方底座中配置。刷新仅读取注册与准备状态，不下载新型号。'},React.createElement(ModelPicker,{purpose:'stt',provider:'sensevoice-local',label:'本地识别模型',value:'SenseVoiceSmall',readOnly:true})),
                '本地状态：' + ({ready:'已就绪',standby:'待加载',unprepared:'待准备',checking:'检查中',downloading:'下载中',loading:'加载中',waking:'唤醒中',cancelling:'取消中',failed:'准备失败',error:'准备失败'}[local.preparation.phase]||'状态待更新'),
                React.createElement(
                  ChattyButton,
                  {
                    onClick: () =>
                      postJson('/dsh-chatty/speech/prepare', {
                        providerId: local.id
                      })
                        .then(()=>refreshChattySettings()).then(()=>setOwners(x=>[...x]))
                        .catch((e) => setMessage(e.message))
                  },
                  '准备模型'
                ),
                React.createElement(
                  ChattyButton,
                  {
                    onClick: () =>
                      postJson('/dsh-chatty/speech/prepare', {
                        providerId: local.id,
                        cancel: true
                      })
                        .then(()=>refreshChattySettings()).then(()=>setOwners(x=>[...x]))
                        .catch((e) => setMessage(e.message))
                  },
                  '取消准备'
                )
              )
            : null
        )
      : null,
    group==='chatty' && tab === '语音输出'
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
    selectedOwners.map(o=>{
      const fields=o.fields.filter(f=>group==='official'||f.presentation?.tab===tab)
      const groups={}
      for(const f of fields){const p=f.path;const name=o.owner!=='chatty'?f.presentation.section:f.presentation.provider?f.presentation.provider+(p.startsWith('stt.')?'识别':'朗读'):p.startsWith('tts.renderer.')?'朗读内容':p.startsWith('polish.')?'润色与摘要模型':p.startsWith('voice_control.')?'语音口令':p.startsWith('draft.')?'语音草稿':p.startsWith('stt.vad.')?'分句参数':p.startsWith('stt.')?'持续听写':p.startsWith('tts.')?'朗读偏好':p.startsWith('ui.')?'界面显示':'采集与运行';(groups[name]||=[]).push(f)}
      function row(f){return React.createElement(ChattyField,{key:o.owner+'/'+f.path,label:fieldLabel(f),help:f.presentation.help},control(o,f),f.presentation.unit?React.createElement('span',{className:'dch-unit'},f.presentation.unit):null,React.createElement(ChattyButton,{className:'dch-reset',size:'sm','aria-label':'重置'+fieldLabel(f),title:'恢复组装默认（保存后生效）',onClick:()=>reset(o.owner,f)},'↺'))}
      return React.createElement('fieldset',{key:o.owner,disabled:saving||o.writable===false,className:'dch-owner-fields'},o.unavailableReason?React.createElement('p',{role:'alert'},o.unavailableReason):null,
        Object.entries(groups).map(([name,items])=>{
          const active=name.startsWith('火山')?(tab==='语音输出'?drafts.chatty?.tts.provider==='volcano':chatty.settings?.stt.provider==='chatty-volcano'):name.startsWith('硅基')?(tab==='语音输出'?drafts.chatty?.tts.provider==='siliconflow':chatty.settings?.stt.provider==='chatty-siliconflow'):true
          const regular=items.filter(f=>!f.presentation.advanced),advanced=items.filter(f=>f.presentation.advanced)
          const body=React.createElement('div',null,
            name==='火山朗读'?React.createElement(ChattyField,{label:'火山合成模型',help:'由服务资源标识决定。默认资源 seed-tts-2.0 对应豆包语音合成 2.0；刷新可查看官方型号，新协议不自动适配。'},React.createElement(ModelPicker,{purpose:'tts',provider:'volcano',label:'火山合成模型',value:'doubao-'+(drafts.chatty.tts.providers.volcano.resource_id||'seed-tts-2.0'),onChange:id=>id==='doubao-seed-tts-2.0'?change('chatty',{path:'tts.providers.volcano.resource_id'},'seed-tts-2.0'):setMessage('该型号未适配；请检查高级资源标识，不会自动替换')})):null,
            regular.map(row),advanced.length?React.createElement('details',{className:'dch-advanced'},React.createElement('summary',null,'高级参数 · '+advanced.length),advanced.map(row)):null)
          return active?React.createElement('section',{className:'dch-setting-section',key:name},React.createElement('h3',null,name),body):React.createElement('details',{className:'dch-setting-section',key:name},React.createElement('summary',null,name+'（未使用）'),body)
        }))
    }),
    React.createElement('details',{className:'dch-diagnostics'},React.createElement('summary',null,'版本与加载诊断'),React.createElement('pre',null,JSON.stringify(chatty.settings?.compatibility,null,2))),
    group==='chatty' && tab === '高级'
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
    React.createElement(
      'div',
      { className: 'dch-actions dch-settings-footer' },
      React.createElement('span',null,dirtyCount?'有 '+dirtyCount+' 项未保存':'当前分区无待保存修改'),
      React.createElement(
        ChattyButton,
        { onClick: save, disabled: saving || !dirtyCount, variant:'primary' },
        saving ? '保存中…' : group==='chatty'?'保存 Chatty 设置':'保存官方设置'
      ),
      React.createElement(
        ChattyButton,
        { disabled:saving, onClick: () => discard().catch((e) => setMessage(e.message)) },
        dirtyCount?'放弃修改':'重新加载当前分区'
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
      ChattyButton,
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
