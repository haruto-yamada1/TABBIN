import { lstatSync, readFileSync } from 'node:fs'

import JSON5 from 'json5'

import {
  verifySecurityAuditArtifacts,
  verifySecurityAuditPolicy,
} from './security-audit-policy'

try {
  const policyInput: unknown = JSON.parse(
    readFileSync('tools/security-audit-policy.json', 'utf8'),
  )
  const packageInput: unknown = JSON.parse(readFileSync('package.json', 'utf8'))
  const message = verifySecurityAuditPolicy(policyInput, packageInput)
  const lockInput = JSON5.parse<unknown>(readFileSync('bun.lock', 'utf8'))
  // Validation above makes this mode selection safe: unknown policy fields or
  // version changes fail before artifact verification.
  if (
    typeof policyInput === 'object' &&
    policyInput &&
    'nodeForgeRelease' in policyInput
  ) {
    verifySecurityAuditArtifacts(lockInput)
  } else {
    const patchPath = 'patches/node-forge-null-parameters.patch'
    const patch = lstatSync(patchPath)
    if (!patch.isFile() || (patch.mode & 0o111) !== 0) {
      throw new Error('node-forge patch must be a regular, non-executable file')
    }
    verifySecurityAuditArtifacts(lockInput, readFileSync(patchPath))
  }
  console.log(message)
} catch (error) {
  console.error(
    '[security:audit] invalid or expired backport policy:',
    error instanceof Error ? error.message : String(error),
  )
  process.exitCode = 1
}
