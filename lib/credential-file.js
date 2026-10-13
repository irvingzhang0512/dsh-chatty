import { stat } from 'node:fs/promises'
export function createCredentialFile({ locate, open, canOpen = () => true, statFile = stat }) {
  async function state() {
    let filename
    try { filename = await locate() } catch { return {available:false,reason:'无法定位当前凭据文件，请检查本地凭据提供者'} }
    if (!filename) return { available:false,reason:'当前凭据提供者没有可打开的本地文件' }
    try { if (!(await statFile(filename)).isFile()) throw Error() } catch {return {available:false,reason:'凭据文件尚不存在；请先通过凭据管理保存引用'}}
    const available=await canOpen()
    return {available,reason:available?'':'当前环境不支持原生文件打开',filename}
  }
  return {state,async openFile(payload,signal){
    if(Object.keys(payload).length)throw Error('打开凭据文件不接受客户端路径或参数')
    const s=await state();if(!s.available)throw Error(s.reason)
    signal?.throwIfAborted();await open(s.filename,signal);return {opened:true}
  }}
}
