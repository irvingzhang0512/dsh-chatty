#!/usr/bin/env node
// Minimal repo lint: ESM syntax check for every host module, plus structural
// checks for the browser fragments and the generated bundle.
import { readdir, readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const problems = []

async function listJs(dir) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...await listJs(full))
    else if (entry.name.endsWith('.js') || entry.name.endsWith('.mjs')) out.push(full)
  }
  return out
}

const hostFiles = (await listJs(path.join(root, 'lib')))
  .filter((f) => !f.includes(`${path.sep}client-src${path.sep}`) && path.basename(f) !== 'client.js')

for (const file of hostFiles) {
  const res = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })
  if (res.status !== 0) problems.push(`${path.relative(root, file)}: ${(res.stderr || '').trim()}`)
}

for (const file of await listJs(path.join(root, 'test'))) {
  const res = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })
  if (res.status !== 0) problems.push(`${path.relative(root, file)}: ${(res.stderr || '').trim()}`)
}

const srcDir = path.join(root, 'lib', 'client-src')
for (const file of (await readdir(srcDir)).filter((f) => f.endsWith('.js'))) {
  const body = await readFile(path.join(srcDir, file), 'utf8')
  if (/^\s*(?:import|export)\s/m.test(body.replace(/^\s*\/\/.*$/gm, ''))) {
    problems.push(`lib/client-src/${file}: import/export is not allowed in a fragment`)
  }
}

const bundle = await readFile(path.join(root, 'lib', 'client.js'), 'utf8').catch(() => null)
if (!bundle) problems.push('lib/client.js: missing — run npm run build:client')
else {
  if (!bundle.includes('__ModuleLoader__.load')) problems.push('lib/client.js: no ModuleLoader entry')
  if (!bundle.includes("id: '@irvingzhang0512/dsh-chatty'")) problems.push('lib/client.js: loader id does not match the package name')
}

if (problems.length) {
  console.error(`lint failed (${problems.length}):`)
  for (const problem of problems) console.error(' - ' + problem)
  process.exit(1)
}
console.log(`lint ok (${hostFiles.length} host modules)`)
