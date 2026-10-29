import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import JSON5 from 'json5'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import {
  verifySecurityAuditArtifacts,
  verifySecurityAuditPolicy,
} from './security-audit-policy'
import { verifyBackportReviewApproval } from './security-audit-review-approvals'

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
const lockContent = readFileSync(path.join(root, 'bun.lock'), 'utf8')
const patchBytes = readFileSync(
  path.join(root, 'patches/node-forge-null-parameters.patch'),
)
const runPolicyCli = (
  input: unknown = policy,
  patch: Uint8Array | null = patchBytes,
  lock: string | null = lockContent,
  kind: 'regular' | 'symlink' | 'executable' = 'regular',
) => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'audit-policy-'))
  try {
    mkdirSync(path.join(directory, 'tools'))
    mkdirSync(path.join(directory, 'patches'))
    writeFileSync(path.join(directory, 'package.json'), JSON.stringify(pkg))
    writeFileSync(
      path.join(directory, 'tools/security-audit-policy.json'),
      JSON.stringify(input),
    )
    if (patch !== null) {
      const patchPath = path.join(
        directory,
        'patches/node-forge-null-parameters.patch',
      )
      writeFileSync(patchPath, patch)
      if (kind === 'executable') {
        chmodSync(patchPath, 0o755)
      }
      if (kind === 'symlink') {
        rmSync(patchPath)
        symlinkSync(
          path.join(root, 'patches/node-forge-null-parameters.patch'),
          patchPath,
        )
      }
    }
    if (lock !== null) {
      writeFileSync(path.join(directory, 'bun.lock'), lock)
    }
    return spawnSync(
      'bun',
      [path.join(root, 'tools/scripts/verify-security-audit-policy.ts')],
      { cwd: directory, encoding: 'utf8' },
    )
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

describe('security audit backport policy', () => {
  it('rejects a date-only renewal using the previous tracking Issue', () => {
    expect(() =>
      verifySecurityAuditPolicy(
        withReview({ reviewedAt: '2026-10-16', expiresAt: '2026-11-15' }),
        pkg,
        new Date('2026-11-12T00:00:00Z'),
      ),
    ).toThrow(/approved|tracking Issue/)
  })

  it('accepts the complete current release audit inputs through the CLI', () => {
    expect(runPolicyCli().status).toBe(0)
  })

  it('rejects patch byte changes even when the path is unchanged', () => {
    const result = runPolicyCli(
      policy,
      Buffer.concat([patchBytes, Buffer.from('\n')]),
    )
    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/patch.*digest/)
  })

  it('rejects changed lockfile revision binding', () => {
    const result = runPolicyCli(
      policy,
      patchBytes,
      lockContent.replace(
        '"node-forge@github:digitalbazaar/forge#ceba344", {},',
        '"node-forge@github:digitalbazaar/forge#deadbee", {},',
      ),
    )
    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/node-forge|lock/)
  })

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
    { trackingIssue: 'https://github.com/haruto-yamada1/TABBIN/issues/0' },
    { trackingIssue: 'https://github.com/haruto-yamada1/TABBIN/issues/0924' },
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
    const result = runPolicyCli({})
    expect(result.status).toBe(1)
    expect(result.stderr).toContain(
      '[security:audit] invalid or expired backport policy:',
    )
    expect(result.stderr).toContain('schemaVersion')
  })
})

type AuditLock = {
  lockfileVersion: number
  packages: Record<string, unknown>
  patchedDependencies: Record<string, string>
  overrides: Record<string, string>
  workspaces: Record<string, { devDependencies: Record<string, string> }>
}
const currentLock = () => JSON5.parse<AuditLock>(lockContent)
const currentResolution = () =>
  z.array(z.unknown()).parse(currentLock().packages['node-forge'])

describe('release audit artifact provenance', () => {
  it('accepts the current JSON5 lockfile and exact patch bytes', () => {
    expect(() =>
      verifySecurityAuditArtifacts(currentLock(), patchBytes),
    ).not.toThrow()
  })

  it.each([
    [
      'revision',
      (lock: AuditLock) => {
        lock.packages['node-forge'] = [
          'node-forge@github:digitalbazaar/forge#deadbee',
          ...currentResolution().slice(1),
        ]
      },
    ],
    [
      'integrity',
      (lock: AuditLock) => {
        lock.packages['node-forge'] = [
          ...currentResolution().slice(0, 3),
          'sha512-changed',
        ]
      },
    ],
    [
      'archive',
      (lock: AuditLock) => {
        const entry = currentResolution()
        entry[2] = 'different-archive'
        lock.packages['node-forge'] = entry
      },
    ],
    [
      'metadata',
      (lock: AuditLock) => {
        const entry = currentResolution()
        entry[1] = { dependencies: { unexpected: '*' } }
        lock.packages['node-forge'] = entry
      },
    ],
    [
      'nested resolution',
      (lock: AuditLock) => {
        lock.packages['parent/node-forge'] = [
          'node-forge@1.4.0',
          '',
          {},
          'sha512-other',
        ]
      },
    ],
    [
      'alias resolution',
      (lock: AuditLock) => {
        lock.packages.alias = ['node-forge@1.4.0', '', {}, 'sha512-other']
      },
    ],
    [
      'missing resolution',
      (lock: AuditLock) => {
        delete lock.packages['node-forge']
      },
    ],
    [
      'patch map',
      (lock: AuditLock) => {
        lock.patchedDependencies[
          'node-forge@github:digitalbazaar/forge#ceba344'
        ] = 'patches/other.patch'
      },
    ],
    [
      'override',
      (lock: AuditLock) => {
        lock.overrides['node-forge'] = '1.4.0'
      },
    ],
    [
      'workspace',
      (lock: AuditLock) => {
        const workspace = lock.workspaces['']
        if (!workspace) {
          throw new Error('missing fixture workspace')
        }
        workspace.devDependencies['node-forge'] = '1.4.0'
      },
    ],
  ] as const)(
    'rejects changed %s even with the original package.json',
    (_, change) => {
      const lock = currentLock()
      change(lock)
      expect(() => verifySecurityAuditArtifacts(lock, patchBytes)).toThrow(
        /node-forge/,
      )
    },
  )

  it('rejects malformed lock input and non-text patch byte changes', () => {
    expect(() => verifySecurityAuditArtifacts({}, patchBytes)).toThrow(
      /Invalid/,
    )
    expect(() =>
      verifySecurityAuditArtifacts(
        currentLock(),
        Buffer.concat([patchBytes, Buffer.from([255])]),
      ),
    ).toThrow(/patch.*digest/)
  })

  it.each(['symlink', 'executable'] as const)(
    'rejects a %s patch file through the CLI',
    (kind) => {
      const result = runPolicyCli(policy, patchBytes, lockContent, kind)
      expect(result.status).toBe(1)
      expect(result.stderr).toMatch(/regular, non-executable/)
    },
  )

  it.each([
    [null, lockContent],
    [patchBytes, null],
    [patchBytes, '{invalid lock'],
  ] as const)(
    'fails closed for missing or invalid release input %#',
    (patch, lock) => {
      const result = runPolicyCli(policy, patch, lock)
      expect(result.status).toBe(1)
      expect(result.stderr).toContain('[security:audit]')
    },
  )
})

describe('backport renewal approval history', () => {
  const original = {
    trackingIssue: 'https://github.com/haruto-yamada1/TABBIN/issues/924',
    reviewedAt: '2026-10-11',
    expiresAt: '2026-11-10',
  }
  const renewed = {
    trackingIssue: 'https://github.com/haruto-yamada1/TABBIN/issues/961',
    reviewedAt: '2026-10-16',
    expiresAt: '2026-11-15',
  }

  it('requires a newly approved record as well as a new tracking Issue', () => {
    expect(() => verifyBackportReviewApproval(renewed)).toThrow(
      /approved record/,
    )
    expect(() =>
      verifyBackportReviewApproval(renewed, [original, renewed]),
    ).not.toThrow()
    expect(() =>
      verifyBackportReviewApproval(original, [original, renewed]),
    ).toThrow(/approved record/)
  })

  it('rejects reusing an Issue or changing dates outside the approved record', () => {
    const reused = { ...renewed, trackingIssue: original.trackingIssue }
    expect(() =>
      verifyBackportReviewApproval(reused, [original, reused]),
    ).toThrow(/new tracking Issue/)
    expect(() =>
      verifyBackportReviewApproval({
        ...original,
        expiresAt: renewed.expiresAt,
      }),
    ).toThrow(/approved record/)
  })

  it('rejects missing and nonchronological approval history', () => {
    expect(() => verifyBackportReviewApproval(renewed, [])).toThrow(/Too small/)
    expect(() =>
      verifyBackportReviewApproval(renewed, [
        original,
        { ...renewed, reviewedAt: '2026-10-10' },
      ]),
    ).toThrow(/chronologically/)
    expect(() =>
      verifyBackportReviewApproval(renewed, [
        original,
        { ...renewed, expiresAt: '2026-11-09' },
      ]),
    ).toThrow(/chronologically/)
  })

  it('rejects rewriting the existing approval dates with the same Issue', () => {
    const rewritten = { ...renewed, trackingIssue: original.trackingIssue }
    expect(() => verifyBackportReviewApproval(rewritten, [rewritten])).toThrow(
      /preserve.*existing/,
    )
  })

  it('rejects removing the existing approval while appending a new Issue', () => {
    expect(() => verifyBackportReviewApproval(renewed, [renewed])).toThrow(
      /preserve.*existing/,
    )
  })

  it.each([
    ['https://github.com/haruto-yamada1/TABBIN/issues/0924', /Invalid/],
    ['https://github.com/haruto-yamada1/TABBIN/issues/924\n', /Invalid/],
  ] as const)(
    'does not treat an alias of the same Issue as a new approval: %s',
    (trackingIssue, error) => {
      const alias = { ...renewed, trackingIssue }
      expect(() =>
        verifyBackportReviewApproval(alias, [original, alias]),
      ).toThrow(error)
    },
  )
})
