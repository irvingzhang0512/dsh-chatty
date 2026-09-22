// 浏览器半边冒烟测试：在 Node 里用 vm + 极简 React 桩执行生成的 lib/client.js，
// 验证 ModuleLoader 入口、id、inject 面、slot 注册与两个主要组件的首次渲染不抛错。
//
// 这不是浏览器测试，不能替代真机验证；它的价值是：任何拼错的标识符、
// 漏定义的函数、或与 DSH 客户端 API 不匹配的注册形状都会在这里直接暴露。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createContext, runInContext } from 'node:vm'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const bundlePath = path.join(root, 'lib', 'client.js')

function reactStub() {
  const noop = () => {}
  return {
    createElement: (type, props, ...children) => ({ type, props, children }),
    useReducer: (reducer, initial) => [typeof initial === 'function' ? initial() : initial, noop],
    useEffect: noop,
    useLayoutEffect: noop,
    useRef: (value) => ({ current: value === undefined ? null : value }),
    useState: (value) => [typeof value === 'function' ? value() : value, noop],
    useMemo: (factory) => factory(),
    useCallback: (fn) => fn,
  }
}

async function loadClientBundle() {
  const source = await readFile(bundlePath, 'utf8')
  let captured = null
  const listeners = new Map()
  const window = {
    __ModuleLoader__: { load: (entry) => { captured = entry } },
    addEventListener: (event, handler) => listeners.set(event, handler),
    removeEventListener: (event) => listeners.delete(event),
    dispatchEvent: () => true,
  }
  const sandbox = {
    window,
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    URL,
    fetch: async () => { throw new Error('client bundle should not call fetch during smoke test') },
    btoa: (value) => Buffer.from(String(value), 'binary').toString('base64'),
    navigator: { mediaDevices: { getUserMedia: async () => { throw new Error('no mic in test') } } },
  }
  sandbox.globalThis = sandbox
  const context = createContext(sandbox)
  runInContext(source, context, { filename: 'lib/client.js' })
  assert.ok(captured, '客户端 bundle 必须调用 window.__ModuleLoader__.load')
  return { captured, window, listeners }
}

function createClientHarness() {
  const slots = []
  const locales = []
  const effects = []
  const savedKeys = []
  const scope = {
    getSnapshot: () => ({ status: 'ready', value: {}, writable: true }),
    subscribe: () => () => {},
    set: async (key) => { savedKeys.push(key) },
    describe: () => ({ load() {} }),
  }
  const ctx = {
    slots: {
      inject(name, callback) { callback() },
      register(spec, component) { slots.push({ spec, component }) },
    },
    locale: {
      register(namespace, locale) { locales.push({ namespace, locale }); return () => {} },
      bind() { return (key) => key },
    },
    settingsScope: { bind: () => scope },
    effect(fn) { const dispose = fn(); effects.push(dispose); return () => {} },
    get() { return null },
    timer: { interval: (fn, ms) => { const handle = setInterval(fn, ms); return () => clearInterval(handle) } },
  }
  return { ctx, slots, locales, effects, savedKeys, scope }
}

test('客户端 bundle：入口 id、inject 面与 slot 注册', async () => {
  const { captured, listeners } = await loadClientBundle()
  assert.equal(captured.id, '@irvingzhang0512/dsh-chatty')
  assert.equal(typeof captured.factory, 'function')

  const mod = captured.factory((name) => {
    if (name === 'react') return reactStub()
    throw new Error(`unexpected require: ${name}`)
  })
  assert.equal(typeof mod.apply, 'function')
  // 注意：bundle 在 vm 里执行，数组来自另一个 realm，不能直接用 deepStrictEqual。
  assert.equal(Array.from(mod.inject).join(','), 'timer,slots,settingsScope,locale,uiSession')

  const harness = createClientHarness()
  mod.apply(harness.ctx)

  const names = harness.slots.map((item) => item.spec.name).sort()
  assert.deepEqual(names, [
    'conversation.input.dock',
    'conversation.input.right',
    'plugins.item',
    'plugins.row.config',
    'settings.plugin.item',
  ])
  for (const slot of harness.slots) {
    assert.equal(typeof slot.component, 'function', `${slot.spec.name} 必须注册组件`)
  }
  const bar = harness.slots.find((item) => item.spec.name === 'conversation.input.right')
  assert.equal(bar.spec.id, '@irvingzhang0512/dsh-chatty')
  assert.equal(bar.spec.locale, 'dsh-chatty')
  assert.equal(typeof bar.spec.label, 'function')

  const locales = harness.locales.map((item) => item.locale).sort()
  assert.deepEqual(locales, ['en', 'zh', 'zh-CN'])
  assert.equal(typeof listeners.get('dsh-chatty:settings-saved'), 'function')
})

test('客户端 bundle：Voice Bar 与 Draft 面板首次渲染不抛错', async () => {
  const { captured } = await loadClientBundle()
  const mod = captured.factory((name) => {
    if (name === 'react') return reactStub()
    throw new Error(`unexpected require: ${name}`)
  })
  const harness = createClientHarness()
  mod.apply(harness.ctx)

  const inputActions = { setDraft() {}, submit() {}, addAttachments: () => true, removeAttachment() {}, pruneAttachments() {} }
  const props = { sessionId: 's1', input: { draft: '' }, inputActions }

  for (const name of ['conversation.input.right', 'conversation.input.dock', 'plugins.item']) {
    const slot = harness.slots.find((item) => item.spec.name === name)
    assert.ok(slot, `缺少 slot ${name}`)
    const wrapper = slot.component(props)
    assert.ok(wrapper !== undefined, `${name} 的包装组件返回 undefined`)
    // 有的 slot 注册的是箭头包装组件（返回元素描述），有的是组件本身。
    // 两种情况都把最内层组件函数跑一遍，以便在无浏览器环境下暴露引用错误。
    const rendered = typeof wrapper.type === 'function' ? wrapper.type(wrapper.props) : wrapper
    assert.ok(rendered !== undefined, `${name} 的组件返回 undefined`)
  }

  // 插件卡片的 summary 视图（Plugins 页面只用它渲染一行说明）。
  const card = harness.slots.find((item) => item.spec.name === 'plugins.item')
  const summary = card.component({ ...props, view: 'summary' })
  assert.ok(summary !== undefined)
})

test('客户端 bundle：组件在无设置、无草稿的初始状态下也能渲染', async () => {
  const { captured } = await loadClientBundle()
  const mod = captured.factory((name) => {
    if (name === 'react') return reactStub()
    throw new Error(`unexpected require: ${name}`)
  })
  const harness = createClientHarness()
  mod.apply(harness.ctx)

  const bar = harness.slots.find((item) => item.spec.name === 'conversation.input.right')
  // 不传 inputActions（composer 还没挂载）时不能崩。
  const barWrapper = bar.component({ sessionId: '', input: null })
  assert.ok(barWrapper.type(barWrapper.props) !== undefined)

  const dock = harness.slots.find((item) => item.spec.name === 'conversation.input.dock')
  const dockWrapper = dock.component({ input: null })
  assert.equal(dockWrapper.type(dockWrapper.props), null, '空闲且无草稿时面板应返回 null')
})
