import { createRequire } from 'node:module'

import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
} from '@playwright/test/reporter'

import { createReport, recordTest, writeReport } from './flake-report'
import type { Report } from './flake-report'

const { version }: { version: string } = createRequire(import.meta.url)(
  '@playwright/test/package.json',
)

const frameworkStatus = (
  outcome: string,
  final: string | undefined,
): 'passed' | 'failed' | 'skipped' | 'interrupted' => {
  if (final === 'interrupted') {
    return 'interrupted'
  }
  if (outcome === 'skipped') {
    return 'skipped'
  }
  return outcome === 'unexpected' ? 'failed' : 'passed'
}

export default class FlakeReporter implements Reporter {
  private report?: Report
  private warned = false
  private suite?: Suite

  onBegin(_config: FullConfig, suite: Suite): void {
    this.suite = suite
    this.emit(writeReport)
  }

  onError(): void {
    this.emit((report) => {
      report.runErrors += 1
    })
  }

  onEnd(result: FullResult): void {
    this.emit((report) => {
      report.complete =
        result.status !== 'interrupted' && result.status !== 'timedout'
      for (const test of this.suite?.allTests() ?? []) {
        const project = test.parent.project()
        if (test.results.length === 0) {
          report.complete = false
          continue
        }
        let expectedStatus: 'passed' | 'failed' | 'skipped' = 'passed'
        if (test.expectedStatus === 'failed') {
          expectedStatus = 'failed'
        } else if (test.expectedStatus === 'skipped') {
          expectedStatus = 'skipped'
        }
        recordTest(report, {
          file: test.location.file,
          project: project?.name ?? '',
          browser:
            project?.use.browserName ??
            project?.use.defaultBrowserType ??
            'chromium',
          title: test.titlePath().join(' > '),
          expectedStatus,
          frameworkStatus: frameworkStatus(
            test.outcome(),
            test.results.at(-1)?.status,
          ),
          attempts: test.results.map((attempt) => ({
            index: attempt.retry,
            status: attempt.status,
            durationMs: attempt.duration,
          })),
        })
      }
      if (result.status === 'failed' && !this.suite) {
        report.runErrors += 1
      }
      writeReport(report)
    })
  }

  printsToStdio(): boolean {
    return false
  }

  private emit(action: (report: Report) => void): void {
    try {
      this.report ??= createReport('playwright', version)
      action(this.report)
    } catch {
      if (this.report) {
        this.report.complete = false
        this.report.runErrors += 1
        try {
          writeReport(this.report)
        } catch {
          // Missing telemetry is diagnosed by the collector, not a test failure.
        }
      }
      if (!this.warned) {
        console.warn('TABBIN flake telemetry could not be emitted')
        this.warned = true
      }
    }
  }
}
