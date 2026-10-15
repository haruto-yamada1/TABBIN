import { readFileSync } from 'node:fs'

import { verifySecurityAuditPolicy } from './security-audit-policy'

try {
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
