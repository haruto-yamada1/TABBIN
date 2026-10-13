import { execFileSync, spawnSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  chmodSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import JSON5 from 'json5'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { z } from 'zod'

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
      const scriptDirectory = path.join(directory, 'tools/scripts')
      mkdirSync(scriptDirectory, { recursive: true })
      for (const name of [
        'verify-dependency-patches.ts',
        'dependency-patch-policy.ts',
      ]) {
        writeFileSync(
          path.join(scriptDirectory, name),
          readFileSync(`tools/scripts/${name}`),
        )
      }
      // A hostile patched dependency must never run before the patch gate.
      for (const name of ['json5', 'zod']) {
        const moduleDirectory = path.join(directory, 'node_modules', name)
        mkdirSync(moduleDirectory, { recursive: true })
        writeFileSync(
          path.join(moduleDirectory, 'package.json'),
          JSON.stringify({ name, type: 'module', main: 'index.js' }),
        )
        writeFileSync(
          path.join(moduleDirectory, 'index.js'),
          'export default {}; export const z = {}; process.exit(0)\n',
        )
      }
      git('init')
      mkdirSync(path.join(directory, 'patches'))
      const file = path.join(directory, 'patches', 'forge.patch')
      writeFileSync(file, 'original patch\n')
      writeFileSync(
        path.join(directory, 'bun.lock'),
        JSON.stringify({ packages: {} }),
      )
      git('add', '.')
      git('commit', '-m', 'baseline')
      const baseSha = git('rev-parse', 'HEAD')
      const check = (headSha: string, comparisonBase = baseSha) =>
        spawnSync(
          'bash',
          [
            '-c',
            guard.run.replace(
              'tools/scripts/verify-dependency-patches.ts',
              '"$PATCH_VERIFIER"',
            ),
          ],
          {
            cwd: directory,
            env: {
              ...process.env,
              BASE_SHA: comparisonBase,
              HEAD_SHA: headSha,
              PATCH_VERIFIER: path.join(
                scriptDirectory,
                'verify-dependency-patches.ts',
              ),
            },
            encoding: 'utf8',
          },
        ).status
      expect(check(baseSha)).toBe(0)
      writeFileSync(file, 'modified patch\n')
      git('add', '.')
      git('commit', '-m', 'same-path patch edit')
      expect(check(git('rev-parse', 'HEAD'))).toBe(1)

      rmSync(path.join(directory, 'node_modules'), {
        recursive: true,
        force: true,
      })
      writeFileSync(file, 'original patch\n')
      const reviewedPath =
        'patches/@stryker-mutator%2Fvitest-runner@10.0.0.patch'
      const reviewedId = '@stryker-mutator/vitest-runner@10.0.0'
      const current = z
        .object({ packages: z.record(z.string(), z.unknown()) })
        .parse(JSON5.parse<unknown>(readFileSync('bun.lock', 'utf8')))
      writeFileSync(
        path.join(directory, reviewedPath),
        readFileSync(reviewedPath),
      )
      writeFileSync(
        path.join(directory, 'bun.lock'),
        JSON.stringify({
          packages: {
            runner: current.packages['@stryker-mutator/vitest-runner'],
          },
          patchedDependencies: { [reviewedId]: reviewedPath },
        }),
      )
      git('add', '.')
      git('commit', '-m', 'reviewed patch addition')
      const reviewedSha = git('rev-parse', 'HEAD')
      expect(check(reviewedSha)).toBe(0)
      expect(check(reviewedSha, reviewedSha)).toBe(0)
      chmodSync(path.join(directory, reviewedPath), 0o755)
      git('add', '.')
      git('commit', '-m', 'unreviewed patch mode change')
      expect(check(git('rev-parse', 'HEAD'), reviewedSha)).toBe(1)
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
    expect(
      workflow.jobs.review.steps.findIndex(
        (step: { name?: string }) =>
          step.name === 'Require security review for patch changes',
      ),
    ).toBeLessThan(
      workflow.jobs.review.steps.findIndex(
        (step: { name?: string }) =>
          step.name === 'Install dependencies without lifecycle scripts',
      ),
    )
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
