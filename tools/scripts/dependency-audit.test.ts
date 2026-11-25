import { describe, expect, it } from 'vitest'

import { evaluateDependencyAudit } from './dependency-audit'

const advisory = {
  id: 1247710,
  url: 'https://github.com/advisories/GHSA-fc5q-39xc-vjpf',
  title: 'Repeated extglob ReDoS',
  severity: 'high',
  vulnerable_versions: '<=4.0.7',
}
const run = (report: unknown, status = 1) =>
  evaluateDependencyAudit({ stdout: JSON.stringify(report), status })

describe('dependency audit gate', () => {
  it('blocks the formerly exempt advisory if the registry returns it again', () => {
    const result = run({ picomatch: [advisory] })
    expect(result.blocking).toEqual([{ package: 'picomatch', ...advisory }])
    expect(result.accepted).toEqual([])
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

  it('allows a clean report and reports lower severity findings', () => {
    expect(run({}, 0)).toEqual({ accepted: [], advisories: [], blocking: [] })
    const result = run({ other: [{ ...advisory, severity: 'moderate' }] })
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
      }),
    ).toThrow(/Invalid|invalid|Expected|expected|JSON|Unexpected/)
  })
})
