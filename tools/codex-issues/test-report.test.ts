import { describe, expect, it } from 'vitest'

import { inspectTestReport } from './test-report'

const report = {
  numTotalTests: 1,
  numPassedTests: 1,
  numFailedTests: 0,
  numPendingTests: 0,
  testResults: [{ assertionResults: [{ status: 'passed' }] }],
}

describe('independent test reports', () => {
  it('requires actual executed assertions with fixed counts', () => {
    expect(inspectTestReport(JSON.stringify(report), 1)).toEqual({
      valid: true,
      passed: true,
      failures: 0,
    })
    expect(inspectTestReport(JSON.stringify(report), 2).passed).toBe(false)
  })

  it('rejects an exit-zero all-skipped report from real Vitest', () => {
    const skipped = {
      ...report,
      numPassedTests: 0,
      numPendingTests: 1,
      testResults: [{ assertionResults: [{ status: 'skipped' }] }],
    }
    expect(inspectTestReport(JSON.stringify(skipped), 1)).toEqual({
      valid: false,
      passed: false,
      failures: null,
    })
  })

  it.each(['', '{}', JSON.stringify({ ...report, testResults: [] })])(
    'rejects missing or fabricated execution counts',
    (text) => {
      expect(inspectTestReport(text, 1).passed).toBe(false)
    },
  )

  it('distinguishes an assertion RED from infrastructure failure', () => {
    const red = {
      ...report,
      numPassedTests: 0,
      numFailedTests: 1,
      testResults: [{ assertionResults: [{ status: 'failed' }] }],
    }
    expect(inspectTestReport(JSON.stringify(red), 1)).toEqual({
      valid: true,
      passed: false,
      failures: 1,
    })
  })
})
