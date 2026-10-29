import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const workflow = parse(readFileSync('.github/workflows/ci.yml', 'utf8'))

describe('feature initial-load CI contract', () => {
  it('measures both production browser artifacts before the existing report on every PR', () => {
    const job = workflow.jobs['verify-build']
    expect(job.if).toBeUndefined()
    const steps = job.steps
    const measureIndex = steps.findIndex(
      (step: { run?: string }) => step.run === 'bun run size:loads',
    )
    const reportIndex = steps.findIndex(
      (step: { run?: string }) => step.run === 'bun run size:report',
    )
    expect(measureIndex).toBeGreaterThan(
      steps.findIndex(
        (step: { run?: string }) => step.run === 'bun run zip:firefox',
      ),
    )
    expect(reportIndex).toBeGreaterThan(measureIndex)
    expect(steps[measureIndex].if).toBeUndefined()
    expect(steps[measureIndex]['continue-on-error']).toBeUndefined()
    expect(steps[measureIndex].env.GECKODRIVER_PATH).toBe('/tmp/geckodriver')
    expect(
      steps.some(
        (step: { run?: string }) =>
          step.run === 'bunx playwright install --with-deps chromium firefox',
      ),
    ).toBe(true)
    const upload = steps.find(
      (step: { name?: string }) => step.name === 'Upload artifact size report',
    )
    expect(upload.if).toBe(`\${{ !cancelled() }}`)
    expect(upload.with.path).toBe('.output/size-report')
  })
})
