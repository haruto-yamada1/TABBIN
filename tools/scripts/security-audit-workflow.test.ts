import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const workflowPath = '.github/workflows/security-audit.yml'
const workflow = existsSync(workflowPath)
  ? parse(readFileSync(workflowPath, 'utf8'))
  : { on: {}, jobs: {} }
const steps = workflow.jobs.audit?.steps ?? []
const audit = () => steps.find((step: { id?: string }) => step.id === 'audit')
const report = () => steps.find((step: { id?: string }) => step.id === 'report')

describe('scheduled dependency security audit', () => {
  it('audits the default branch daily and permits manual and scoped PR validation', () => {
    expect(workflow.on.schedule, 'daily audit is missing').toEqual([
      { cron: '23 3 * * *' },
    ])
    expect(workflow.on).toHaveProperty('workflow_dispatch')
    expect(workflow.on.pull_request.paths).toContain(workflowPath)
    expect(workflow.on.pull_request.paths).toContain(
      'tools/scripts/security-audit-workflow.test.ts',
    )
    expect(workflow.on.pull_request_target).toBeUndefined()
    expect(workflow.permissions).toEqual({ contents: 'read' })
    expect(workflow.concurrency['cancel-in-progress']).toBe(false)
    expect(workflow.jobs.audit['timeout-minutes']).toBe(15)
    expect(steps[0].with['persist-credentials']).toBe(false)
    expect(steps[0].with?.ref).toBeUndefined()
    for (const step of steps.filter((item: { uses?: string }) => item.uses)) {
      expect(step.uses).toMatch(/@[0-9a-f]{40}$/)
    }
    expect(JSON.stringify(workflow)).not.toMatch(
      /secrets\.|continue-on-error|issues:write|pull-requests:write/,
    )
  })

  it('reuses the complete audit after the pinned toolchain and frozen install', () => {
    expect(audit(), 'security:audit step is missing').toBeDefined()
    const commands = steps.map((step: { run?: string }) => step.run)
    const install = commands.indexOf('bun install --frozen-lockfile')
    const versions = commands.indexOf('bun run verify:toolchain-versions')
    expect(versions).toBeGreaterThan(-1)
    expect(install).toBeGreaterThan(versions)
    expect(commands.indexOf(audit().run)).toBeGreaterThan(install)
    expect(audit().run).toContain('bun run security:audit')
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
    expect(pkg.scripts['security:audit']).toBe(
      'bun run verify:security-audit-policy && bun run verify:node-forge-backport && bun audit --audit-level=high',
    )
    expect(
      steps.find((step: { uses?: string }) =>
        step.uses?.startsWith('actions/setup-node@'),
      ).with['node-version-file'],
    ).toBe('.node-version')
    expect(
      steps.find((step: { uses?: string }) =>
        step.uses?.startsWith('oven-sh/setup-bun@'),
      ).with['bun-version-file'],
    ).toBe('.bun-version')
  })

  it.each([
    [0, 'No vulnerabilities found'],
    [1, 'high advisory detected'],
    [7, 'registry unavailable'],
    [9, 'backport review expired'],
  ])('preserves audit exit %i and its evidence', (exitCode, message) => {
    expect(audit(), 'security:audit step is missing').toBeDefined()
    const directory = mkdtempSync(
      path.join(tmpdir(), 'tabbin-scheduled-audit-'),
    )
    try {
      const bun = path.join(directory, 'bun')
      writeFileSync(
        bun,
        '#!/bin/sh\nprintf "%s\\n" "$AUDIT_MESSAGE"\nexit "$AUDIT_EXIT"\n',
      )
      chmodSync(bun, 0o700)
      const result = spawnSync(
        'bash',
        ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', audit().run],
        {
          env: {
            ...process.env,
            PATH: `${directory}:${process.env.PATH ?? ''}`,
            RUNNER_TEMP: directory,
            AUDIT_EXIT: String(exitCode),
            AUDIT_MESSAGE: message,
          },
          encoding: 'utf8',
        },
      )
      expect({ status: result.status, stderr: result.stderr }).toEqual({
        status: exitCode,
        stderr: '',
      })
      expect(
        readFileSync(path.join(directory, 'security-audit.log'), 'utf8'),
      ).toContain(message)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it.each([
    ['success', 'Audit passed', false],
    ['failure', 'Audit failed', true],
    ['skipped', 'Audit did not run', true],
  ])(
    'reports %s without treating an unavailable audit as success',
    (outcome, message, error) => {
      expect(report(), 'audit summary step is missing').toBeDefined()
      expect(report().if).toBe(`\${{ !cancelled() }}`)
      expect(report().env.AUDIT_OUTCOME).toBe(`\${{ steps.audit.outcome }}`)
      const directory = mkdtempSync(
        path.join(tmpdir(), 'tabbin-audit-summary-'),
      )
      const summary = path.join(directory, 'summary.md')
      try {
        const result = spawnSync(
          'bash',
          ['-e', '-o', 'pipefail', '-c', report().run],
          {
            env: {
              ...process.env,
              AUDIT_OUTCOME: outcome,
              GITHUB_STEP_SUMMARY: summary,
            },
            encoding: 'utf8',
          },
        )
        expect({ status: result.status, stderr: result.stderr }).toEqual({
          status: 0,
          stderr: '',
        })
        const summaryText = readFileSync(summary, 'utf8')
        expect(summaryText).toContain(message)
        expect(result.stdout.includes('::error')).toBe(error)
        expect(summaryText.includes('Audit passed')).toBe(!error)
      } finally {
        rmSync(directory, { recursive: true, force: true })
      }
    },
  )

  it('retains raw audit evidence after failure for bounded triage', () => {
    const artifact = steps.find((step: { uses?: string }) =>
      step.uses?.startsWith('actions/upload-artifact@'),
    )
    expect(artifact, 'audit log artifact is missing').toBeDefined()
    expect(artifact.if).toBe(
      `\${{ !cancelled() && steps.audit.outcome != 'skipped' }}`,
    )
    expect(artifact.with.path).toBe(`\${{ runner.temp }}/security-audit.log`)
    expect(artifact.with['if-no-files-found']).toBe('error')
    expect(artifact.with['retention-days']).toBe(14)
  })
})
