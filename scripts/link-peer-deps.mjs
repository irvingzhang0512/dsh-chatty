#!/usr/bin/env node
// 把 package.json 的 peerDependencies 从**本机 DSH 宿主安装**链接进本插件目录。
//
// 为什么需要这个脚本：
//   DSH 通过 profile 里的链接加载插件，Node 解析符号链接时用的是 realpath，
//   所以插件的 `import '@deepseek-ai/dsh-tools'` 会从**插件自己的目录**往上找，
//   而不会用 profile 的 node_modules（那里也没有这些包）。
//   本插件刻意不声明运行时依赖，也不在仓库里提交 node_modules，
//   因此在「链接到 profile 之前」需要在本地把宿主那套包链进来。
//
// 链接而不是复制：这样插件与宿主加载的是同一份文件（同一个模块实例），
// 也不会在 DSH 升级后留下过期的副本。
//
// 用法：
//   node scripts/link-peer-deps.mjs            # 自动探测宿主安装并建立链接
//   node scripts/link-peer-deps.mjs --check    # 只检查，不修改
//   node scripts/link-peer-deps.mjs --from <dir>   # 指定含 @deepseek-ai/* 的目录
//
// 仅 Windows 需要（用目录 junction）；其它平台退化为符号链接。

import { readFile, mkdir, rm, symlink, lstat, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const args = process.argv.slice(2)
const checkOnly = args.includes('--check')
const fromIndex = args.indexOf('--from')
const explicitFrom = fromIndex >= 0 ? args[fromIndex + 1] : ''

const SCOPE = '@deepseek-ai'

async function readPeerDeps() {
  const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
  return Object.keys(manifest.peerDependencies || {}).filter((name) => name.startsWith(`${SCOPE}/`))
}

/** 候选目录：都应当是「包含 @deepseek-ai/<pkg> 的 node_modules 级目录」。 */
function candidateRoots() {
  const home = os.homedir()
  const dshHome = process.env.DSH_HOME || path.join(home, '.dsh')
  const npmGlobal = process.env.APPDATA
    ? path.join(process.env.APPDATA, 'npm', 'node_modules')
    : path.join(home, 'AppData', 'Roaming', 'npm', 'node_modules')
  const candidates = []
  if (explicitFrom) candidates.push(explicitFrom)
  candidates.push(
    path.join(dshHome, 'node_modules'),
    path.join(dshHome, 'profiles', 'web', 'node_modules'),
    path.join(npmGlobal, SCOPE, 'dsh', 'node_modules'),
    npmGlobal,
  )
  // 兜底：本机其它自研插件里可能已经装过这套 peer 依赖。
  const pluginsRoot = path.dirname(root)
  try {
    for (const entry of execFileSync('cmd', ['/c', 'dir', '/b', pluginsRoot], { encoding: 'utf8' }).split(/\r?\n/)) {
      const name = entry.trim()
      if (name) candidates.push(path.join(pluginsRoot, name, 'node_modules'))
    }
  } catch { /* 目录列举失败就只用固定候选 */ }
  return [...new Set(candidates)]
}

/** 找到第一个能同时提供全部 peer 包的候选目录。 */
function findHostRoot(peers) {
  for (const candidate of candidateRoots()) {
    if (!candidate) continue
    const scopeDir = path.join(candidate, SCOPE)
    if (!existsSync(scopeDir)) continue
    if (peers.every((name) => existsSync(path.join(candidate, name, 'package.json')))) return candidate
  }
  return ''
}

async function currentLink(target) {
  try {
    const info = await lstat(target)
    if (!info.isSymbolicLink()) return { kind: 'directory' }
    const { readlink } = await import('node:fs/promises')
    return { kind: 'link', to: await readlink(target) }
  } catch {
    return null
  }
}

async function main() {
  const peers = await readPeerDeps()
  if (!peers.length) {
    console.log('package.json 没有 @deepseek-ai/* 的 peerDependencies，无需处理')
    return
  }
  const hostRoot = findHostRoot(peers)
  if (!hostRoot) {
    console.error('找不到包含全部 peer 依赖的宿主目录，请用 --from <dir> 指定（该目录下应有 @deepseek-ai/*）')
    console.error('需要的包：' + peers.join(', '))
    process.exitCode = 1
    return
  }
  console.log(`宿主 peer 依赖目录：${hostRoot}`)

  const linkRoot = path.join(root, 'node_modules')
  const missing = []
  for (const name of peers) {
    const source = path.join(hostRoot, name)
    const target = path.join(linkRoot, name)
    const existing = await currentLink(target)
    if (existing && existing.kind === 'link' && path.resolve(existing.to) === path.resolve(source)) {
      console.log(`  已就绪 ${name}`)
      continue
    }
    if (checkOnly) {
      missing.push(name)
      console.log(`  待修复 ${name}${existing ? `（当前：${existing.to || existing.kind}）` : '（缺失）'}`)
      continue
    }
    await mkdir(path.dirname(target), { recursive: true })
    if (existing) await rm(target, { recursive: true, force: true })
    await symlink(source, target, process.platform === 'win32' ? 'junction' : 'dir')
    console.log(`  已链接 ${name} -> ${source}`)
  }

  if (checkOnly && missing.length) {
    console.error(`peer 依赖未就绪（${missing.length} 个）：运行 node scripts/link-peer-deps.mjs 修复`)
    process.exitCode = 1
    return
  }
  if (checkOnly) console.log('peer 依赖检查通过')
}

await main()
