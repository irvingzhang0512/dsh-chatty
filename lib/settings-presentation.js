const INFO = {
  model:['模型','识别或合成所用的模型型号。刷新只更新可选目录，不替换当前选择。'],
  model_id:['润色／摘要模型','留空跟随当前会话模型；指定时选择与供应商相匹配的文本模型。'],
  credential:['凭据名称','这是 DSH 凭据的引用名称，不是密钥；密钥由宿主读取。'],
  key_env:['文本模型凭据名称','自定义兼容端点所需的凭据引用；不在配置中保存明文密钥。'],
  voice:['音色','朗读使用的声音。型号变更后请检查音色是否属于该模型；不会自动修改已保存音色。'],
  provider:['供应商','选择处理该功能的供应商。润色供应商留空时跟随当前会话。'],
  defaultProvider:['识别服务','官方当前使用的识别服务；更换后下一句使用新服务，在途句保持原快照。'],
  language:['识别语言','自动检测适合混合语言；选定语言可帮助对应服务识别，支持范围依服务而定。'],
  base_url:['服务端点','高级参数：服务 API 根地址；通常保持默认。文本端点留空则使用 DSH 注册模型。'],
  batch_url:['完整句端点','整句结束后返回识别结果的服务地址；一般无需修改。'],
  stream_url:['实时识别端点','火山双向流式地址，临时结果只用于预览，正式结果才进入草稿。'],
  resource_id:['服务资源标识','供应商协议中的资源 ID，与型号及套餐对应；通常保持默认。'],
  max_segment_seconds:['最长句时长','达到上限后自动分句。调短能更快处理长语音，调长更容易保留完整长句。'],
  max_pending:['识别积压上限','同时等待处理的句数。过高会增加内存与延迟；达到上限会暂停接收新句。'],
  stream_idle_timeout_ms:['流式等待超时','流式停止后等待正式结果的最长时间。超时会报错，不把临时结果当作正式结果。'],
  streaming:['优先真实流式','仅火山支持实时临时结果；本地与硅基流动仍按句识别。'],
  auto_start:['进入会话后自动监听','开启后进入实际新会话自动申请麦克风并监听；默认关闭。停止和取消仍可手动操作。'],
  partial_preview:['显示临时预览','显示尚未确认的识别文字；预览不会发送、插入或执行口令。'],
  sensitivity:['分句灵敏度','控制浏览器判断人声的灵敏程度。调高更容易检出轻声，也可能更容易受背景声影响。'],
  silence_timeout_ms:['句尾静音','连续安静多久后结束当前一句。调短更快出字但可能切断句子；调长适合停顿较多的说话方式。停顿不会发送消息。'],
  min_speech_ms:['最短人声','短于该时间的人声片段会被丢弃。调高能过滤短噪声，也可能遗漏很短的词。'],
  pre_roll_ms:['句首缓冲','检出人声前保留少量音频，减少开头音节丢失。调高会保留更多背景声。'],
  speed:['语速','1 为正常语速；数值更大更快。供应商实际支持范围可能不同。'],
  format:['音频格式','PCM 适合浏览器连续播放；MP3 更小；WAV 保留音频头。格式影响可用采样率。'],
  sample_rate:['采样率','音频每秒的采样次数。硅基按格式支持范围转换，播放器使用实际生效的采样率。'],
  volume:['播放音量','0 为静音，1 为原始音量；只控制本插件播放，不修改系统音量。'],
  auto_read:['自动朗读回复','开启后自动朗读助手的新回复；与持续听写独立，不会因此自动开启麦克风。'],
  interrupt_on_speech:['人声打断朗读','已经在听写时，检测到人声先停止朗读。单独朗读不会自动开麦检测。'],
  code_hint:['代码跳过提示','代码块被跳过时朗读简短提示，避免听者误以为整段回复没有内容。'],
  llm_summary:['使用模型摘要','开启后用文本模型整理表格／长列表，再朗读；关闭时使用规则摘要。会产生文本模型请求。'],
  summary_prompt:['朗读摘要提示词','控制模型怎样整理口头摘要，留空使用内置提示词；不影响回复正文。'],
  max_chars:['单次朗读文字上限','长内容拆为多段合成。调短有利于更快开始播放，调长可减少请求次数。'],
  command_mode:['口令匹配方式','整句匹配最稳妥；文字前缀要求先说指定前缀；关闭则不把语音当口令。不是声学唤醒。'],
  wake_prefix:['文字口令前缀','前缀模式必须先说该词，再说完整口令；留空不能作为有效前缀。'],
  wake_words:['前缀别名','可替代文字前缀的说法，每行一条；不启动独立唤醒监听。'],
  commands:['七类口令词表','每个动作每行一种说法。只匹配正式结果，归一化后跨动作重复词会阻止保存。'],
  max_utterances:['语音区间追踪上限','最多追踪多少句自己的插入区间；超过窗口后旧内容保留，但不再作为可靠自动编辑范围。'],
  separator:['句间分隔符','连续句之间插入的分隔文字。换行适合逐句查看；只影响随后插入的句子。'],
  polish_on_command:['允许润色口令','正式润色口令可触发润色；仍需开启润色功能，不会自动发送结果。'],
  prompt:['润色提示词','说明怎样整理语音文字，留空使用内置提示词；失败保留原文。'],
  show_voice_bar:['显示听写／朗读按钮','控制输入框旁两个语音操作按钮的显示，不改变语音服务配置。'],
  show_draft_panel:['显示语音操作区','显示预览、冲突结果及撤销／润色等操作；原生输入框仍是正文。'],
  visualizer:['音量显示','收音时显示音量柱，或关闭显示；不是完整音频波形。'],
  panel_width:['操作区宽度','语音操作区的目标宽度；实际宽度受当前窗口限制。'],
  timeout_ms:['请求超时','插件请求的最长等待时间。调短更快报告异常，过短会中断较慢的服务。'],
  mic_device_id:['麦克风','留空使用系统默认设备。更改后下次开麦生效；设备不可用时提示并尝试系统默认。'],
  noise_suppression:['浏览器降噪','请求浏览器降低背景噪声；效果依设备和浏览器，过强处理可能影响声音细节。'],
  echo_cancellation:['浏览器回声消除','请求浏览器降低扬声器回声；不等于完整 AEC，耳机通常更可靠。'],
  auto_gain_control:['自动增益','请求浏览器自动调整输入强度；声音忽大忽小时可试着关闭。'],
  providerId:['本地服务标识','官方本地服务的唯一名称。更名会备份并同步当前选择；存在外部引用时拒绝更名。'],
  dataRoot:['本地缓存目录','识别模型与工作文件的缓存目录；变更需要重载本地服务。'],
  modelDirectory:['外部模型目录','可选的现成 SenseVoice 模型目录；留空使用官方缓存／下载管理。'],
  vadModelPath:['外部人声检测模型','可选的人声检测模型文件；留空使用官方准备的模型。'],
  precision:['本地模型精度','INT8 通常更省内存；更高精度可能占用更多资源。仅使用官方模型管理支持的选项。'],
  modelOrigin:['固定模型来源','可选的固定下载源；留空按来源列表探测，不在刷新型号时自动修改。'],
  modelOrigins:['模型来源列表','官方准备模型时依次检查的来源，每行一个地址；与云端推理端点无关。'],
  modelProbeTimeoutMs:['来源探测超时','探测单个下载来源的最长等待时间，过短可能误判慢网络。'],
  threads:['CPU 线程数','本地推理使用的线程数。增大会占用更多 CPU，不保证线性提速。'],
  segmentSeconds:['本地推理分段','长录音在本地推理时的分段长度，不是浏览器句尾静音设置。'],
  vadThreshold:['本地人声阈值','本地模型判断人声的门槛。调高更严格，可减少噪声但可能遗漏轻声。'],
  minSpeechSeconds:['本地最短人声','本地模型保留人声片段的最短时长，调高会过滤短片段。'],
  minSilenceSeconds:['本地最短静音','本地模型分段需要的最短静音，调长会形成更长的推理片段。'],
  maxAudioBytes:['音频大小上限','官方识别接受的最大音频字节数。达到上限会拒绝该音频，不自动压缩或切换供应商。'],
  maxDurationSeconds:['音频时长上限','官方完整音频识别允许的最长录音时长，与浏览器分句时长共同限制输入。'],
  prepareTimeoutMs:['模型准备超时','下载、校验和加载模型的最长等待时间；慢网络需留足时间。'],
  inferenceTimeoutMs:['本地推理超时','一次本地识别的最长等待时间；过短会中断复杂或长音频。'],
  idleTimeoutMs:['本地空闲释放','闲置多久后释放本地推理资源；下一次使用可能重新加载。'],
  maxPending:['本地排队上限','本地推理最多排队的任务数；不同于浏览器句子积压上限。'],
  graceMs:['退出宽限','关闭本地工作进程时允许正常收尾的等待时间。'],
  maxLogBytes:['诊断日志上限','限制本地工作进程诊断日志大小，避免异常输出占用过多内存。'],
  maxResponseBytes:['工作进程响应上限','限制本地进程一次响应的字节数；不是允许的录音大小。'],
  progressIntervalMs:['准备进度刷新间隔','准备模型时报告进度的间隔；更短会增加刷新频率。']
}
const CONTENT = {paragraph:'普通段落',heading:'标题',list:'列表',table:'表格',code_block:'代码块',inline_code:'行内代码',mermaid:'流程图',ascii_diagram:'字符图',url:'网址',image:'图片',math_block:'公式',tool_log:'工具日志',blockquote:'引用段落'}
export function presentOwner(o) {
  return {...o,fields:o.fields.map(f=>{
    const p=f.path,k=p.split('.').at(-1),type=f.schema?.type
    const info=p.startsWith('tts.renderer.')?[CONTENT[k]+'朗读策略','选择朗读、跳过、摘要、自动判断或简短标签；只改变播放内容，不修改原回复。']:k==='enabled'?[p.startsWith('polish.')?'启用润色':p.startsWith('stt.vad.')?'浏览器自动分句':'启用语音口令',p.startsWith('stt.vad.')?'根据人声和静音结束一句；关闭后仍受最长句限制。':p.startsWith('polish.')?'显式按钮或允许的口令触发文本润色；不是识别结束自动润色。':'允许正式整句口令触发动作；临时结果永不执行。']:INFO[k]
    if(!info)throw Error('缺少字段说明：'+o.owner+'/'+p)
    const provider=p.includes('.volcano.')?'火山':p.includes('.siliconflow.')?'硅基流动':''
    const section=o.owner==='speech'?'识别服务与语言':o.owner==='api'?'API 音频限制':o.owner==='sensevoice'?'本地模型与运行参数':'Chatty 增强'
    const tab=o.owner!=='chatty'?section:p.startsWith('ui.')?'界面':p.startsWith('voice_control.')||p.startsWith('draft.')||p.startsWith('polish.')?'指令与草稿':p.startsWith('tts.')?'语音输出':p.startsWith('stt.')||/mic_device|suppression|cancellation|gain_control/.test(p)?'语音输入':'高级'
    const unit=/(_ms|Ms)$/.test(k)?'毫秒':/(_seconds|Seconds)$/.test(k)?'秒':/Bytes$/.test(k)?'字节':k==='sample_rate'?'Hz':k==='panel_width'?'px':''
    const defaultValue=o.base?.[p]??f.default
    const enumNames={auto:'自动检测',volcano:'火山引擎',siliconflow:'硅基流动',exact:'整句匹配',wake:'文字前缀',off:'关闭',read:'朗读',skip:'跳过',summarize:'摘要',smart:'自动判断',label_only:'简短标签',bars:'音量柱'}
    const def=defaultValue===undefined?'继承组装设置':defaultValue===''?'留空／使用内置设置':k==='commands'?'内置七类口令':typeof defaultValue==='boolean'?(defaultValue?'开启':'关闭'):typeof defaultValue==='string'&&enumNames[defaultValue]?enumNames[defaultValue]:JSON.stringify(defaultValue)
    const findBound=(s,n)=>s?.meta?.[n]??s?.[n]??s?.list?.map(x=>findBound(x,n)).find(x=>x!==undefined)
    const min=findBound(f.schema,'min'),max=findBound(f.schema,'max')
    const applies=/mic_device|suppression|cancellation|gain_control/.test(p)?'下次开麦':p.startsWith('stt.vad.')?'下一句':o.applies
    return {...f,presentation:{label:(provider?provider+' ':'')+info[0],section,tab,provider,unit,
      advanced:p!=='stt.vad.silence_timeout_ms'&&/url|resource_id|timeout|Bytes|max_|sample_rate|providerId|dataRoot|Origin|Directory|Path|threads|segmentSeconds|Threshold|SpeechSeconds|SilenceSeconds|Pending|graceMs|progressInterval/.test(p),
      help:info[1]+'\n默认：'+def+(unit?' '+unit:'')+(min!==undefined||max!==undefined?'\n范围：'+(min??'不限')+' 至 '+(max??'不限'):'')+'\n生效：'+applies+'。',type}}
  })}
}
