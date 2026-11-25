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
      [path.join(root, 'tools/scripts/run-security-audit.ts')],
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
  it('blocks the formerly exempt picomatch finding in a full registry audit', () => {
    const result = run(JSON.stringify({ picomatch: [advisory] }), 1)
    expect(result.status).toBe(1)
    expect(result.args).toBe('audit --json')
    expect(JSON.parse(result.stdout).accepted).toEqual([])
    expect(JSON.parse(result.stdout).blocking).toEqual([
      expect.objectContaining({ url: advisory.url }),
    ])
    expect(result.stderr).toContain('High/Critical advisories block this gate')
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
    expect(result.status).toBe(1)
    expect(result.stdout).not.toMatch(/^::error::/m)
    expect(JSON.parse(result.stdout).advisories[0].title).toContain(
      '\n::error::',
    )
  })
})
