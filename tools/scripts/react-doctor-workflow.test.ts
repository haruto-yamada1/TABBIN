import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

type WorkflowStep = {
  id?: string
  uses?: string
  name?: string
  if?: string
  run?: string
  shell?: string
  env?: Record<string, string>
  with?: Record<string, string | boolean>
  'continue-on-error'?: boolean
}

type Workflow = {
  on: { pull_request: Record<string, unknown> }
  jobs: Record<
    string,
    {
      name?: string
      if?: string
      permissions?: Record<string, string>
      outputs?: Record<string, string>
      needs?: string
      steps: WorkflowStep[]
      'continue-on-error'?: boolean
    }
  >
}

const workflow: Workflow = parse(
  readFileSync('.github/workflows/react-doctor.yml', 'utf8'),
)
const job = workflow.jobs['react-doctor']
const scan = job?.steps.find((step) => step.id === 'doctor')
const gate = job?.steps.find(
  (step) => step.name === 'Require React Doctor score 100',
)
const githubExpression = (value: string) => `\${{ ${value} }}`

describe('React Doctor merge gate', () => {
  it.each([
    ['pull request', 'a'.repeat(40), 'b'.repeat(40), 'a'.repeat(40)],
    ['normal push', '', 'b'.repeat(40), 'b'.repeat(40)],
    ['first push', '', '0'.repeat(40), 'c'.repeat(40)],
    ['missing before', '', '', 'c'.repeat(40)],
    [
      'pull request with zero before',
      'a'.repeat(40),
      '0'.repeat(40),
      'a'.repeat(40),
    ],
  ])(
    'selects an existing comparison base for %s',
    (_event, prBase, before, expected) => {
      const patchGuard = job?.steps.find(
        (step) => step.run === 'bun tools/scripts/verify-dependency-patches.ts',
      )
      const expression = patchGuard?.env?.BASE_SHA
      expect(expression).toMatch(/^\$\{\{ .* \}\}$/)
      expect(
        runInNewContext(expression?.slice(3, -2) ?? '', {
          github: {
            event: { pull_request: { base: { sha: prBase } }, before },
            sha: 'c'.repeat(40),
          },
        }),
      ).toBe(expected)
    },
  )

  it('runs a full scan for every PR and checks the real scan output even on failure', () => {
    expect(workflow.on.pull_request).toBeDefined()
    expect(workflow.on.pull_request).not.toHaveProperty('paths')
    expect(workflow.on.pull_request).not.toHaveProperty('paths-ignore')
    expect(job?.name).toBe('React Doctor Score 100')
    expect(job?.if).toBeUndefined()
    expect(scan?.uses).toBeUndefined()
    expect(scan?.run).toContain(
      'bun run doctor . --scope full --blocking error --json --json-compact',
    )
    expect(job?.permissions).toEqual({ contents: 'read' })
    expect(gate?.if).toBe(githubExpression('always()'))
    expect(gate?.shell).toBe('bash')
    expect(gate?.env).toEqual({
      REACT_DOCTOR_SCORE: githubExpression('steps.summary.outputs.score'),
      REACT_DOCTOR_OUTCOME: githubExpression('steps.doctor.outcome'),
    })
    for (const item of [job, scan, gate]) {
      expect(item?.['continue-on-error']).not.toBe(true)
    }
  })

  it('keeps PR publishing isolated from execution of repository code', () => {
    const publisher = workflow.jobs['publish-review']
    expect(publisher?.needs).toBe('react-doctor')
    expect(publisher?.permissions).toEqual({
      contents: 'read',
      'pull-requests': 'write',
      issues: 'write',
    })
    expect(publisher?.steps).toHaveLength(1)
    expect(publisher?.steps[0]?.uses).toMatch(
      /^actions\/github-script@[a-f0-9]{40}$/,
    )
    expect(publisher?.steps[0]?.env?.DOCTOR_REVIEW_JSON).toContain(
      'needs.react-doctor.outputs.review',
    )
  })

  it('runs only after the frozen project install and license guard', () => {
    const steps = job?.steps ?? []
    const install = steps.findIndex(
      (step) => step.run === 'bun install --frozen-lockfile --ignore-scripts',
    )
    const patchGuard = steps.findIndex(
      (step) => step.run === 'bun tools/scripts/verify-dependency-patches.ts',
    )
    const guard = steps.findIndex(
      (step) => step.run === 'bun run verify:dependency-licenses',
    )
    expect(install).toBeGreaterThan(0)
    expect(patchGuard).toBeGreaterThan(0)
    expect(patchGuard).toBeLessThan(install)
    expect(steps[patchGuard]?.env?.BASE_SHA).toContain('github.event.before')
    expect(steps[patchGuard]?.env?.HEAD_SHA).toContain('github.sha')
    expect(guard).toBeGreaterThan(install)
    expect(steps.findIndex((step) => step.id === 'doctor')).toBeGreaterThan(
      guard,
    )
    expect(steps[guard]?.if).toBeUndefined()
    expect(steps[guard]?.['continue-on-error']).toBeUndefined()
    const manifest = JSON.parse(readFileSync('package.json', 'utf8'))
    expect(manifest.devDependencies['react-doctor']).toBe('^0.9.16')
    expect(manifest.scripts.doctor).toBe(
      'bun tools/scripts/run-react-doctor.ts',
    )
    expect(manifest.scripts['release:check']).toContain(
      'bun run verify:dependency-licenses',
    )
  })

  it('scans the same revision as the patch guard and review using the pinned Node runtime', () => {
    const steps = job?.steps ?? []
    const checkout = steps.find((step) =>
      step.uses?.startsWith('actions/checkout@'),
    )
    const patchGuard = steps.find(
      (step) => step.run === 'bun tools/scripts/verify-dependency-patches.ts',
    )
    expect(checkout?.with?.ref).toBe(patchGuard?.env?.HEAD_SHA)
    expect(checkout?.with?.ref).toBe(
      githubExpression('github.event.pull_request.head.sha || github.sha'),
    )
    const setupNode = steps.findIndex((step) =>
      step.uses?.startsWith('actions/setup-node@'),
    )
    expect(setupNode).toBeGreaterThan(0)
    expect(steps[setupNode]?.uses).toMatch(/^actions\/setup-node@[a-f0-9]{40}$/)
    expect(steps[setupNode]?.with?.['node-version-file']).toBe('.node-version')
    expect(setupNode).toBeLessThan(
      steps.findIndex((step) => step.id === 'doctor'),
    )
  })

  it.each([
    ['100', 'success', 0],
    ['99', 'success', 1],
    ['92', 'success', 1],
    ['0', 'success', 1],
    ['101', 'success', 1],
    ['', 'success', 1],
    ['unavailable', 'success', 1],
    ['100\n', 'success', 1],
    ['100', 'failure', 1],
    ['100', 'cancelled', 1],
    ['100', 'skipped', 1],
    ['', '', 1],
  ])('score %j with outcome %j exits %i', (score, outcome, expected) => {
    if (!gate?.run) {
      throw new Error('React Doctor score gate is missing')
    }
    const result = spawnSync(
      'bash',
      ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', gate.run],
      {
        env: {
          ...process.env,
          REACT_DOCTOR_SCORE: score,
          REACT_DOCTOR_OUTCOME: outcome,
        },
        encoding: 'utf8',
        timeout: 5_000,
      },
    )
    expect(result.error).toBeUndefined()
    expect(result.status).toBe(expected)
  })
})
