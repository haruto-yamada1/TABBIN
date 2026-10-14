import { TestRunner } from 'vitest'
import type { RunnerTestCase, TestTryOptions } from 'vitest'

import type { Attempt } from './flake-report'

declare module 'vitest' {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- Declaration merging requires an interface.
  interface TaskMeta {
    flakeAttempts?: Attempt[]
  }
}

type PendingAttempt = {
  attempt: Attempt
  startedAt: number
  errors: Set<unknown>
  retry: number
}

/**
 * Vitest's Reporter receives only a final result. Keep observed attempts in
 * serializable metadata without copying errors, stdout, attachments or titles.
 * durationMs measures beforeTry -> afterRetry (beforeEach/body/afterEach). The
 * public hooks do not expose aroundEach setup/teardown or final fixture cleanup
 * duration. Reconcile late cleanup failures at the next try or final result.
 */
export default class FlakeRunner extends TestRunner {
  private readonly pending = new WeakMap<RunnerTestCase, PendingAttempt>()

  override onBeforeTryTask(
    test: RunnerTestCase,
    options: TestTryOptions,
  ): void {
    const previous = this.pending.get(test)
    if (previous) {
      this.reconcile(test, previous)
      if (options.retry > previous.retry) {
        previous.attempt.status = 'failed'
      }
    }
    super.onBeforeTryTask(test, options)
    test.meta.flakeAttempts ??= []
    const attempts = test.meta.flakeAttempts
    const attempt: Attempt = {
      index: attempts.length,
      status: 'interrupted',
      durationMs: 0,
    }
    attempts.push(attempt)
    this.pending.set(test, {
      attempt,
      startedAt: performance.now(),
      errors: new Set(test.result?.errors),
      retry: options.retry,
    })
  }

  onAfterRetryTask(test: RunnerTestCase): void {
    const pending = this.pending.get(test)
    if (!pending) {
      return
    }
    const state = test.result?.state
    if (state === 'pass') {
      pending.attempt.status = 'passed'
    } else if (state === 'fail') {
      pending.attempt.status = 'failed'
    } else if (state === 'skip') {
      pending.attempt.status = 'skipped'
    }
    pending.attempt.durationMs = Math.max(
      0,
      performance.now() - pending.startedAt,
    )
    pending.errors = new Set(test.result?.errors)
  }

  override onAfterRunTask(test: RunnerTestCase): void {
    super.onAfterRunTask(test)
    const pending = this.pending.get(test)
    if (pending) {
      this.reconcile(test, pending)
      this.pending.delete(test)
    }
  }

  private reconcile(test: RunnerTestCase, pending: PendingAttempt): void {
    const newErrors = test.result?.errors?.some(
      (error) => !pending.errors.has(error),
    )
    // test.fails flips physical failure into a passing framework result. Do not
    // mistake its synthetic "expected to fail" error for a physical failure.
    if (!test.fails && newErrors) {
      pending.attempt.status = 'failed'
    }
    if (test.fails && test.result?.state === 'pass') {
      pending.attempt.status = 'failed'
    }
  }
}
