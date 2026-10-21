import { z } from 'zod'

const schema = z.object({
  numTotalTests: z.number().int().nonnegative(),
  numPassedTests: z.number().int().nonnegative(),
  numFailedTests: z.number().int().nonnegative(),
  numPendingTests: z.number().int().nonnegative(),
  testResults: z.array(
    z.object({
      assertionResults: z.array(z.object({ status: z.string() })),
    }),
  ),
})

export function inspectTestReport(text: string, expected: number) {
  try {
    const report = schema.parse(JSON.parse(text))
    const assertions = report.testResults.flatMap(
      (suite) => suite.assertionResults,
    )
    const passed = assertions.filter((item) => item.status === 'passed').length
    const failed = assertions.filter((item) => item.status === 'failed').length
    const valid =
      expected > 0 &&
      report.numTotalTests === expected &&
      assertions.length === expected &&
      report.numPendingTests === 0 &&
      passed + failed === expected &&
      report.numPassedTests === passed &&
      report.numFailedTests === failed
    return {
      valid,
      passed: valid && failed === 0,
      failures: valid ? failed : null,
    }
  } catch {
    return { valid: false, passed: false, failures: null }
  }
}
