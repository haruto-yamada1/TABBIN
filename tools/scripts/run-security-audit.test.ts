import { execFileSync, spawnSync } from 'node:child_process'
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../..')
const bun = execFileSync('bun', ['--print', 'process.execPath'], {
  encoding: 'utf8',
}).trim()
const advisory = {
  id: 1247710,
  url: 'https://github.com/advisories/GHSA-fc5q-39xc-vjpf',
  title: 'reviewed advisory',
  severity: 'high',
  vulnerable_versions: '<=4.0.7',
}
const run = (report: string, status: number, stderr = '') => {
  const directory = mkdtempSync(path.join(tmpdir(), 'tabbin-audit-cli-'))
  try {
    writeFileSync(
      path.join(directory, 'package.json'),
      readFileSync(path.join(root, 'package.json')),
    )
    writeFileSync(
      path.join(directory, 'bun.lock'),
      readFileSync(path.join(root, 'bun.lock')),
    )
    const fakeBun = path.join(directory, 'bun')
    writeFileSync(
      fakeBun,
      '#!/bin/sh\nprintf "%s\\n" "$*" > "$AUDIT_ARGS"\nprintf "%s" "$AUDIT_REPORT"\nprintf "%s" "$AUDIT_STDERR" >&2\nexit "$AUDIT_STATUS"\n',
    )
    chmodSync(fakeBun, 0o700)
    const args = path.join(directory, 'args')
    const result = spawnSync(
      bun,
      [
        '--eval',
        `const RealDate = Date; globalThis.Date = class extends RealDate { constructor(value = '2026-11-18T00:00:00Z') { super(value) } }; await import(${JSON.stringify(path.join(root, 'tools/scripts/run-security-audit.ts'))})`,
      ],
      {
        cwd: directory,
        env: {
          ...process.env,
          PATH: `${directory}:${process.env.PATH ?? ''}`,
          AUDIT_REPORT: report,
          AUDIT_STATUS: String(status),
          AUDIT_STDERR: stderr,
          AUDIT_ARGS: args,
        },
        encoding: 'utf8',
      },
    )
    return { ...result, args: readFileSync(args, 'utf8').trim() }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

describe('security audit CLI', () => {
  it('runs a full registry audit and reports the accepted finding without claiming clean', () => {
    const result = run(JSON.stringify({ picomatch: [advisory] }), 1)
    expect(result.status).toBe(0)
    expect(result.args).toBe('audit --json')
    expect(JSON.parse(result.stdout).accepted).toEqual([
      expect.objectContaining({ advisory: advisory.url }),
    ])
    expect(result.stdout).toContain(advisory.title)
    expect(result.stderr).toContain('Reviewed temporary exception')
    expect(result.stdout).not.toContain('No vulnerabilities')
  })

  it('preserves unaccepted advisory failure alongside the reviewed finding', () => {
    const result = run(
      JSON.stringify({
        picomatch: [advisory, { ...advisory, severity: 'critical' }],
      }),
      1,
    )
    expect(result.status).toBe(1)
    expect(JSON.parse(result.stdout).blocking).toHaveLength(1)
    expect(result.stderr).toContain('Unaccepted High/Critical')
  })

  it.each([
    ['', 7, 'registry unavailable'],
    ['not-json', 0, ''],
    ['{}', 1, 'registry HTTP 503'],
  ])(
    'fails closed for incomplete audits: %s / %s',
    (report, status, stderr) => {
      const result = run(report, status, stderr)
      expect(result.status).toBe(1)
      expect(result.stderr).toContain('Audit unavailable or invalid')
      expect(result.stderr).toContain(stderr)
    },
  )

  it('accepts a complete clean report', () => {
    const result = run('{}', 0)
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual({
      advisories: [],
      accepted: [],
      blocking: [],
    })
  })

  it('escapes untrusted registry titles instead of injecting workflow commands', () => {
    const result = run(
      JSON.stringify({
        picomatch: [{ ...advisory, title: 'text\n::error::forged command' }],
      }),
      1,
    )
    expect(result.status).toBe(0)
    expect(result.stdout).not.toMatch(/^::error::/m)
    expect(JSON.parse(result.stdout).advisories[0].title).toContain(
      '\n::error::',
    )
  })
})
