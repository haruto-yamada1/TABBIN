import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
} from '@playwright/test/reporter'

const requiredTags = ['@release-saved-tabs', '@release-backup-v2']

export default class ReleaseE2EReporter implements Reporter {
  private suite?: Suite

  onBegin(_config: FullConfig, suite: Suite): void {
    this.suite = suite
  }

  // eslint-disable-next-line typescript/require-await -- Playwright accepts a status override only from an async onEnd.
  async onEnd(result: FullResult): Promise<{ status: FullResult['status'] }> {
    const tests = this.suite?.allTests() ?? []
    const missing = requiredTags.filter(
      (tag) => !tests.some((test) => test.tags.includes(tag)),
    )
    const incomplete = tests.filter(
      (test) =>
        test.expectedStatus !== 'passed' ||
        test.results.length !== 1 ||
        test.results[0]?.status !== 'passed',
    )
    if (missing.length > 0 || incomplete.length > 0) {
      console.error(
        'Release E2E requires every critical flow to pass without skips or retries.',
        { missing, incomplete: incomplete.map((test) => test.title) },
      )
      return { status: 'failed' }
    }
    return { status: result.status }
  }
}
