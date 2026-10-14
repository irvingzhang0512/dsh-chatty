import {test} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
const source=fs.readFileSync(new URL('../lib/client-src/72-official-integration.js',import.meta.url),'utf8')
const tick=()=>new Promise(r=>setImmediate(r))
function harness({remote=false}={}){
 const events=new Map(),listeners=new Set(),effects=[],entries=[]
 let notify=0,streamStop=0,injectionStop=0,receive,wake,closed=false
 const queue=[]
 const stream={async *[Symbol.asyncIterator](){while(!closed){if(!queue.length)await new Promise(r=>wake=r);while(queue.length)yield queue.shift()}},async dispose(){streamStop++;closed=true;wake?.()}}
 const ctx={effect(fn){const off=fn();effects.push(off);return off},slots:{inject(name,fn){fn()},entries(){return entries.slice().sort((a,b)=>(a.options.priority||0)-(b.options.priority||0))},subscribe(name,fn){listeners.add(fn);return()=>listeners.delete(fn)},register(options,component){if(entries.some(e=>(e.options.priority||0)===(options.priority||0)))throw Error('occupied');const e={options,component,registrant:options.registrant,locale:options.locale};entries.push(e);listeners.forEach(f=>f());return()=>{entries.splice(entries.indexOf(e),1);listeners.forEach(f=>f())}}}}
 if(remote)ctx.inject=(deps,fn)=>{const sub={remote:{$stream(options){receive=options;return stream},speech:{follow(){return stream}}},effect(fn){return fn()}};const off=fn(sub);return {async dispose(){injectionStop++;await off()}}}
 const box={ctx,chatty:{settings:{compatibility:{matched:true},stt:{provider:'local',language:'auto',vad:{silence_ms:1200}}},notify(){notify++}},Event:class{constructor(type){this.type=type}},window:{addEventListener(t,fn){if(!events.has(t))events.set(t,new Set());events.get(t).add(fn)},removeEventListener(t,fn){events.get(t)?.delete(fn)},dispatchEvent(e){events.get(e.type)?.forEach(f=>f())}}}
 vm.createContext(box);vm.runInContext(source,box);box.registerOfficialVoiceIntegration(ctx)
 return {box,ctx,entries,listeners,effects,receive:()=>receive,counts:()=>({notify,streamStop,injectionStop}),official(){ctx.slots.register({name:'conversation.input.activity',locale:'voice-input'},()=> 'official')},emit(value){queue.push({value,accept(){}});wake?.()},async dispose(){for(const off of effects.reverse())await off?.()}}
}
test('官方迟到／重载时仅遮蔽录音单槽，失配／卸载恢复原条目',async()=>{
 const h=harness();assert.equal(h.entries.length,0);h.official();assert.equal(h.entries.length,2);const official=h.entries.find(e=>e.locale==='voice-input');assert.equal(h.ctx.slots.entries()[0].component(),null)
 h.box.chatty.settings.compatibility.matched=false;h.box.signalChattyStatus();assert.equal(h.entries.length,1);assert.equal(h.ctx.slots.entries()[0],official)
 h.box.chatty.settings.compatibility.matched=true;h.box.signalChattyStatus();assert.equal(h.entries.length,2)
 await h.dispose();assert.equal(h.entries.length,1);assert.equal(h.entries[0],official);assert.equal(h.listeners.size,0)
})
test('非官方单槽赢家不被遮蔽；优先级碰撞保留原插件并报告',async()=>{
 const h=harness();h.ctx.slots.register({name:'conversation.input.activity',locale:'other'},()=> 'other');assert.equal(h.entries.length,1);await h.dispose()
 const c=harness();c.ctx.slots.register({name:'conversation.input.activity',locale:'voice-input',priority:-100},()=> 'official');assert.equal(c.entries.length,1);assert.match(c.box.chatty.integrationError,/协调失败/);await c.dispose()
})
test('公开状态流更新选择／准备，保留采集参数；卸载取消并丢弃迟到事件',async()=>{
 const h=harness({remote:true});h.official();const settings=h.box.chatty.settings
 const catalog={selection:{providerId:'cloud',language:'zh'},providers:[{id:'cloud',preparation:{phase:'ready'}}]};h.emit(catalog);await tick()
 assert.equal(h.box.chatty.settings.stt.provider,'cloud');assert.equal(h.box.chatty.settings.stt.language,'zh');assert.equal(h.box.chatty.settings.stt.vad,settings.stt.vad);assert.equal(h.box.chatty.settings.catalog,catalog);assert.equal(h.counts().notify,1)
 h.receive().carrierFailed(Error('disconnect'));assert.match(h.box.chatty.speechStateError,/中断/)
 await h.dispose();h.emit({selection:{providerId:'late',language:'en'}});await tick();assert.equal(h.box.chatty.settings.stt.provider,'cloud');assert.deepEqual(h.counts(),{notify:1,streamStop:1,injectionStop:1})
})
