import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

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
  it('runs a full scan for every PR and checks the real scan output even on failure', () => {
    expect(workflow.on.pull_request).toBeDefined()
    expect(workflow.on.pull_request).not.toHaveProperty('paths')
    expect(workflow.on.pull_request).not.toHaveProperty('paths-ignore')
    expect(job?.name).toBe('React Doctor Score 100')
    expect(job?.if).toBeUndefined()
    expect(scan?.uses).toMatch(/^millionco\/react-doctor@[0-9a-f]{40}$/)
    expect(scan?.with?.scope).toBe('full')
    expect(scan?.with?.['commit-status']).toBe(false)
    expect(gate?.if).toBe(githubExpression('always()'))
    expect(gate?.shell).toBe('bash')
    expect(gate?.env).toEqual({
      REACT_DOCTOR_SCORE: githubExpression('steps.doctor.outputs.score'),
      REACT_DOCTOR_OUTCOME: githubExpression('steps.doctor.outcome'),
    })
    for (const item of [job, scan, gate]) {
      expect(item?.['continue-on-error']).not.toBe(true)
    }
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
