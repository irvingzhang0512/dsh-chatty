// 官方配置保持原注册；只在公开 activity 单槽遮蔽重复麦克风。
const OFFICIAL_VOICE_BUNDLE='@deepseek-ai/dsh-experimental-voice-input-bundle'
function signalChattyStatus() {
  window.dispatchEvent(new Event('dsh-chatty:speech-state'))
}
function registerOfficialVoiceIntegration(ctx) {
  ctx.slots.inject('conversation.input.activity',()=>ctx.effect(()=>{
    let shadow=null,updating=false,disposed=false
    const update=()=>{
      if(updating||disposed)return
      updating=true
      try{
        const entries=ctx.slots.entries('conversation.input.activity').filter(e=>e.registrant!=='dsh-chatty:microphone')
        const official=entries[0]?.locale==='voice-input'
        const hide=official&&chatty.settings?.compatibility?.matched===true
        if(!hide&&shadow){const off=shadow;shadow=null;off()}
        if(hide&&!shadow){
          shadow=ctx.slots.register({name:'conversation.input.activity',priority:-100,registrant:'dsh-chatty:microphone'},()=>null)
          chatty.integrationError=''
        }
      }catch(e){chatty.integrationError='官方录音入口协调失败：'+e.message}
      finally{updating=false}
    }
    const off=ctx.slots.subscribe('conversation.input.activity',update)
    window.addEventListener('dsh-chatty:speech-state',update)
    update()
    return()=>{disposed=true;off();window.removeEventListener('dsh-chatty:speech-state',update);shadow?.();shadow=null}
  },'dsh-chatty: official microphone'))
  // 实验 Remote 由官方客户端挂载。服务迟到／重挂载都由可选注入处理。
  if(typeof ctx.inject!=='function')return
  ctx.effect(()=>{
    const injection=ctx.inject(['remote.speech'],sub=>sub.effect(()=>{
      let disposed=false
      const stream=sub.remote.$stream({name:'Chatty speech state',open:signal=>sub.remote.speech.follow(signal),ended:()=>new Error('官方语音状态流已结束'),carrierFailed:error=>{
        if(disposed)return
        chatty.speechStateError='官方语音状态连接中断：'+error.message
        signalChattyStatus()
      }})
      const work=(async()=>{
        try{
          for await(const item of stream){
            if(disposed)break
            if(chatty.settings){
              chatty.settings={...chatty.settings,catalog:item.value,stt:{...chatty.settings.stt,provider:item.value.selection.providerId,language:item.value.selection.language}}
              chatty.speechStateError=''
              chatty.notify()
              signalChattyStatus()
            }
            item.accept()
          }
        }catch(error){if(!disposed){chatty.speechStateError='官方语音状态连接中断：'+error.message;signalChattyStatus()}}
      })()
      return async()=>{disposed=true;await stream.dispose();await work}
    },'dsh-chatty: speech readiness stream'))
    return()=>injection.dispose()
  },'dsh-chatty: optional speech Remote')
}
