import { execFileSync, spawnSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

import { allowedLicenses } from './dependency-review'

const workflow = parse(
  readFileSync('.github/workflows/dependency-review.yml', 'utf8'),
)

describe('Dependency Review workflow permissions and policy', () => {
  it('rejects same-path patch edits even when bun.lock is unchanged', () => {
    const guard = workflow.jobs.review.steps.find(
      (step: { name?: string }) =>
        step.name === 'Require security review for patch changes',
    )
    expect(guard).toBeDefined()
    const directory = mkdtempSync(path.join(tmpdir(), 'tabbin-patch-review-'))
    const git = (...args: string[]) =>
      execFileSync(
        'git',
        [
          '-c',
          'commit.gpgsign=false',
          '-c',
          'user.name=Dependency Review Fixture',
          '-c',
          'user.email=fixture@example.invalid',
          ...args,
        ],
        { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
      ).trim()
    try {
      git('init')
      mkdirSync(path.join(directory, 'patches'))
      const file = path.join(directory, 'patches', 'forge.patch')
      writeFileSync(file, 'original patch\n')
      git('add', '.')
      git('commit', '-m', 'baseline')
      const baseSha = git('rev-parse', 'HEAD')
      const check = (headSha: string) =>
        spawnSync('bash', ['-c', guard.run], {
          cwd: directory,
          env: { ...process.env, BASE_SHA: baseSha, HEAD_SHA: headSha },
          encoding: 'utf8',
        }).status
      expect(check(baseSha)).toBe(0)
      writeFileSync(file, 'modified patch\n')
      git('add', '.')
      git('commit', '-m', 'same-path patch edit')
      expect(check(git('rev-parse', 'HEAD'))).toBe(1)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('runs on every PR with read-only permissions and no lifecycle execution', () => {
    expect(workflow.on.pull_request.branches).toEqual(['develop', 'main'])
    expect(workflow.on.pull_request.paths).toBeUndefined()
    expect(workflow.on.pull_request_target).toBeUndefined()
    expect(workflow.permissions).toEqual({ contents: 'read' })
    expect(workflow.jobs.review.permissions).toBeUndefined()
    const text = JSON.stringify(workflow)
    expect(text).not.toContain('secrets.')
    expect(text).not.toContain('continue-on-error')
    const steps = workflow.jobs.review.steps
    expect(steps[0].with['persist-credentials']).toBe(false)
    expect(steps[0].with.ref).toContain('github.event.pull_request.head.sha')
    expect(steps.map((step: { run?: string }) => step.run)).toContain(
      'bun install --frozen-lockfile --ignore-scripts',
    )
    for (const step of steps.filter((item: { uses?: string }) => item.uses)) {
      expect(step.uses).toMatch(/@[0-9a-f]{40}$/)
    }
  })

  it('requires both the Bun diff and GitHub action without global advisory bypasses', () => {
    const steps = workflow.jobs.review.steps
    expect(steps.map((step: { run?: string }) => step.run)).toContain(
      'bun tools/scripts/run-dependency-review.ts',
    )
    const review = steps.find((step: { uses?: string }) =>
      step.uses?.startsWith('actions/dependency-review-action@'),
    )
    expect(review.with['fail-on-severity']).toBe('high')
    expect(review.with['fail-on-scopes'].split(', ')).toEqual([
      'runtime',
      'development',
      'unknown',
    ])
    expect(review.with['allow-licenses'].split(', ')).toEqual(allowedLicenses)
    expect(review.with['license-check']).toBe(true)
    expect(review.with['vulnerability-check']).toBe(true)
    expect(review.with['warn-only']).toBe(false)
    expect(review.with['comment-summary-in-pr']).toBe('never')
    expect(review.with['allow-ghsas']).toBeUndefined()
    expect(review.with['allow-dependencies-licenses']).toBeUndefined()
  })
})
