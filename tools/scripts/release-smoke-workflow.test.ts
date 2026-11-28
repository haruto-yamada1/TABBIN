import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

type Step = {
  readonly run?: string
  readonly if?: string
  readonly 'continue-on-error'?: boolean
}

type Job = {
  readonly name: string
  readonly needs?: readonly string[]
  readonly if?: string
  readonly 'continue-on-error'?: boolean
  readonly steps: readonly (Step & {
    readonly env?: Readonly<Record<string, string>>
  })[]
}

const workflow = parse(readFileSync('.github/workflows/ci.yml', 'utf8')) as {
  readonly on: Readonly<Record<string, unknown>>
  readonly jobs: Readonly<Record<string, Job>>
  readonly permissions: Readonly<Record<string, string>>
}

const requireStep = (job: Job | undefined, command: string): number => {
  expect(job?.if).toBeUndefined()
  expect(job?.['continue-on-error']).toBeUndefined()
  const index = job?.steps.findIndex(({ run }) => run === command) ?? -1
  if (index < 0) {
    throw new Error(`Missing required CI step: ${command}`)
  }
  const step = job?.steps[index]
  expect(step?.if).toBeUndefined()
  expect(step?.['continue-on-error']).toBeUndefined()
  return index
}

describe('required release smoke workflow', () => {
  it('uses the required Verify Build check for both browser results', () => {
    expect(workflow.on).toHaveProperty('pull_request')
    expect(workflow.on).not.toHaveProperty('pull_request_target')
    expect(workflow.permissions).toEqual({ contents: 'read' })
    const gate = workflow.jobs['verify-build']
    expect(gate?.name).toBe('Verify Build')
    expect(gate?.needs).toEqual(['build-artifacts', 'firefox-native-release'])
    expect(gate?.if).toBe(`\${{ !cancelled() }}`)
    expect(gate?.steps[0]?.env).toEqual({
      BUILD_RESULT: `\${{ needs.build-artifacts.result }}`,
      FIREFOX_RESULT: `\${{ needs.firefox-native-release.result }}`,
    })
    const script = gate?.steps[0]?.run
    if (!script) {
      throw new Error('Missing release result aggregation.')
    }
    for (const scenario of [
      ['success', 'success'],
      ['failure', 'success'],
      ['success', 'failure'],
      ['skipped', 'success'],
      ['success', 'skipped'],
      ['success', 'cancelled'],
    ]) {
      const [build, firefox] = scenario
      const result = spawnSync('bash', ['-e', '-c', script], {
        env: { ...process.env, BUILD_RESULT: build, FIREFOX_RESULT: firefox },
      })
      expect(result.status).toBe(
        build === 'success' && firefox === 'success' ? 0 : 1,
      )
    }
  })

  it('runs Chromium release E2E and the real store upgrade after the build', () => {
    const job = workflow.jobs['build-artifacts']
    const build = requireStep(job, 'bun run zip')
    const browsers = requireStep(
      job,
      'bunx playwright install --with-deps chromium firefox',
    )
    requireStep(job, 'bun run verify:production-logging')
    expect(requireStep(job, 'bun run e2e:release')).toBeGreaterThan(browsers)
    expect(
      requireStep(job, 'bun run test:production-artifact-upgrade'),
    ).toBeGreaterThan(Math.max(build, browsers))
  })

  it('runs the native Firefox persistence and capture scripts on every PR', () => {
    const job = workflow.jobs['firefox-native-release']
    const browsers = requireStep(
      job,
      'bunx playwright install --with-deps firefox',
    )
    const persistence = requireStep(job, 'bun run test:firefox:indexeddb-smoke')
    expect(persistence).toBeGreaterThan(browsers)
    expect(
      requireStep(job, 'bun tools/scripts/firefox-link-capture-smoke.ts'),
    ).toBeGreaterThan(persistence)
  })
})
