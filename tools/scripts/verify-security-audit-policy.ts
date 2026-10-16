import { lstatSync, readFileSync } from 'node:fs'

import JSON5 from 'json5'

import {
  verifySecurityAuditArtifacts,
  verifySecurityAuditPolicy,
} from './security-audit-policy'

try {
  const patchPath = 'patches/node-forge-null-parameters.patch'
  const patch = lstatSync(patchPath)
  if (!patch.isFile() || (patch.mode & 0o111) !== 0) {
    throw new Error('node-forge patch must be a regular, non-executable file')
  }
  verifySecurityAuditArtifacts(
    JSON5.parse<unknown>(readFileSync('bun.lock', 'utf8')),
    readFileSync(patchPath),
  )
  console.log(
    verifySecurityAuditPolicy(
      JSON.parse(readFileSync('tools/security-audit-policy.json', 'utf8')),
      JSON.parse(readFileSync('package.json', 'utf8')),
    ),
  )
} catch (error) {
  console.error(
    '[security:audit] invalid or expired backport policy:',
    error instanceof Error ? error.message : String(error),
  )
  process.exitCode = 1
}
