import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const workflow = parse(readFileSync('.github/workflows/ci.yml', 'utf8'))
const expression = (value: string) => `\${{ ${value} }}`
const evaluate = (expression: string, github: object) =>
  runInNewContext(expression.replace(/^\$\{\{\s*|\s*\}\}$/gu, ''), { github })

describe('CI performance quality and scheduling contract', () => {
  it('runs the complete suite once with the canonical coverage thresholds', () => {
    const jobs = Object.values(workflow.jobs) as {
      steps: { run?: string }[]
    }[]
    const commands = jobs.flatMap((job) => job.steps.map((step) => step.run))
    expect(commands.filter((run) => run?.startsWith('bun run test'))).toEqual([
      'bun run test:coverage',
      'bun run test:indexeddb:browsers',
      'bun run test:firefox:smoke',
      'bun run test:firefox:indexeddb-smoke',
    ])
    expect(workflow.jobs.coverage.name).toBe('Coverage Thresholds')
    expect(workflow.jobs.coverage['continue-on-error']).toBeUndefined()
    expect(workflow.jobs.coverage.if).toBeUndefined()
  })

  it.each(['success', 'failure', 'cancelled', 'skipped'])(
    'reports the existing Vitest required check honestly after coverage %s',
    (result) => {
      const gate = workflow.jobs['run-tests']
      expect(gate).toBeDefined()
      expect(gate.name).toBe('Run Vitest Tests')
      expect(gate.needs).toEqual(['coverage'])
      expect(gate.if).toBe(expression('!cancelled()'))
      expect(gate.steps).toHaveLength(1)
      const step = gate.steps[0]
      expect(step.env.COVERAGE_RESULT).toBe(expression('needs.coverage.result'))
      const run = spawnSync('bash', ['-e', '-c', step.run], {
        env: { ...process.env, COVERAGE_RESULT: result },
        encoding: 'utf8',
      })
      expect(run.status).toBe(result === 'success' ? 0 : 1)
    },
  )

  it('runs typecheck, format, lint, audit, architecture and Secretlint once', () => {
    const commands = workflow.jobs['lint-typecheck'].steps
      .map((step: { run?: string }) => step.run)
      .filter(Boolean)
    for (const command of [
      'compile',
      'format:check',
      'lint',
      'security:audit',
      'arch:check',
      'secretlint',
    ]) {
      expect(
        commands.filter((run: string) => run === `bun run ${command}`),
      ).toHaveLength(1)
    }
    expect(commands).not.toContain('bun run check')
  })

  it('keeps all push runs and cancels only superseded runs of the same PR', () => {
    const makeEvent = (
      event_name: string,
      ref: string,
      run_id: number,
      number?: number,
    ) => ({
      event_name,
      ref,
      run_id,
      event: { pull_request: number ? { number } : {} },
    })
    const events = [
      makeEvent('push', 'refs/heads/main', 1),
      makeEvent('push', 'refs/heads/main', 2),
      makeEvent('push', 'refs/heads/develop', 3),
      makeEvent('push', 'refs/heads/develop', 4),
      makeEvent('pull_request', 'refs/pull/10/merge', 5, 10),
      makeEvent('pull_request', 'refs/pull/10/merge', 6, 10),
      makeEvent('pull_request', 'refs/pull/11/merge', 7, 11),
    ]
    const concurrency = workflow.concurrency
    const group = (github: object) =>
      concurrency.group.replace(/\$\{\{.*?\}\}/gu, (expression: string) =>
        String(evaluate(expression, github)),
      )
    const groups = events.map(group)
    expect(new Set(groups.slice(0, 4)).size).toBe(4)
    expect(groups[4]).toBe(groups[5])
    expect(groups[4]).not.toBe(groups[6])
    expect(
      events.map((github) =>
        evaluate(concurrency['cancel-in-progress'], github),
      ),
    ).toEqual([false, false, false, false, true, true, true])
  })

  it('keeps all quality gates eligible regardless of changed paths or PR source', () => {
    expect(workflow.on.pull_request.branches).toEqual(['main', 'develop'])
    expect(workflow.on.pull_request.paths).toBeUndefined()
    expect(workflow.on.pull_request['paths-ignore']).toBeUndefined()
    expect(workflow.on.push.paths).toBeUndefined()
    expect(workflow.on.push['paths-ignore']).toBeUndefined()
    for (const name of [
      'lint-typecheck',
      'verify-build',
      'coverage',
      'indexeddb-browser-semantics',
      'e2e-accessibility',
    ]) {
      expect(workflow.jobs[name].if).toBeUndefined()
    }
  })

  it('keeps frozen installation and OS/browser validation on cache hits and misses', () => {
    const job = workflow.jobs['indexeddb-browser-semantics']
    const caches = job.steps.filter((step: { uses?: string }) =>
      step.uses?.startsWith('actions/cache@'),
    )
    expect(caches).toHaveLength(1)
    for (const cache of caches) {
      expect(cache.with.key).toContain('runner.os')
      expect(cache.with.key).toContain('runner.arch')
      expect(cache.with.key).toContain("'bun.lock'")
      expect(cache.with.key).toContain("'.bun-version'")
      expect(cache.with.path).toBe('~/.cache/ms-playwright')
      expect(cache.with['restore-keys']).toBeUndefined()
      expect(cache.uses).toMatch(/@[0-9a-f]{40}$/u)
    }
    for (const command of [
      'bun install --frozen-lockfile',
      'bunx playwright install --with-deps chromium firefox',
    ]) {
      const step = job.steps.find(
        (step: { run?: string }) => step.run === command,
      )
      expect(step).toBeDefined()
      expect(step.if).toBeUndefined()
    }
  })
})
