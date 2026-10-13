import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import z from '@deepseek-ai/schemastery'
import { createConfig } from '../lib/config.js'
import { fieldsOf } from '../lib/native-settings.js'
import { presentOwner } from '../lib/settings-presentation.js'
import { createCredentialFile } from '../lib/credential-file.js'
import { createModelCatalog, parseSiliconModels, parseVolcanoModels } from '../lib/model-catalog.js'
import { createTtsProvider } from '../lib/tts/providers.js'
const volc=ops=>({Result:{DocumentCode:'agent-plan-personal-voice-model',Content:JSON.stringify({data:{'0':{ops:ops.map(insert=>({insert}))}}})}})
const field=(name,id)=>`<span class="font-medium font-mono text-fd-primary">${name}</span><span class="font-mono font-medium">required</span><span>Value in</span><code>&quot;${id}&quot;</code></div>`
test('全部 100 项配置有中文帮助与默认、生效说明，官方归属分开',()=>{
  const fields=fieldsOf(createConfig(z).toJSON());assert.equal(fields.length,74)
  const p=presentOwner({owner:'chatty',fields,applies:'下次任务'})
  const text=fs.readFileSync(new URL('../docs/CONFIG-UI.md',import.meta.url),'utf8')
  let total=74
  for(const owner of ['speech','api','sensevoice']){const paths=[...text.matchAll(new RegExp('\\| '+owner+' \\| `([^`]+)`','g'))].map(x=>x[1]);total+=paths.length;for(const f of presentOwner({owner,fields:paths.map(path=>({path})),applies:'重载所有者'}).fields)assert.match(f.presentation.section,/识别|API|本地/)}
  assert.equal(total,100)
  for(const f of p.fields){assert.match(f.presentation.label,/[\u4e00-\u9fff]/);assert.match(f.presentation.help,/默认：/);assert.match(f.presentation.help,/生效：/)}
  assert.match(p.fields.find(f=>f.path==='stt.vad.silence_timeout_ms').presentation.help,/停顿不会发送/)
  assert.equal(p.fields.find(f=>f.path==='stt.vad.silence_timeout_ms').presentation.advanced,false)
  assert.equal(p.fields.find(f=>f.path==='polish.model_id').presentation.tab,'指令与草稿')
})
test('火山只解析支持型号段，排除代码和音色；新型号标记未实测',()=>{
  const payload=volc(['支持的模型：\n豆包语音合成（doubao-seed-tts-2.0）\n豆包语音识别（doubao-seed-asr-2.0）\n豆包语音识别（doubao-seed-asr-3.0）\n接口信息：\n代码 doubao-seed-asr-99.0'])
  assert.deepEqual(parseVolcanoModels(payload,'stt').map(m=>[m.id,m.status]),[['doubao-seed-asr-2.0','compatible'],['doubao-seed-asr-3.0','unverified']])
  assert.equal(parseVolcanoModels(payload,'tts').length,1)
  assert.throws(()=>parseVolcanoModels(volc(['示例：doubao-seed-asr-2.0']),'stt'),/段落/)
  assert.throws(()=>parseVolcanoModels({Result:{Content:'{}'}},'stt'),/结构/)
})
test('硅基字段解析不会把音色、示例或 required 的 span 当成模型',()=>{
  const html=field('model','FunAudioLLM/CosyVoice2-0.5B')+field('voice','FunAudioLLM/CosyVoice2-0.5B:alex')+field('input','fake/Example')+'<script>fake/Model</script>'+field('model','fnlp/MOSS-TTSD-v0.5')
  assert.deepEqual(parseSiliconModels(html,'tts').map(m=>m.id),['FunAudioLLM/CosyVoice2-0.5B','fnlp/MOSS-TTSD-v0.5'])
  assert.throws(()=>parseSiliconModels(field('voice','abc:alex'),'tts'),/不可识别/)
})
test('凭据打开只接受实际目标，缺文件不创建，拒绝客户端路径',async()=>{
  const opened=[]
  const service=createCredentialFile({locate:()=>'/private/custom.yaml',statFile:async()=>({isFile:()=>true}),open:async p=>opened.push(p)})
  assert.equal((await service.state()).available,true)
  await assert.rejects(service.openFile({path:'/other'}),/不接受/)
  await service.openFile({});assert.deepEqual(opened,['/private/custom.yaml'])
  const absent=createCredentialFile({locate:()=>'/absent',statFile:async()=>{throw Error()},open:()=>assert.fail()})
  assert.equal((await absent.state()).available,false)
  assert.equal((await createCredentialFile({locate:()=>null}).state()).available,false)
  const c=new AbortController();c.abort();await assert.rejects(service.openFile({},c.signal));assert.equal(opened.length,1)
})
async function fixture(fn){const home=await mkdtemp(path.join(os.tmpdir(),'chatty-catalog-test-'));try{await fn(home)}finally{await rm(home,{recursive:true,force:true})}}
const cfg={stt:{providers:{siliconflow:{base_url:'https://api.example/v1',credential:'TEST_REF'}}},tts:{providers:{siliconflow:{base_url:'https://api.example/v1',credential:'TEST_REF'}}},polish:{}}
test('不刷新不联网；成功缓存，网页改版和空目录保留上次结果与时间',async()=>fixture(async home=>{
  let mode='good',calls=0
  const service=createModelCatalog({home,getConfig:()=>cfg,resolveKey:async()=> 'private-key',fetchImpl:async url=>{calls++;return new Response(url.includes('models?')?JSON.stringify({data:[{id:'FunAudioLLM/CosyVoice2-0.5B'}]}):mode==='good'?field('model','FunAudioLLM/CosyVoice2-0.5B'):'changed', {status:200})}})
  assert.equal((await service.catalog({purpose:'tts',provider:'siliconflow'})).models[0].id,'FunAudioLLM/CosyVoice2-0.5B');assert.equal(calls,0)
  const first=await service.catalog({purpose:'tts',provider:'siliconflow',refresh:true});assert.ok(first.updatedAt)
  mode='bad';const second=await service.catalog({purpose:'tts',provider:'siliconflow',refresh:true});assert.deepEqual(second.models,first.models);assert.equal(second.updatedAt,first.updatedAt);assert.match(second.warning,/保留/)
  const files=await readdir(path.join(home,'chatty/model-catalog'));assert.equal(files.length,1);const saved=await readFile(path.join(home,'chatty/model-catalog',files[0]),'utf8');assert.ok(!saved.includes('private-key'));assert.ok(!saved.includes('<span'))
  const newService=createModelCatalog({home,getConfig:()=>cfg});assert.equal((await newService.catalog({purpose:'tts',provider:'siliconflow'})).updatedAt,first.updatedAt)
  service.dispose();await assert.rejects(service.catalog({purpose:'tts',provider:'siliconflow'}),/卸载/)
}))
test('TTS 与音频全集交叉，不把 ASR 型号当作朗读；账户鉴权失败保留文档结果',async()=>fixture(async home=>{
  let fail=false
  const service=createModelCatalog({home,getConfig:()=>cfg,resolveKey:async()=> 'key',fetchImpl:async url=>new Response(url.includes('models?')?JSON.stringify({data:[{id:'FunAudioLLM/CosyVoice2-0.5B'},{id:'FunAudioLLM/SenseVoiceSmall'}]}):field('model','FunAudioLLM/CosyVoice2-0.5B'),{status:fail&&url.includes('models?')?401:200})})
  let result=await service.catalog({purpose:'tts',provider:'siliconflow',refresh:true});assert.equal(result.models.length,1)
  fail=true;result=await service.catalog({purpose:'tts',provider:'siliconflow',refresh:true});assert.equal(result.models.length,1);assert.match(result.warning,/HTTP 401/)
}))
test('自定义 LLM 目录与宿主公开发现均只读，不跑推理且不返回密钥',async()=>fixture(async home=>{
  const requests=[];const llm={listProviders:()=>[{id:'p',name:'供应商'}],listModels:async()=>[{id:'saved'}],listConfigurableProviders:()=>[{provider:'p',settingsNs:'ns'}],discoverModels:async(ns,p)=>{requests.push([ns,p]);return [{id:'new'}]}}
  const service=createModelCatalog({home,getConfig:()=>cfg,llm,resolveKey:async()=> 'secret',fetchImpl:async(url,opt)=>{assert.equal(opt.headers.authorization,'Bearer secret');return new Response(JSON.stringify({data:[{id:'private/model'}]}))}})
  assert.equal((await service.catalog({purpose:'llm',provider:'p'})).models.length,0);assert.equal(requests.length,0)
  assert.equal((await service.catalog({purpose:'llm',provider:'p',refresh:true})).models[0].id,'new');assert.equal(requests.length,1)
  const result=await service.catalog({purpose:'llm',provider:'',refresh:true,draft:{base_url:'http://localhost:1234/v1',key_env:'REF'}});assert.equal(result.models[0].id,'private/model');assert.ok(!JSON.stringify(result).includes('secret'))
  await assert.rejects(service.catalog({purpose:'llm',provider:'p',draft:{url:'https://untrusted'}}),/不支持/)
}))
test('刷新取消和卸载终止网络，不落盘',async()=>fixture(async home=>{
  let notify;const ready=new Promise(r=>notify=r)
  const service=createModelCatalog({home,getConfig:()=>cfg,fetchImpl:async(url,{signal})=>{notify();return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true}))}})
  const pending=service.catalog({purpose:'tts',provider:'siliconflow',refresh:true});await ready;service.dispose();await assert.rejects(pending,/取消/)
  await assert.rejects(readdir(path.join(home,'chatty/model-catalog')))
}))
test('跟随会话模型读取默认供应商，未点击刷新不触发模型适配器',async()=>fixture(async home=>{
  let discovered=0
  const llm={listProviders:()=>[{id:'current'}],listModels:()=>assert.fail('未刷新不得调用模型适配器'),listConfigurableProviders:()=>[{provider:'current',settingsNs:'current-settings'}],discoverModels:async(ns,p)=>{assert.equal(ns,'current-settings');assert.equal(p.provider,'current');discovered++;return [{id:'current-model'}]}}
  const service=createModelCatalog({home,getConfig:()=>cfg,llm,getDefaultModel:session=>{assert.equal(session,'test-session');return {provider:'current'}}})
  const req={purpose:'llm',sessionId:'test-session'}
  assert.equal((await service.catalog(req)).models.length,0);assert.equal(discovered,0)
  assert.equal((await service.catalog({...req,refresh:true})).models[0].id,'current-model');assert.equal(discovered,1)
  await assert.rejects(service.catalog({...req,draft:{base_url:'https://example.test/v1?api_key=secret'}}),/查询参数/)
}))
test('刷新音色合并系统与自定义目录，不删除系统选项',async()=>fixture(async home=>{
  const service=createModelCatalog({home,getConfig:()=>cfg,resolveKey:async()=> 'key',listVoices:async()=>[{id:'speech:custom',label:'自定义音色'}],fetchImpl:async url=>new Response(url.includes('models?')?JSON.stringify({data:[{id:'FunAudioLLM/CosyVoice2-0.5B'}]}):field('model','FunAudioLLM/CosyVoice2-0.5B'))})
  const result=await service.catalog({purpose:'tts',provider:'siliconflow',refresh:true})
  assert.ok(result.voices.some(v=>v.id==='speech:custom'));assert.ok(result.voices.some(v=>v.id==='FunAudioLLM/CosyVoice2-0.5B:alex'))
}))
test('目录音色刷新失败保留自定义缓存，严格列表失败不得伪装成成功',async()=>fixture(async home=>{
  const adapter=createTtsProvider('siliconflow',{resolveKey:async()=> 'key',fetchImpl:async()=>new Response('{}',{status:401})})
  await assert.rejects(adapter.listVoices({strict:true}),/401/)
  let fail=false
  const service=createModelCatalog({home,getConfig:()=>cfg,resolveKey:async()=> 'key',listVoices:async()=>{if(fail)throw Error('HTTP 401');return [{id:'speech:cached',label:'缓存音色'}]},fetchImpl:async url=>new Response(url.includes('models?')?JSON.stringify({data:[{id:'FunAudioLLM/CosyVoice2-0.5B'}]}):field('model','FunAudioLLM/CosyVoice2-0.5B'))})
  await service.catalog({purpose:'tts',provider:'siliconflow',refresh:true});fail=true
  const retained=await service.catalog({purpose:'tts',provider:'siliconflow',refresh:true})
  assert.ok(retained.voices.some(v=>v.id==='speech:cached'));assert.match(retained.warning,/保留上次音色/)
}))
