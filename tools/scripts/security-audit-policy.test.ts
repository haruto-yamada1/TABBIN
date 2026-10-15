import { spawnSync } from 'node:child_process'
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { verifySecurityAuditPolicy } from './security-audit-policy'

const root = path.resolve(import.meta.dirname, '../..')
const policy = JSON.parse(
  readFileSync(path.join(root, 'tools/security-audit-policy.json'), 'utf8'),
) as { schemaVersion: number; nodeForgeBackport: Record<string, string> }
const pkg = JSON.parse(
  readFileSync(path.join(root, 'package.json'), 'utf8'),
) as {
  devDependencies: Record<string, string>
  overrides: Record<string, string>
  patchedDependencies: Record<string, string>
}
const now = new Date('2026-10-16T00:00:00Z')
const withReview = (fields: Record<string, string>) => ({
  ...policy,
  nodeForgeBackport: { ...policy.nodeForgeBackport, ...fields },
})

describe('security audit backport policy', () => {
  it('accepts the existing reviewed source and patch without advisory ignores', () => {
    expect(verifySecurityAuditPolicy(policy, pkg, now)).toContain(
      '2026-11-10 00:00 UTC',
    )
  })

  it('expires at midnight UTC on the deadline, independently of local timezone', () => {
    expect(() =>
      verifySecurityAuditPolicy(policy, pkg, new Date('2026-11-09T23:59:59Z')),
    ).not.toThrow()
    for (const instant of ['2026-11-10T00:00:00Z', '2026-11-11T00:00:00Z']) {
      expect(() =>
        verifySecurityAuditPolicy(policy, pkg, new Date(instant)),
      ).toThrow(/expired.*2026-11-10.*@haruto-yamada1.*issues\/924/)
    }
  })

  it.each([
    { reviewedAt: '2026-10-17' },
    { reviewedAt: '2026-02-30' },
    { expiresAt: '2026-11-31' },
    { expiresAt: '2026-11-10T23:59:59Z' },
    { expiresAt: '2026-10-11' },
    { expiresAt: '2026-10-10' },
    { expiresAt: '2026-11-11' },
    { owner: ' ' },
    { rationale: '' },
    { dependencyPath: '' },
    { upstreamStatus: '' },
    { trackingIssue: 'https://example.com/issues/924' },
    { advisory: 'GHSA-other' },
    { source: '1.4.0' },
    { patch: 'other.patch' },
  ])('rejects malformed, unreviewed or overlong exceptions: %j', (fields) => {
    expect(() =>
      verifySecurityAuditPolicy(withReview(fields), pkg, now),
    ).toThrow(/Invalid|Too small|within 30 days|future/)
  })

  it.each([
    null,
    {},
    { ...policy, schemaVersion: 2 },
    { ...policy, ignores: ['GHSA-x'] },
  ])(
    'rejects missing policy and unknown exception/suppression fields: %j',
    (input) => {
      expect(() => verifySecurityAuditPolicy(input, pkg, now)).toThrow(
        /Invalid|Unrecognized/,
      )
    },
  )

  it('rejects a missing review field or an invalid clock', () => {
    const incomplete = structuredClone(policy)
    delete incomplete.nodeForgeBackport.expiresAt
    expect(() => verifySecurityAuditPolicy(incomplete, pkg, now)).toThrow(
      /expiresAt/,
    )
    expect(() =>
      verifySecurityAuditPolicy(policy, pkg, new Date('invalid')),
    ).toThrow(/future or invalid/)
  })

  it.each(['devDependencies', 'overrides', 'patchedDependencies'] as const)(
    'rejects changes to the reviewed %s binding',
    (field) => {
      const changed = structuredClone(pkg)
      const key = Object.keys(changed[field]).find((name) =>
        name.startsWith('node-forge'),
      )
      expect(key).toBeDefined()
      if (key === undefined) {
        throw new Error('missing fixture binding')
      }
      changed[field][key] = 'unreviewed'
      expect(() => verifySecurityAuditPolicy(policy, changed, now)).toThrow(
        /node-forge/,
      )
    },
  )

  it('returns a nonzero CLI status and a clear reason for invalid policy', () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'audit-policy-'))
    try {
      mkdirSync(path.join(directory, 'tools'))
      writeFileSync(path.join(directory, 'package.json'), JSON.stringify(pkg))
      writeFileSync(
        path.join(directory, 'tools/security-audit-policy.json'),
        '{}',
      )
      const result = spawnSync(
        'bun',
        [path.join(root, 'tools/scripts/verify-security-audit-policy.ts')],
        {
          cwd: directory,
          encoding: 'utf8',
        },
      )
      expect(result.status).toBe(1)
      expect(result.stderr).toContain(
        '[security:audit] invalid or expired backport policy:',
      )
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
