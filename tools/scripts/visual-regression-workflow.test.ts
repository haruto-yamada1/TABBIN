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

  it('installs the pinned Bun through npm without OS package-manager dependencies', () => {
    const steps = workflow.jobs['storybook-visual'].steps
    const bootstrapIndex = steps.findIndex((step: { run?: string }) =>
      step.run?.includes('npm install --global'),
    )
    expect(bootstrapIndex).toBeGreaterThanOrEqual(0)
    const bootstrap = steps[bootstrapIndex].run
    expect(bootstrap).toContain('cat .bun-version')
    expect(bootstrap).toContain('--prefix "$RUNNER_TEMP/bun-toolchain"')
    expect(bootstrap).toContain('"bun@$ci_bun_version"')
    expect(bootstrap).toContain('"$RUNNER_TEMP/bun-toolchain/bin"')
    expect(bootstrap).toContain('"$GITHUB_PATH"')
    const commands = steps
      .flatMap((step: { run?: string }) => (step.run ? [step.run] : []))
      .join('\n')
    expect(commands).not.toContain('apt-get')
    expect(commands).not.toContain('unzip')
    const nodeIndex = steps.findIndex((step: { uses?: string }) =>
      step.uses?.startsWith('actions/setup-node@'),
    )
    const verificationIndex = steps.findIndex(
      (step: { run?: string }) =>
        step.run === 'bun run verify:toolchain-versions',
    )
    expect(nodeIndex).toBeLessThan(bootstrapIndex)
    expect(bootstrapIndex).toBeLessThan(verificationIndex)
  })

  it('matches the ephemeral Actions home owner before launching Firefox', () => {
    const steps = workflow.jobs['storybook-visual'].steps
    const ownerIndex = steps.findIndex((step: { run?: string }) =>
      step.run?.includes('chown "$(id -u):$(id -g)" /github/home'),
    )
    const comparisonIndex = steps.findIndex(
      (step: { run?: string }) =>
        step.run === 'bun run test:visual --repeat-each=3',
    )
    expect(ownerIndex).toBeGreaterThanOrEqual(0)
    expect(ownerIndex).toBeLessThan(comparisonIndex)
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
