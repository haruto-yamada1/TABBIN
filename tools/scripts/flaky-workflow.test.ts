import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

type Step = {
  id?: string
  name?: string
  if?: string
  uses?: string
  run?: string
  env?: Record<string, string>
  with?: Record<string, string | number | boolean>
  'continue-on-error'?: boolean
}

type Job = {
  if?: string
  env?: Record<string, string>
  needs?: string[]
  permissions?: Record<string, string>
  steps: Step[]
  'continue-on-error'?: boolean
}

const workflow = parse(readFileSync('.github/workflows/ci.yml', 'utf8')) as {
  on: Record<string, unknown>
  permissions: Record<string, string>
  jobs: Record<string, Job>
}

const testJobs = {
  coverage: 'bun run test:coverage',
  'indexeddb-browser-semantics': 'bun run test:indexeddb:browsers',
  'e2e-accessibility': 'bun run e2e:a11y',
  'firefox-extension-smoke': 'bun run test:firefox:smoke',
}

const browserJobs = [
  'indexeddb-browser-semantics',
  'e2e-accessibility',
  'firefox-extension-smoke',
]

const uploads = (job: Job) =>
  job.steps.filter((step) => step.uses?.startsWith('actions/upload-artifact@'))
const expression = (value: string) => `\${{ ${value} }}`

describe('Flaky-test collection workflow contract', () => {
  it.each(Object.entries(testJobs))(
    'keeps %s blocking while collecting only normalized telemetry after failure',
    (name, command) => {
      const job = workflow.jobs[name]
      if (!job) {
        throw new Error(`Missing test job: ${name}`)
      }
      expect(job['continue-on-error']).toBeUndefined()
      const test = job.steps.find((step) => step.run === command)
      expect(test).toBeDefined()
      expect(test?.['continue-on-error']).toBeUndefined()
      expect(job.env).toEqual({
        FLAKE_REPORT_PATH: `test-results/flake-${name}.json`,
        FLAKE_SUITE: name,
      })
      const artifact = uploads(job).find(
        (step) => step.with?.name === `flake-current-${name}`,
      )
      expect(artifact).toBeDefined()
      expect(artifact?.if).toBe(expression('!cancelled()'))
      expect(artifact?.with?.path).toBe(`test-results/flake-${name}.json`)
      expect(artifact?.with?.['retention-days']).toBe(14)
      expect(artifact?.with?.['if-no-files-found']).toBe('warn')
    },
  )

  it.each(browserJobs)(
    'bounds %s failure evidence before saving only trace, screenshot and video files',
    (name) => {
      const job = workflow.jobs[name]
      if (!job) {
        throw new Error(`Missing browser job: ${name}`)
      }
      const checkIndex = job.steps.findIndex(
        (step) => step.id === 'flake-evidence',
      )
      expect(checkIndex).toBeGreaterThanOrEqual(0)
      expect(job.steps[checkIndex]?.run).toBe(
        'bun tools/testing/check-flake-evidence.ts test-results',
      )
      expect(job.steps[checkIndex]?.if).toBe(expression('!cancelled()'))
      const artifact = uploads(job).find(
        (step) => step.with?.name === `flake-evidence-${name}`,
      )
      expect(artifact).toBeDefined()
      if (!artifact) {
        throw new Error(`Missing evidence artifact: ${name}`)
      }
      expect(job.steps.indexOf(artifact)).toBeGreaterThan(checkIndex)
      expect(artifact?.if).toBe(
        expression(
          "!cancelled() && steps.flake-evidence.outputs.available == 'true'",
        ),
      )
      expect(String(artifact?.with?.path).trim().split('\n')).toEqual([
        'test-results/**/trace.zip',
        'test-results/**/*.png',
        'test-results/**/*.webm',
      ])
      expect(artifact?.with?.['retention-days']).toBe(7)
      expect(artifact?.with?.['include-hidden-files']).toBeUndefined()
      for (const step of uploads(job)) {
        expect(step.with?.path).not.toBe('test-results/')
        expect(String(step.with?.path)).not.toContain('playwright-report')
      }
    },
  )

  it('collects all completed test jobs with read-only access in one advisory job', () => {
    const job = workflow.jobs['flake-diagnostics']
    expect(job).toBeDefined()
    expect(job?.needs).toEqual(Object.keys(testJobs))
    expect(job?.if).toBe(expression('!cancelled()'))
    expect(job?.['continue-on-error']).toBe(true)
    expect(job?.env).toEqual({
      FLAKE_PR_NUMBER: expression("github.event.pull_request.number || ''"),
    })
    expect(job?.permissions).toEqual({ contents: 'read', actions: 'read' })
    const download = job?.steps.find((step) =>
      step.uses?.startsWith('actions/download-artifact@'),
    )
    expect(download?.with).toEqual({
      pattern: 'flake-current-*',
      path: 'reports/flakes/current',
      'merge-multiple': true,
    })
    const history = job?.steps.find(
      (step) =>
        step.run ===
        'bun tools/testing/fetch-flake-history.ts reports/flakes/history',
    )
    expect(history?.env).toEqual({ GH_TOKEN: expression('github.token') })
    expect(job?.steps.map((step) => step.run)).toContain(
      'bun tools/testing/report-flakes.ts --current reports/flakes/current --history reports/flakes/history --output reports/flakes',
    )
    const summary =
      job && uploads(job).find((step) => step.with?.name === 'flake-summary')
    expect(summary?.if).toBe(expression('!cancelled()'))
    expect(String(summary?.with?.path).trim().split('\n')).toEqual([
      'reports/flakes/summary.json',
      'reports/flakes/report.md',
    ])
    expect(summary?.with?.['retention-days']).toBe(14)
    expect(summary?.with?.['if-no-files-found']).toBe('warn')
  })

  it('keeps PR execution unprivileged, credentials transient and actions pinned', () => {
    expect(workflow.on.pull_request).toBeDefined()
    expect(workflow.on.pull_request_target).toBeUndefined()
    expect(workflow.on.workflow_run).toBeUndefined()
    expect(workflow.permissions).toEqual({ contents: 'read' })
    expect(JSON.stringify(workflow)).not.toContain('secrets.')
    for (const [, job] of Object.entries(workflow.jobs).filter(
      ([name]) => name !== 'flake-diagnostics',
    )) {
      expect(job['continue-on-error']).toBeUndefined()
      expect(job.permissions).toBeUndefined()
    }
    for (const job of Object.values(workflow.jobs)) {
      for (const step of job.steps) {
        expect(step['continue-on-error']).toBeUndefined()
      }
      for (const step of job.steps.filter((item) => item.uses)) {
        expect(step.uses).toMatch(/@[0-9a-f]{40}$/)
      }
      for (const step of job.steps.filter((item) =>
        item.uses?.startsWith('actions/checkout@'),
      )) {
        expect(step.with?.['persist-credentials']).toBe(false)
      }
    }
  })
})
