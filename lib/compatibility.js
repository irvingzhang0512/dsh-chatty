export function splitChattyVersion(version) {
  const match = String(version).match(/^(.+)\+chatty\.([1-9]\d*)$/)
  if (!match || !Number.isSafeInteger(Number(match[2])))
    throw Error('无效 Chatty 版本')
  return { bundleVersion: match[1], revision: Number(match[2]) }
}
export function compareChattyVersions(a, b) {
  const first = splitChattyVersion(a),
    second = splitChattyVersion(b)
  if (first.bundleVersion !== second.bundleVersion)
    throw Error('不能自动跨 Bundle 基线更新')
  return Math.sign(first.revision - second.revision)
}
export function validateCompatibility(manifest, contract, actual) {
  const version = splitChattyVersion(manifest.version),
    reasons = []
  const expected = [
    'voice-input-bundle',
    'speech-to-text',
    'api-speech-to-text',
    'speech-to-text-sensevoice',
    'client-ui-voice-input'
  ].map((n) => '@deepseek-ai/dsh-experimental-' + n)
  if (
    Object.keys(contract.speechPackages || {}).length !== 5 ||
    expected.some((n) => !Object.hasOwn(contract.speechPackages || {}, n))
  )
    reasons.push('必须精确绑定 Bundle 与四个子包')
  if (
    manifest.name !== contract.packageName ||
    manifest.version !== contract.chattyVersion ||
    version.bundleVersion !== contract.bundleVersion ||
    version.revision !== contract.chattyRevision
  )
    reasons.push('Chatty 版本与兼容清单不一致')
  if (actual.dshVersion !== contract.dshVersion)
    reasons.push('Desktop 版本不匹配')
  if (manifest.peerDependencies?.['@deepseek-ai/dsh'] !== contract.dshVersion)
    reasons.push('Desktop 精确 peer 与清单不一致')
  for (const [name, target] of Object.entries(contract.speechPackages || {})) {
    if (
      target !== contract.bundleVersion ||
      manifest.peerDependencies?.[name] !== target
    )
      reasons.push('语音精确依赖不一致：' + name)
    if (actual.speechPackages?.[name] !== target)
      reasons.push(
        name +
          '：要求 ' +
          target +
          '，实际 ' +
          (actual.speechPackages?.[name] || '缺失')
      )
  }
  return { matched: !reasons.length, reasons }
}
