#!/usr/bin/env node
// Concatenate lib/client-src fragments into lib/client.js (single ModuleLoader entry).
import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const srcDir = path.join(root, 'lib', 'client-src')
const outFile = path.join(root, 'lib', 'client.js')

const files = (await readdir(srcDir)).filter((f) => f.endsWith('.js')).sort()
if (files.length === 0) throw new Error('no client-src fragments')
const required = ['00-open.js', '90-close.js']
for (const name of required) {
  if (!files.includes(name)) throw new Error(`missing client-src fragment: ${name}`)
}
let out = ''
for (const f of files) {
  const body = await readFile(path.join(srcDir, f), 'utf8')
  if (/^\s*(?:import|export)\s/m.test(body.replace(/^\s*\/\/.*$/gm, ''))) {
    throw new Error(`${f}: client-src fragments must not use import/export (shared factory scope)`)
  }
  out += `\n// ---- lib/client-src/${f} ----\n`
  out += body
  if (!out.endsWith('\n')) out += '\n'
}
// 内联宿主纯模块（去掉 export 前缀），让浏览器半边与宿主共享同一实现：
//   - composer-text.js  听写直写的追加/回退逻辑
//   - command-parser.js 语音指令判定（整句匹配 / 唤醒前缀）
for (const hostFile of ['lib/composer-text.js', 'lib/command-parser.js']) {
  const body = await readFile(path.join(root, hostFile), 'utf8')
  const stripped = body
    .replace(/^export function /gm, 'function ')
    .replace(/^export const /gm, 'const ')
    .replace(/^export default /gm, '')
  out += `\n// ---- inlined from ${hostFile} ----\n`
  out += stripped
  if (!out.endsWith('\n')) out += '\n'
}
await writeFile(outFile, out, 'utf8')
console.log(`built lib/client.js from ${files.length} fragments + 2 inlined host modules (${out.length} bytes)`)
