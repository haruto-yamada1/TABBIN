import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const workflow = parse(readFileSync('.github/workflows/ci.yml', 'utf8'))

describe('visual regression CI boundary', () => {
  it('compares committed baselines on every PR without updating or tolerating failure', () => {
    const job = workflow.jobs['storybook-visual']
    expect(job, 'visual regressions must block CI').toBeDefined()
    expect(job.if).toBeUndefined()
    expect(job['continue-on-error']).toBeUndefined()
    const commands = job.steps.flatMap((step: { run?: string }) =>
      step.run ? [step.run] : [],
    )
    expect(commands).toContain('bun run test:visual --repeat-each=3')
    expect(commands.join('\n')).not.toContain('--update-snapshots')
    expect(commands.join('\n')).not.toContain('test:visual:update')
  })

  it('uses the locked browser environment and retains failed comparisons', () => {
    const job = workflow.jobs['storybook-visual']
    const { version }: { version: string } = JSON.parse(
      readFileSync('node_modules/@playwright/test/package.json', 'utf8'),
    )
    const image: string = job?.container?.image
    expect(image).toMatch(/@sha256:[a-f0-9]{64}$/)
    expect(image?.split('@')[0]).toBe(
      `mcr.microsoft.com/playwright:v${version}-noble`,
    )
    const artifact = job?.steps.find(
      (step: { name?: string }) => step.name === 'Upload visual comparisons',
    )
    expect(artifact?.if).toBe(`\${{ !cancelled() }}`)
    expect(artifact?.with?.path).toContain('playwright-report/visual')
    expect(artifact?.with?.path).toContain('test-results/visual')
  })
})
