import { describe, expect, it } from 'vitest'

import {
  aggregateReports,
  createReport,
  parseReport,
  recordTest,
} from './flake-report'

const fixture = (statuses: string[], runId = '1') => {
  const report = createReport('vitest', '5.0.3')
  report.context.runId = runId
  report.complete = true
  recordTest(report, {
    file: 'src/example.test.ts',
    project: 'node',
    browser: 'none',
    title: 'private URL https://secret.invalid/?token=canary',
    expectedStatus: 'passed',
    attempts: statuses.map((status, index) => ({
      index,
      status: status as 'passed' | 'failed' | 'skipped',
      durationMs: 10 + index,
    })),
  })
  return report
}

describe('flake telemetry contract', () => {
  it('keeps initial failure, retry success, final failure and skip distinct', () => {
    const report = fixture(['failed', 'passed'])
    const summary = aggregateReports([
      report,
      fixture(['failed', 'failed'], '2'),
      fixture(['skipped'], '3'),
      fixture(['passed'], '4'),
    ])
    expect(summary.counts).toEqual({
      passed: 1,
      flaky: 1,
      failed: 1,
      skipped: 1,
      interrupted: 0,
      expectedFailure: 0,
    })
    expect(summary.tests[0]).toMatchObject({
      initialFailures: 2,
      retryRecovered: 1,
      finalFailures: 1,
      durationMs: 62,
      flakeRate: 2 / 3,
      retryRecoveryRate: 1 / 3,
      diagnosis: 'flake-candidate',
    })
    expect(report.tests[0]?.attempts).toEqual([
      { index: 0, status: 'failed', durationMs: 10 },
      { index: 1, status: 'passed', durationMs: 11 },
    ])
    expect(JSON.stringify(summary)).not.toContain('secret.invalid')
    expect(JSON.stringify(report)).not.toContain('canary')
  })

  it('preserves identical parameterized titles as distinct stable observations', () => {
    const report = fixture(['failed'])
    recordTest(report, {
      file: 'src/example.test.ts',
      project: 'node',
      browser: 'none',
      title: 'private URL https://secret.invalid/?token=canary',
      expectedStatus: 'passed',
      attempts: [{ index: 0, status: 'passed', durationMs: 5 }],
    })
    expect(report.tests).toHaveLength(2)
    expect(new Set(report.tests.map((test) => test.id)).size).toBe(2)
    expect(aggregateReports([report]).counts).toMatchObject({
      failed: 1,
      passed: 1,
    })
  })

  it('identifies mixed outcomes on one SHA without conflating changed code', () => {
    const failed = fixture(['failed'], '1')
    const passed = fixture(['passed'], '2')
    expect(aggregateReports([failed, passed]).tests[0]).toMatchObject({
      diagnosis: 'flake-candidate',
      crossRunFailures: 1,
      flakeRate: 0.5,
      retryRecoveryRate: 0,
    })
    passed.context.sha = '1'.repeat(40)
    expect(aggregateReports([failed, passed]).tests[0]).toMatchObject({
      diagnosis: 'failure-investigation',
      crossRunFailures: 0,
      flakeRate: 0,
    })
  })

  it('uses separate environment denominators and deduplicates run reruns', () => {
    const first = fixture(['failed'])
    const rerun = fixture(['passed'])
    rerun.context.runAttempt = 2
    const other = fixture(['failed'], '2')
    other.environment.os = 'linux'
    first.environment.os = 'darwin'
    rerun.environment.os = 'darwin'
    const result = aggregateReports([first, rerun, rerun, other])
    expect(result.counts.passed).toBe(1)
    expect(result.counts.failed).toBe(1)
    expect(result.tests).toHaveLength(2)
  })

  it('marks repeated final failures as regression candidates and run errors as unknown', () => {
    const result = aggregateReports([
      fixture(['failed'], '1'),
      fixture(['failed'], '2'),
    ])
    expect(result.tests[0]?.diagnosis).toBe('regression-candidate')
    const broken = fixture(['failed'])
    broken.runErrors = 1
    expect(aggregateReports([broken]).tests[0]?.diagnosis).toBe(
      'environment-or-setup-investigation',
    )
  })

  it('does not mark expected failures as flakes and exposes incomplete runs', () => {
    const expected = fixture(['failed'])
    const first = expected.tests[0]
    if (!first) {
      throw new Error('Missing fixture test')
    }
    first.expectedStatus = 'failed'
    first.frameworkStatus = 'passed'
    const incomplete = fixture(['interrupted'], '2')
    incomplete.complete = false
    const result = aggregateReports([expected, incomplete])
    expect(result.counts.expectedFailure).toBe(1)
    expect(result.counts.interrupted).toBe(1)
    expect(result.incompleteRuns).toBe(1)
    expect(result.tests[0]?.initialFailures).toBe(0)
  })

  it('rejects unsafe paths, extra payloads, duplicate tests and nonsequential attempts', () => {
    const report = fixture(['passed'])
    expect(() =>
      parseReport({ ...report, errors: ['private payload'] }),
    ).toThrow(/(?:Unrecognized key|Invalid)/u)
    const record = report.tests[0]
    if (!record) {
      throw new Error('Missing fixture test')
    }
    expect(() => parseReport({ ...report, tests: [record, record] })).toThrow(
      /(?:Unrecognized key|Invalid)/u,
    )
    expect(() =>
      parseReport({ ...report, tests: [{ ...record, file: '../../x' }] }),
    ).toThrow(/(?:Unrecognized key|Invalid)/u)
    expect(() =>
      parseReport({
        ...report,
        tests: [
          {
            ...record,
            attempts: [{ index: 1, status: 'passed', durationMs: 0 }],
          },
        ],
      }),
    ).toThrow(/(?:Unrecognized key|Invalid)/u)
  })
})
