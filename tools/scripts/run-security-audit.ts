import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

import { evaluateDependencyAudit } from './dependency-audit'

try {
  // Raw registry JSON retains every advisory, including the accepted finding.
  // No CLI ignores, severity filtering, retries, or cached success are used.
  const audit = spawnSync('bun', ['audit', '--json'], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    timeout: 60_000,
  })
  if (audit.stderr) {
    process.stderr.write(audit.stderr)
  }
  if (audit.error || audit.signal) {
    throw new Error(
      'Dependency audit unavailable: process launch, signal, timeout or output limit',
    )
  }
  const result = evaluateDependencyAudit({
    stdout: audit.stdout,
    status: audit.status,
    packageInput: JSON.parse(readFileSync('package.json', 'utf8')),
    lockContent: readFileSync('bun.lock', 'utf8'),
    now: new Date(),
  })
  // JSON escapes untrusted titles, so registry strings cannot inject workflow commands.
  console.log(JSON.stringify(result, null, 2))
  if (result.accepted.length) {
    console.warn(
      '[security:audit] Reviewed temporary exception applied; the advisory remains present. See accepted entries and expiry above.',
    )
  }
  if (result.blocking.length) {
    console.error(
      '[security:audit] Unaccepted High/Critical advisories block this gate.',
    )
    process.exitCode = 1
  }
} catch (error) {
  console.error(
    '[security:audit] Audit unavailable or invalid:',
    error instanceof Error ? error.message : String(error),
  )
  process.exitCode = 1
}
