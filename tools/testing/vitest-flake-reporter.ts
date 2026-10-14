import type {
  Reporter,
  TestCase,
  TestModule,
  TestRunEndReason,
} from 'vitest/node'
import { version } from 'vitest/package.json'

import { createReport, recordTest, writeReport } from './flake-report'
import type { Report } from './flake-report'

export default class FlakeReporter implements Reporter {
  private report: Report | undefined
  private warned = false

  onTestRunStart(): void {
    this.report = undefined
    // A killed process leaves an explicitly incomplete report instead of a
    // previous successful artifact at the same path.
    this.emit(writeReport)
  }

  onTestRunEnd(
    modules: readonly TestModule[],
    unhandledErrors: readonly unknown[],
    reason: TestRunEndReason,
  ): void {
    this.emit((report) => {
      report.runErrors = unhandledErrors.length
      report.complete = reason !== 'interrupted'
      for (const module of modules) {
        report.runErrors += module.errors().length
        for (const suite of module.children.allSuites()) {
          report.runErrors += suite.errors().length
        }
        for (const test of module.children.allTests()) {
          this.addTest(report, test)
        }
      }
      // Startup/global setup can fail without a module or an attributed error.
      if (reason === 'failed' && modules.length === 0) {
        report.runErrors += 1
      }
      writeReport(report)
    })
  }

  private addTest(report: Report, test: TestCase): void {
    const result = test.result()
    const attempts = test.meta().flakeAttempts
    const diagnostic = test.diagnostic()
    if (
      diagnostic &&
      attempts &&
      attempts.length !== diagnostic.retryCount + diagnostic.repeatCount + 1
    ) {
      report.complete = false
    }
    if (
      result.state === 'pending' ||
      (!attempts && result.state !== 'skipped')
    ) {
      report.complete = false
      return
    }
    let expectedStatus: 'passed' | 'failed' | 'skipped' = 'passed'
    if (result.state === 'skipped') {
      expectedStatus = 'skipped'
    } else if (test.options.fails) {
      expectedStatus = 'failed'
    }
    recordTest(report, {
      file: test.module.relativeModuleId,
      project: test.project.name,
      browser: 'none',
      title: test.fullName,
      expectedStatus,
      frameworkStatus: result.state,
      attempts: attempts ?? [{ index: 0, status: 'skipped', durationMs: 0 }],
    })
  }

  private emit(action: (report: Report) => void): void {
    try {
      this.report ??= createReport('vitest', version)
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
