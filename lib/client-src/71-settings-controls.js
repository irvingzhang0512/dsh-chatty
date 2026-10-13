function ChattyButton(props) {
  return React.createElement(PRIM?.Button || 'button', {type:'button',variant:'ghost',size:'md',...props,className:(props.className||'')+(props.variant==='primary'?' dch-primary':'')},props.children)
}
function ChattyTabs({items,value,onChange,label}) {
  const id=React.useId()
  if(PRIM?.SegmentedTabs)return React.createElement(PRIM.SegmentedTabs,{className:'dch-segmented',label,value,onChange,items:items.map((item,i)=>({...item,id:id+'-'+i}))})
  return React.createElement('div',{className:'dch-tabs',role:'tablist','aria-label':label},items.map(item=>React.createElement(ChattyButton,{key:item.value,role:'tab','aria-selected':item.value===value,'data-active':item.value===value?'1':'0',className:'dch-tab',onClick:()=>onChange(item.value)},item.label)))
}
function FieldHelp(props) {
  const button=React.createElement(PRIM?.Button || 'button',{type:'button',variant:'ghost',className:'dch-help',size:'sm','aria-label':props.label+'说明'},'ⓘ')
  if(PRIM?.Tooltip) return React.createElement(PRIM.Tooltip,{label:props.help,openOnClick:true,portal:true,side:'top',maxWidth:360},button)
  return React.createElement('details',{className:'dch-help-fallback'},React.createElement('summary',{'aria-label':props.label+'说明'},'ⓘ'),React.createElement('span',{role:'tooltip'},props.help))
}
function SearchChoice({value,options,onChange,placeholder='请选择',label}) {
  const [search,setSearch]=React.useState('')
  const root=React.useRef(null)
  const chosen=options.find(o=>o.id===value)
  const list=options.some(o=>o.id===value)||!value?options:[{id:value,label:value+'（已保存／自定义）'},...options]
  return React.createElement('details',{className:'dch-picker',ref:root},
    React.createElement('summary',{'aria-label':label||placeholder},chosen?.label||value||placeholder,React.createElement('span',null,'⌄')),
    React.createElement('div',{className:'dch-picker-menu'},
      React.createElement('input',{type:'search',placeholder:'搜索名称或型号','aria-label':'搜索'+(label||''),value:search,onChange:e=>setSearch(e.target.value)}),
      React.createElement('div',{className:'dch-picker-options',role:'listbox','aria-label':label},list.filter(o=>(o.label+' '+o.id).toLowerCase().includes(search.toLowerCase())).map(o=>React.createElement(ChattyButton,{
        key:o.id,role:'option','aria-selected':o.id===value,disabled:o.status==='incompatible',title:o.reason||'',onClick:()=>{onChange(o.id);root.current.open=false;setSearch('')}
      },o.label||o.id,o.status==='unverified'?React.createElement('small',null,' · 未实测'):null)),!list.length?React.createElement('span',{className:'dch-muted'},'暂无目录，请刷新或使用高级输入'):null)))
}
function ModelPicker(props) {
  const [catalog,setCatalog]=React.useState(null),[loading,setLoading]=React.useState(false),[notice,setNotice]=React.useState('')
  const current=React.useRef(null),generation=React.useRef(0)
  const identity=JSON.stringify([props.purpose,props.provider,props.draft?.base_url,props.draft?.credential,props.draft?.key_env,chatty.sessionId])
  async function load(refresh) {
    current.current?.abort();const controller=new AbortController();current.current=controller;const n=++generation.current
    setLoading(true);setNotice('')
    try{const r=await postJson('/dsh-chatty/models/catalog',{purpose:props.purpose,provider:props.provider,sessionId:chatty.sessionId,refresh,draft:props.draft},{signal:controller.signal});if(n!==generation.current)return;setCatalog(r.catalog);setNotice(r.catalog.warning||'')}
    catch(e){if(n===generation.current&&!controller.signal.aborted)setNotice(e.message)}
    finally{if(n===generation.current)setLoading(false)}
  }
  React.useEffect(()=>{setCatalog(null);load(false);return()=>{generation.current++;current.current?.abort()}},[identity])
  let options=props.voice?(catalog?.voices||[]).map(v=>({id:v.id,label:v.label||v.name||v.id})):catalog?.models||[]
  if(props.readOnly) options=options.map(o=>({...o,status:'incompatible',reason:'本地模型由官方插件管理，精度在官方底座中选择'}))
  const incompatible=props.voice&&props.model&&props.value&&!props.value.startsWith('speech:')&&props.value.includes(':')&&!props.value.startsWith(props.model+':')
  if(props.voice&&props.model)options=options.filter(v=>v.id.startsWith('speech:')||v.id.startsWith(props.model+':')||!v.id.includes(':'))
  if(props.purpose==='llm'&&!props.voice)options=[{id:'',label:'跟随当前会话模型'},...options]
  return React.createElement('div',{className:'dch-model-control'},
    React.createElement('div',{className:'dch-control-line'},React.createElement(SearchChoice,{label:props.label,value:props.value,options,onChange:props.onChange}),React.createElement(ChattyButton,{onClick:()=>load(true),disabled:loading,'aria-label':'刷新'+props.label},loading?'刷新中…':'刷新')),
    React.createElement('div',{className:'dch-muted',role:'status'},notice||(props.readOnly?'官方固定模型；刷新更新注册与准备状态':catalog?.updatedAt?'更新于 '+new Date(catalog.updatedAt).toLocaleString():props.purpose==='llm'?'缓存目录；点击刷新读取 DSH 模型':'内置目录；点击刷新读取官方来源')),
    catalog?.sources?.length?React.createElement('details',{className:'dch-source'},React.createElement('summary',null,'目录来源'),catalog.sources.map(s=>React.createElement('div',{key:s},s.startsWith('https:')?React.createElement('a',{href:s,target:'_blank',rel:'noreferrer'},s):s))):null,
    incompatible?React.createElement('div',{className:'dch-error',role:'alert'},'已保存音色与当前型号不匹配，请选择对应音色；不会自动修改'):null,
    props.onChange&&!props.readOnly?React.createElement('details',{className:'dch-custom'},React.createElement('summary',null,'高级：自定义'+(props.voice?'音色':'型号')),React.createElement('input',{'aria-label':'自定义'+props.label,value:props.value||'',onChange:e=>props.onChange(e.target.value)}),React.createElement('small',null,'自定义值保留，兼容性需自行确认；不会自动试调。')):null)
}
function LlmProviderChoice(props) {
  const [providers,setProviders]=React.useState([]),[error,setError]=React.useState('')
  React.useEffect(()=>{let alive=true;postJson('/dsh-chatty/models/catalog',{purpose:'llm',provider:'',refresh:false}).then(r=>{if(alive)setProviders(r.catalog.llmProviders)}).catch(e=>{if(alive)setError(e.message)});return()=>{alive=false}},[])
  return React.createElement('div',null,React.createElement(SearchChoice,{label:'文本模型供应商',value:props.value,options:[{id:'',label:'跟随当前会话供应商'},...providers],onChange:props.onChange}),error?React.createElement('span',{role:'status'},error):null)
}
