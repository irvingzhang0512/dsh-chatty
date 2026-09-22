// dsh-chatty — 浏览器半边（client half）。
//
// 三个挂载点：
//   conversation.input.right — Voice Bar：长语音开关 / 暂停 / 发送 / 朗读 / 停止；
//   conversation.input.dock  — Voice Draft 面板：草稿文本、Partial Result、撤销/清空/润色/发送；
//   plugins.item 等          — 设置卡：Provider / 凭据 / VAD / 指令 / TTS 渲染策略。
//
// 浏览器半边负责麦克风、本地 VAD、可视化、音频播放与 composer 写入；
// 语音指令判定、Voice Draft 状态、润色与 Provider 调用都在宿主侧完成。

window.__ModuleLoader__.load({
  id: '@irvingzhang0512/dsh-chatty',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    const React = require('react')

    let PRIM = null
    try { PRIM = require('@deepseek-ai/dsh-client-ui-primitives') } catch (noPrim) { /* 老版本 DSH 没有原语包 */ }

    const NS = 'dsh-chatty'
    const PKG = '@irvingzhang0512/dsh-chatty'
    const ROW_ID = 'dsh-chatty'
    const ROW_CONFIG_KEY = PKG + '#' + ROW_ID
