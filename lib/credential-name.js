// 凭据引用名归一化。
//
// DSH Credentials 的 credentialRef() 只接受 POSIX shell 标识符
// （`^[A-Za-z_][A-Za-z0-9_]*$`，见 @deepseek-ai/dsh-credentials），
// 而需求文档 §22.2 里的示例名带连字符（`volcano-speech`）。
// 两者都不能改：前者是宿主契约，后者是需求文档。
//
// 于是这里做一次归一化：配置里写 `volcano-speech`、`VOLCANO_SPEECH`
// 或 `Volcano Speech` 都指向同一个凭据 `VOLCANO_SPEECH`。
// 这样用户照文档抄配置也不会踩 credentialRef 抛错。

/** 合法的 credential reference 形状（与 @deepseek-ai/dsh-credentials 保持一致）。 */
export const CREDENTIAL_REF_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

/**
 * 把任意写法归一化成合法的 credential reference。
 *
 * 一律转成「大写 + 下划线」的单一规范形式，这样 `volcano-speech`、
 * `VOLCANO_SPEECH`、`Volcano Speech` 都指向同一个凭据，
 * 不会因为大小写差异出现两个"看起来一样"的密钥名。
 *
 * @param {string} name 配置里写的凭据名
 * @returns {string} 合法引用名；空输入返回空字符串
 */
export function toCredentialRef(name) {
  const raw = String(name == null ? '' : name).trim()
  if (!raw) return ''
  const normalized = raw
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+/, '')
    .replace(/_+$/, '')
    .toUpperCase()
  if (!normalized) return ''
  return /^[0-9]/.test(normalized) ? `_${normalized}` : normalized
}

/** 归一化后是否与输入不同（用于决定要不要打一条提示日志）。 */
export function credentialNameChanged(name) {
  const raw = String(name == null ? '' : name).trim()
  return !!raw && toCredentialRef(raw) !== raw
}
