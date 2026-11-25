import { spawnSync } from 'node:child_process'
import { accessSync, constants } from 'node:fs'

import { evaluateDependencyAudit } from './dependency-audit'

try {
  accessSync('package.json', constants.R_OK)
  accessSync('bun.lock', constants.R_OK)

  // Preserve all registry severities and apply the blocking threshold locally.
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
  })
  // JSON escapes untrusted titles, so registry strings cannot inject workflow commands.
  console.log(JSON.stringify(result, null, 2))
  if (result.blocking.length) {
    console.error('[security:audit] High/Critical advisories block this gate.')
    process.exitCode = 1
  }
} catch (error) {
  console.error(
    '[security:audit] Audit unavailable or invalid:',
    error instanceof Error ? error.message : String(error),
  )
  process.exitCode = 1
}
