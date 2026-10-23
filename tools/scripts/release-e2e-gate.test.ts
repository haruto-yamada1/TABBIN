import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../..')
const { scripts } = JSON.parse(
  readFileSync(path.join(root, 'package.json'), 'utf8'),
) as { scripts: Record<string, string> }

const runRelease = (
  failure = '',
  command = 'release:check',
  diagnostic = 'fixture failure',
) => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'release-gate-'))
  const log = path.join(directory, 'commands')
  writeFileSync(log, '')
  try {
    const result = spawnSync(
      'bash',
      [
        '-c',
        String.raw`
git() { return 0; }
bun() {
  local step="$2"
  if [ "$1" = 'audit' ]; then step='bun audit --audit-level=high'; fi
  printf '%s\n' "$step" >> "$COMMAND_LOG"
  if [ "$step" = "$FAIL_STEP" ]; then
    printf '%s\n' "$FAIL_REASON" >&2
    return 23
  fi
  if [ "$step" = 'release:e2e' ]; then
    eval "$RELEASE_E2E"
    return $?
  fi
  if [ "$step" = 'security:audit' ]; then
    eval "$SECURITY_AUDIT"
    return $?
  fi
  if [ "$step" = 'release:check' ]; then
    eval "$RELEASE_CHECK"
    return $?
  fi
}
` + scripts[command],
      ],
      {
        cwd: root,
        env: {
          PATH: process.env.PATH,
          RELEASE_E2E: scripts['release:e2e'],
          SECURITY_AUDIT: scripts['security:audit'],
          RELEASE_CHECK: scripts['release:check'],
          COMMAND_LOG: log,
          FAIL_STEP: failure,
          FAIL_REASON: diagnostic,
        },
        encoding: 'utf8',
      },
    )
    return { ...result, commands: readFileSync(log, 'utf8').trim().split('\n') }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

describe('distribution release gate', () => {
  it('audits dependencies before building release artifacts', () => {
    const result = runRelease()
    expect(result.commands).toContain('security:audit')
    expect(result.commands.indexOf('security:audit')).toBeLessThan(
      result.commands.indexOf('build'),
    )
  })

  it('stops before building when the security audit fails', () => {
    const result = runRelease('security:audit')
    expect(result.status).toBe(23)
    expect(result.commands).not.toContain('build')
    expect(result.commands).not.toContain('release:e2e')
  })

  it('validates the backport deadline and RSA probe before the unfiltered High audit', () => {
    const result = runRelease()
    expect(result.commands.slice(0, 5)).toEqual([
      'verify:dependency-licenses',
      'security:audit',
      'verify:security-audit-policy',
      'verify:node-forge-backport',
      'bun audit --audit-level=high',
    ])
  })

  it('rejects an invalid license review before audit or build execution', () => {
    const result = runRelease(
      'verify:dependency-licenses',
      'release:zip',
      'LICENSE changed or review expired',
    )
    expect(result.status).toBe(23)
    expect(result.stderr).toContain('LICENSE changed or review expired')
    expect(result.commands).not.toContain('security:audit')
    expect(result.commands).not.toContain('build')
    expect(result.commands).not.toContain('zip')
  })

  it('rejects missing build notices before browser flows and packaging', () => {
    const result = runRelease('verify:third-party-licenses', 'release:zip')
    expect(result.status).toBe(23)
    expect(result.commands).toContain('build:firefox')
    expect(result.commands).not.toContain('release:e2e')
    expect(result.commands).not.toContain('zip')
  })

  it('requires both ZIPs to pass license verification before recording provenance', () => {
    const result = runRelease('verify:third-party-license-zips', 'release:zip')
    expect(result.status).toBe(23)
    expect(result.commands).toContain('zip')
    expect(result.commands).toContain('zip:firefox')
    expect(result.commands).not.toContain('release:provenance')
  })

  it.each([
    'verify:security-audit-policy',
    'verify:node-forge-backport',
    'bun audit --audit-level=high',
  ])(
    'blocks release ZIPs and preserves diagnostics when %s fails',
    (failure) => {
      const result = runRelease(failure, 'release:zip')
      expect(result.status).toBe(23)
      expect(result.stderr).toContain('fixture failure')
      expect(result.commands).not.toContain('build')
      expect(result.commands).not.toContain('zip')
      expect(result.commands).not.toContain('zip:firefox')
    },
  )

  it.each(['verify:security-audit-policy', 'verify:node-forge-backport'])(
    'stops before the network audit when %s fails',
    (failure) => {
      expect(runRelease(failure).commands).not.toContain(
        'bun audit --audit-level=high',
      )
    },
  )

  it.each([
    'high: GHSA-fixture',
    'critical: GHSA-fixture',
    'ConnectionRefused: audit request failed',
    'HTTP 503: advisory registry unavailable',
    'lockfile not found',
  ])('blocks release and retains audit diagnostics: %s', (diagnostic) => {
    const result = runRelease(
      'bun audit --audit-level=high',
      'release:zip',
      diagnostic,
    )
    expect(result.status).toBe(23)
    expect(result.stderr).toContain(diagnostic)
    expect(result.commands).not.toContain('build')
    expect(result.commands).not.toContain('zip')
  })

  it('runs Chrome critical flows and Firefox IndexedDB smoke before succeeding', () => {
    const result = runRelease()
    expect(result.status).toBe(0)
    expect(result.commands).toContain('e2e:release')
    expect(result.commands).toContain('test:firefox:indexeddb-smoke')
    expect(scripts['quality:check']).not.toContain('release:e2e')
    expect(scripts['release:zip']).toMatch(/^bun run release:check &&/u)
  })

  it.each(['e2e:release', 'test:firefox:indexeddb-smoke'])(
    'fails closed when %s fails',
    (failure) => {
      const result = runRelease(failure)
      expect(result.status).toBe(23)
    },
  )

  it('does not continue to Firefox after the Chrome gate fails', () => {
    expect(runRelease('e2e:release').commands).not.toContain(
      'test:firefox:indexeddb-smoke',
    )
  })
})
