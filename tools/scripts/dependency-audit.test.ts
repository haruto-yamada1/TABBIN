import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { evaluateDependencyAudit } from './dependency-audit'

const manifest: unknown = JSON.parse(readFileSync('package.json', 'utf8'))
const lock = readFileSync('bun.lock', 'utf8')
const now = new Date('2026-11-18T00:00:00Z')
const advisory = {
  id: 1247710,
  url: 'https://github.com/advisories/GHSA-fc5q-39xc-vjpf',
  title: 'Repeated extglob ReDoS',
  severity: 'high',
  vulnerable_versions: '<=4.0.7',
}
const run = (
  report: unknown,
  status = 1,
  clock = now,
  packageInput = manifest,
  lockContent = lock,
) =>
  evaluateDependencyAudit({
    stdout: JSON.stringify(report),
    status,
    now: clock,
    packageInput,
    lockContent,
  })

describe('dependency audit gate', () => {
  it('accepts only the reviewed picomatch advisory and exposes the expiry', () => {
    const result = run({ picomatch: [advisory] })
    expect(result.blocking).toEqual([])
    expect(result.accepted).toEqual([
      expect.objectContaining({
        package: 'picomatch',
        advisory: advisory.url,
        expiresAt: '2026-12-02T00:00:00Z',
      }),
    ])
    expect(result.advisories).toHaveLength(1)
  })

  it.each([
    [
      'picomatch',
      { ...advisory, url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc' },
    ],
    ['other-package', advisory],
    ['picomatch', { ...advisory, severity: 'critical' }],
    ['picomatch', { ...advisory, vulnerable_versions: '<=4.0.8' }],
  ])('blocks unreviewed High/Critical findings for %s: %j', (name, finding) => {
    expect(run({ [name]: [finding] }).blocking).toHaveLength(1)
    expect(run({ [name]: [finding] }).accepted).toEqual([])
  })

  it('still blocks other findings alongside the accepted exception', () => {
    const result = run({
      picomatch: [
        advisory,
        {
          ...advisory,
          url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc',
        },
      ],
    })
    expect(result.accepted).toHaveLength(1)
    expect(result.blocking).toHaveLength(1)
  })

  it.each([
    '2026-12-02T00:00:00Z',
    '2026-12-03T00:00:00Z',
    '2026-11-17T23:59:59Z',
    'invalid',
  ])('rejects exception use outside the reviewed interval: %s', (clock) => {
    expect(() => run({ picomatch: [advisory] }, 1, new Date(clock))).toThrow(
      /expired|review|clock/,
    )
  })

  it('rejects any lock drift while the exception is required', () => {
    expect(() =>
      run({ picomatch: [advisory] }, 1, now, manifest, `${lock}\n`),
    ).toThrow(/lock/)
  })

  it.each(['dependencies', 'optionalDependencies', 'peerDependencies'])(
    'rejects production declarations changed outside the reviewed lock: %s',
    (scope) => {
      expect(() =>
        run({ picomatch: [advisory] }, 1, now, {
          ...(manifest as Record<string, unknown>),
          [scope]: { picomatch: '4.0.7' },
        }),
      ).toThrow(/production|declaration/)
    },
  )

  it('allows a clean report or lower findings without relying on the expired exception', () => {
    expect(
      run({}, 0, new Date('2027-01-01'), manifest, 'changed lock').accepted,
    ).toEqual([])
    const result = run({ other: [{ ...advisory, severity: 'moderate' }] }, 1)
    expect(result.blocking).toEqual([])
    expect(result.accepted).toEqual([])
    expect(result.advisories).toHaveLength(1)
  })

  it.each([
    [],
    null,
    { error: 'registry unavailable' },
    { picomatch: [{}] },
    { picomatch: [{ ...advisory, severity: 'unknown' }] },
  ])('fails closed for malformed or unrecognized reports: %j', (report) => {
    expect(() => run(report)).toThrow(
      /Invalid|invalid|Expected|expected|JSON|Unexpected/,
    )
  })

  it.each([null, 2, 7, 127])(
    'fails closed for process/registry errors: %s',
    (status) => {
      expect(() =>
        evaluateDependencyAudit({
          stdout: '{}',
          status,
          now,
          packageInput: manifest,
          lockContent: lock,
        }),
      ).toThrow(/unavailable/)
    },
  )

  it.each([
    [{}, 1],
    [{ picomatch: [advisory] }, 0],
  ] as const)(
    'rejects inconsistent report/status: %j, %s',
    (report, status) => {
      expect(() => run(report, status)).toThrow(/inconsistent/)
    },
  )

  it('rejects truncated JSON even when audit exits normally', () => {
    expect(() =>
      evaluateDependencyAudit({
        stdout: '{',
        status: 1,
        now,
        packageInput: manifest,
        lockContent: lock,
      }),
    ).toThrow(/Invalid|invalid|Expected|expected|JSON|Unexpected/)
  })
})
