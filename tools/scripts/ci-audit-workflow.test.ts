import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))

describe('Actions definition audit contract', () => {
  it('provides the same entry points locally and in CI', () => {
    expect(pkg.scripts['ci:lint']).toBe('node tools/ci-audit/run.mjs lint')
    expect(pkg.scripts['ci:security']).toBe(
      'node tools/ci-audit/run.mjs security',
    )
    const workflow = parse(
      readFileSync('.github/workflows/actions-audit.yml', 'utf8'),
    )
    expect(workflow.on.pull_request).toBeDefined()
    expect(workflow.on.pull_request_target).toBeUndefined()
    expect(workflow.permissions).toEqual({ contents: 'read' })
    const steps = workflow.jobs.audit.steps
    expect(steps[0].with['persist-credentials']).toBe(false)
    const commands = steps
      .map((step: { run?: string }) => step.run)
      .filter(Boolean)
    expect(commands).toContain('bun run ci:lint')
    expect(commands).toContain('bun run ci:security')
    expect(commands).toContain('bun run ci:test')
    expect(JSON.stringify(workflow)).not.toContain('secrets.')
    expect(JSON.stringify(workflow)).not.toContain('continue-on-error')
    for (const step of steps.filter((item: { uses?: string }) => item.uses)) {
      expect(step.uses).toMatch(/@[0-9a-f]{40}$/)
    }
    for (const file of [
      '.github/workflows/**',
      'tools/ci-audit/**',
      'package.json',
      '.github/zizmor.yml',
    ]) {
      expect(workflow.on.pull_request.paths).toContain(file)
    }
  })
})
