import { createHash, randomUUID } from 'node:crypto'
import { readFile, mkdir, writeFile, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import { STATIC_VOICES } from './tts/providers.js'

export const MODEL_SOURCES = {
  volcano: 'https://www.volcengine.com/api/doc/getDocDetail?LibraryCode=ark&DocumentCode=agent-plan-personal-voice-model',
  siliconStt: 'https://docs.siliconflow.cn/docs/api/audio-transcriptions-post',
  siliconTts: 'https://docs.siliconflow.cn/docs/api/audio-speech-post'
}
const entry = (id, status = 'unverified', label = id) => ({ id, label, status,
  reason: status === 'unverified' ? '官方列出，当前适配尚未实测；不会自动试调' : '' })
const builtins = (purpose, provider) => provider === 'volcano'
  ? [entry(purpose === 'stt' ? 'doubao-seed-asr-2.0' : 'doubao-seed-tts-2.0', 'compatible', purpose === 'stt' ? '豆包语音识别 2.0' : '豆包语音合成 2.0')]
  : provider === 'siliconflow' ? [entry(purpose === 'stt' ? 'FunAudioLLM/SenseVoiceSmall' : 'FunAudioLLM/CosyVoice2-0.5B', 'compatible')]
    : []
function unique(models) {
  const out = new Map()
  for (const m of models) if (typeof m.id === 'string' && m.id.length > 0 && m.id.length <= 300 && !/[\r\n\x00<>]/.test(m.id)) {
    out.set(m.id, { id: m.id, label: String(m.label || m.id).slice(0, 400),
      status: ['compatible','unverified','incompatible'].includes(m.status) ? m.status : 'unverified', reason: String(m.reason || '').slice(0, 500) })
  }
  if (out.size > 2000) throw Error('模型目录过大')
  return [...out.values()]
}
export function parseVolcanoModels(payload, purpose) {
  if (payload?.Result?.DocumentCode !== 'agent-plan-personal-voice-model') throw Error('火山文档结构已变化')
  const document = JSON.parse(payload.Result.Content)
  const ops = document?.data?.['0']?.ops
  if (!Array.isArray(ops)) throw Error('火山文档正文不可识别')
  // 仅接受支持模型段落里的型号；脚本、示例、音色都不能构成候选。
  const text = ops.map(x => typeof x.insert === 'string' ? x.insert : '\n').join('')
  const section = text.match(/支持的模型[：:\s]*([\s\S]*?)(?:接口信息|代码示例)/)?.[1]
  if (!section) throw Error('火山支持模型段落不可识别')
  const kind = purpose === 'stt' ? 'asr' : 'tts'
  const ids = [...section.matchAll(new RegExp('doubao-seed-' + kind + '-[a-zA-Z0-9._-]+', 'g'))].map(x => x[0])
  if (!ids.length) throw Error('官方文档没有对应用途型号')
  return unique(ids.map(id => builtins(purpose, 'volcano').find(m => m.id === id) || entry(id)))
}
export function parseSiliconModels(html, purpose) {
  // 字段头直到下一个字段头为止，只读取 model 的 Value in 枚举。
  const blocks = html.split(/<span[^>]*class="[^"]*text-fd-primary[^\"]*"[^>]*>/)
  const ids = []
  for (const block of blocks) {
    if (!/^model<\/span>/.test(block)) continue
    const enumBlock = block.split(/<span[^>]*>Value in<\/span>/)[1]
    if (!enumBlock) continue
    for (const m of enumBlock.split('</div>')[0].matchAll(/&quot;([^<]+?)&quot;/g)) {
      if (!m[1].includes(':') && !m[1].includes('&') && m[1].includes('/')) ids.push(m[1])
    }
  }
  if (!ids.length) throw Error('硅基语音文档模型字段不可识别')
  return unique(ids.map(id => builtins(purpose, 'siliconflow').find(m => m.id === id) || entry(id)))
}
export function createModelCatalog({ home, getConfig, getSpeech, llm, getDefaultModel, resolveKey, fetchImpl = fetch, listVoices }) {
  const memory = new Map(), active = new Map()
  let closed = false
  async function request(url, signal, credential) {
    const u = new URL(url)
    if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password || u.hash) throw Error('模型端点无效')
    const headers = { accept: 'application/json,text/html' }
    if (credential) { const key = await resolveKey(credential); if (!key) throw Error('模型目录凭据未配置'); headers.authorization = 'Bearer ' + key }
    const response = await fetchImpl(u.href, { headers, signal, redirect: 'error' })
    if (!response.ok) throw Error('目录请求失败（HTTP ' + response.status + '）')
    let size = 0, text = ''
    const decoder = new TextDecoder()
    for await (const b of response.body) { size += b.length; if (size > 2 * 1024 * 1024) throw Error('目录响应过大'); text += decoder.decode(b, { stream: true }); signal.throwIfAborted() }
    return text + decoder.decode()
  }
  async function load(key, file) {
    if (memory.has(key)) return memory.get(key)
    try { const c = JSON.parse(await readFile(file, 'utf8')); if (c.schemaVersion !== 1) return null; c.models = unique(c.models || []); memory.set(key,c); return c } catch { return null }
  }
  async function catalog(p = {}, signal) {
    if (closed) throw Error('目录服务已卸载')
    const purpose = p.purpose
    let provider = String(p.provider || '').replace(/^chatty-/, '')
    if(purpose==='llm'&&!provider)provider=getDefaultModel?.(p.sessionId)?.provider||''
    if (!['stt','tts','llm'].includes(purpose)) throw Error('未知模型用途')
    const cfg = getConfig(), sourceConfig = purpose === 'llm' ? cfg.polish : cfg[purpose]?.providers?.[provider]
    const allowed = ['model', 'model_id', 'base_url', 'credential', 'key_env']
    if (p.draft && Object.keys(p.draft).some(k => !allowed.includes(k))) throw Error('目录草稿字段不支持')
    const target = { ...sourceConfig, ...p.draft }
    if (target.base_url) { const url=new URL(target.base_url); if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw Error('API 根地址不能包含凭据、查询参数或片段') }
    for (const k of allowed) if (target[k] !== undefined && (typeof target[k] !== 'string' || target[k].length > 2000)) throw Error('目录参数无效')
    if (purpose !== 'llm' && !['volcano','siliconflow','sensevoice-local'].includes(provider)) throw Error('未知语音供应商')
    const key = createHash('sha256').update(JSON.stringify([purpose,provider,target.base_url,target.credential,target.key_env])).digest('hex')
    const file = path.join(home,'chatty/model-catalog',key+'.json')
    const old = await load(key,file)
    const providers = purpose === 'llm' ? llm.listProviders().map(p => ({id:p.id,label:p.name || p.id})) : []
    const fallback = old || { schemaVersion:1, models:builtins(purpose,provider), sources:[], updatedAt:null, voices:purpose === 'tts' ? STATIC_VOICES.filter(v=>v.provider===provider):[] }
    if (purpose === 'stt' && provider === 'sensevoice-local') return { ...fallback, models:[entry('SenseVoiceSmall','compatible','SenseVoiceSmall（官方本地模型）')], preparation:getSpeech()?.providers?.find(x=>x.location==='host-local')?.preparation, llmProviders:[] }
    if (!p.refresh) return { ...fallback, llmProviders:providers }
    active.get(key)?.abort()
    const controller = new AbortController(); active.set(key,controller)
    const abort = () => controller.abort(); if (signal?.aborted) abort(); else signal?.addEventListener('abort',abort,{once:true})
    const timer = setTimeout(abort,15000); timer.unref?.()
    const cSignal = controller.signal
    try {
      let models, voices=fallback.voices || [], sources=[], warnings=[]
      if (purpose === 'llm') {
        if (target.base_url) {
          const url = target.base_url.replace(/\/+$/,'') + '/models'
          const body = JSON.parse(await request(url,cSignal,target.key_env)); if (!Array.isArray(body.data)) throw Error('模型 API 响应格式变化')
          models=body.data.map(m=>entry(m.id)); sources=[url]
        } else {
          const owner = llm.listConfigurableProviders().find(x=>x.provider===provider)
          if (!owner) { models=(await llm.listModels(provider)).map(m=>entry(m.id,'compatible',m.name)); warnings.push('供应商未公开远端发现接口，已重新读取 DSH 注册目录') }
          else models=(await llm.discoverModels(owner.settingsNs,{provider},cSignal)).map(m=>entry(m.id,'compatible',m.name))
          sources=['DSH 模型发现服务']
        }
      } else if (provider==='volcano') {
        models=parseVolcanoModels(JSON.parse(await request(MODEL_SOURCES.volcano,cSignal)),purpose); sources=[MODEL_SOURCES.volcano]
      } else {
        const url = purpose==='stt' ? MODEL_SOURCES.siliconStt : MODEL_SOURCES.siliconTts
        models=parseSiliconModels(await request(url,cSignal),purpose); sources=[url]
        try {
          const api=target.base_url.replace(/\/+$/,'')+'/models?'+(purpose==='stt'?'sub_type=speech-to-text':'type=audio')
          const data=JSON.parse(await request(api,cSignal,target.credential));if(!Array.isArray(data.data))throw Error('模型 API 响应格式变化')
          const available=new Set(data.data.map(m=>m.id))
          if(purpose==='stt') models=data.data.map(m=>models.find(x=>x.id===m.id)||entry(m.id))
          else models=models.filter(m=>available.has(m.id))
          sources.push(api)
        } catch(e) { cSignal.throwIfAborted(); warnings.push('已读取官方文档；账户模型目录未更新：'+e.message) }
        if(purpose==='tts' && listVoices) try { const remote=await listVoices(provider,target,cSignal);voices=[...new Map([...STATIC_VOICES.filter(v=>v.provider===provider),...remote].map(v=>[v.id,v])).values()] } catch { cSignal.throwIfAborted();warnings.push('音色列表未更新，保留上次音色') }
      }
      cSignal.throwIfAborted()
      models=unique(models)
      if(!models.length)throw Error('没有可确认用途的模型，保留上次目录')
      const next={schemaVersion:1,models,voices,sources,updatedAt:new Date().toISOString()}
      await mkdir(path.dirname(file),{recursive:true})
      const temp=file+'.'+randomUUID()+'.tmp'
      try { await writeFile(temp,JSON.stringify(next),'utf8'); cSignal.throwIfAborted(); await rename(temp,file) } finally { await rm(temp,{force:true}) }
      memory.set(key,next)
      return {...next,llmProviders:providers,warning:warnings.join('；')}
    } catch(e) {
      if(cSignal.aborted) throw Error('模型刷新已取消或超时')
      return {...fallback,llmProviders:providers,warning:'刷新失败，保留已有目录：'+e.message}
    } finally {clearTimeout(timer);signal?.removeEventListener('abort',abort);if(active.get(key)===controller)active.delete(key)}
  }
  return { catalog, dispose(){closed=true;for(const c of active.values())c.abort();active.clear()} }
}
