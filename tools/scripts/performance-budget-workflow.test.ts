import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const workflow = parse(readFileSync('.github/workflows/ci.yml', 'utf8'))

describe('performance regression CI boundary', () => {
  it('runs the full matrix for every CI event without retries or tolerated failures', () => {
    const job = workflow.jobs['performance-budget']
    expect(job, 'performance budgets must be executed in CI').toBeDefined()
    expect(job.if).toBeUndefined()
    expect(job['continue-on-error']).toBeUndefined()
    const commands: string[] = job.steps
      .map((step: { run?: string }) => step.run)
      .filter(Boolean)
    expect(commands).toContain('xvfb-run -a bun run perf:budget')
    expect(commands).toContain(
      'bun run perf:report --input test-results/budget --output reports/performance-budget --baseline docs/testing/performance-budget-baseline.json',
    )
    const scripts = JSON.parse(readFileSync('package.json', 'utf8')).scripts
    expect(scripts['perf:budget']).toBe(
      'playwright test --config playwright.budget.config.ts --repeat-each=3',
    )
  })

  it('retains measurements and produces a failing report even after a partial run', () => {
    const steps = workflow.jobs['performance-budget']?.steps ?? []
    const report = steps.find(
      (step: { name?: string }) => step.name === 'Evaluate performance budgets',
    )
    expect(report?.if).toBe(`\${{ !cancelled() }}`)
    const artifact = steps.find(
      (step: { name?: string }) =>
        step.name === 'Upload performance observations',
    )
    expect(artifact?.if).toBe(`\${{ !cancelled() }}`)
    expect(artifact?.with?.path).toContain(
      'test-results/budget/**/budget-samples.json',
    )
    expect(artifact?.with?.path).toContain('reports/performance-budget')
  })
})
