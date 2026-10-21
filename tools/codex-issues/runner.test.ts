import { spawnSync } from 'node:child_process'
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  chmodSync,
  cpSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { decideResult, validateManifest } from './contract'
import { classifyFailure, evaluateIssues, loadManifest } from './runner'
import { summarizeEvents } from './runtime'
import { guardedPackage } from './scope'
import { inspectTestReport } from './test-report'

const entry = {
  id: 'default-language',
  issue: 675,
  startCommit: 'a'.repeat(40),
  prompt: 'Restore the documented language behavior.',
  allowedPaths: ['src/constants/language.ts'],
  hiddenTest: 'cases/default-language/hidden.test.txt',
  hiddenTestTarget: 'src/constants/issue-eval.test.ts',
  project: 'node',
  referencePatch: 'cases/default-language/reference.patch',
  regressionTests: ['src/constants/language.test.ts'],
  expectedHiddenTests: 3,
  expectedRegressionTests: 1,
}

describe('independent issue evaluation contract', () => {
  it('pins three independent cases and accepts only source edits', () => {
    const cases = [0, 1, 2].map((index) => ({
      ...entry,
      id: `case-${index}`,
      issue: 675 + index,
    }))
    expect(validateManifest({ version: 1, cases })).toEqual({
      version: 1,
      cases,
    })
  })

  it.each([
    '../outside.ts',
    '/tmp/outside.ts',
    'src/example.test.ts',
    '.git/config',
    'src/../package.json',
  ])('rejects unsafe edit scope %s', (file) => {
    const cases = [0, 1, 2].map((index) => ({
      ...entry,
      id: `case-${index}`,
      issue: 675 + index,
      allowedPaths: [file],
    }))
    expect(() => validateManifest({ version: 1, cases })).toThrow(
      /Only production|Expected a normalized/,
    )
  })

  it.each(['manifest', 'case', 'additionalHiddenTest'])(
    'rejects unknown fields in the strict %s boundary',
    (level) => {
      const cases = [0, 1, 2].map((index) => ({
        ...entry,
        id: `case-${index}`,
        issue: 675 + index,
        ...(level === 'case' ? { unexpected: true } : {}),
        ...(level === 'additionalHiddenTest'
          ? {
              additionalHiddenTests: [
                {
                  hiddenTest: 'cases/extra.txt',
                  hiddenTestTarget: 'src/extra.test.ts',
                  unexpected: true,
                },
              ],
            }
          : {}),
      }))
      expect(() =>
        validateManifest({
          version: 1,
          cases,
          ...(level === 'manifest' ? { unexpected: true } : {}),
        }),
      ).toThrow(/Unrecognized key/)
    },
  )

  it('never accepts an agent self-report, skipped gate or missing usage', () => {
    const result = {
      completed: true,
      timedOut: false,
      outputLimit: false,
      exitCode: 0,
      invalidEvents: false,
      inputTokens: 10,
      outputTokens: 2,
      withinScope: true,
      gates: [true, true, true, true],
      maxTokens: 100,
    }
    expect(decideResult(result)).toBe('passed')
    expect(decideResult({ ...result, gates: [true, false, true] })).toBe(
      'grading_failed',
    )
    expect(decideResult({ ...result, inputTokens: null })).toBe(
      'usage_unavailable',
    )
    expect(decideResult({ ...result, completed: false })).toBe('agent_failed')
    expect(decideResult({ ...result, withinScope: false })).toBe(
      'scope_violation',
    )
    expect(decideResult({ ...result, maxTokens: 1 })).toBe('budget_exceeded')
    expect(decideResult({ ...result, timedOut: true })).toBe('timeout')
  })

  it.each(['', '{"type":"turn.completed","usage":{}}'])(
    'stops later inference when usage cannot be observed',
    (stream) => {
      const observed = summarizeEvents(stream)
      expect(
        decideResult({
          ...observed,
          timedOut: false,
          outputLimit: false,
          exitCode: 0,
          withinScope: true,
          gates: [true, true, true, true],
          maxTokens: 100,
        }),
      ).toBe('usage_unavailable')
    },
  )

  it('protects dependency, script and imports policy from package edits', () => {
    const before = JSON.stringify({
      scripts: { test: 'vitest' },
      imports: { '#existing': './src/existing.ts' },
    })
    expect(
      guardedPackage(
        before,
        JSON.stringify({
          scripts: { test: 'vitest' },
          imports: {
            '#existing': './src/existing.ts',
            '#default-language': './src/constants/language.ts',
          },
        }),
      ),
    ).toBe(true)
    expect(
      guardedPackage(
        before,
        JSON.stringify({ scripts: { test: 'true' }, imports: {} }),
      ),
    ).toBe(false)
    expect(
      guardedPackage(
        before,
        JSON.stringify({
          scripts: { test: 'vitest' },
          imports: { '#existing': '/tmp/answer.ts' },
        }),
      ),
    ).toBe(false)
  })

  it('accepts a different safe alias for the allowlisted language policy', () => {
    const before =
      '{"scripts":{"test":"vitest"},"imports":{"#existing":"./src/existing.ts"}}'
    const after =
      '{"scripts":{"test":"vitest"},"imports":{"#existing":"./src/existing.ts","#language-policy":"./src/constants/language.ts"}}'
    expect(guardedPackage(before, after)).toBe(true)
  })

  it('accepts only semantically equivalent package ordering', () => {
    const before =
      '{"scripts":{"test":"vitest"},"imports":{"#existing":"./src/existing.ts"}}'
    const after =
      '{"imports":{"#default-language":"./src/constants/language.ts","#existing":"./src/existing.ts"},"scripts":{"test":"vitest"}}'
    expect(guardedPackage(before, after)).toBe(true)
  })

  it('verifies the real pinned resource pack without model inference', () => {
    const root = path.resolve(import.meta.dirname, '../..')
    expect(loadManifest(root).cases).toHaveLength(3)
  })

  it.each([
    { mode: 'mock', run: false, cadence: 'change', ci: '' },
    { mode: 'real', run: false, cadence: 'change', ci: '' },
    { mode: 'real', run: true, cadence: 'change', ci: '1' },
    { mode: 'real', run: true, cadence: 'weekly', ci: '' },
  ] as const)(
    'handles $mode/$cadence/run=$run/CI=$ci without pinned history',
    async (options) => {
      const directory = mkdtempSync(path.join(tmpdir(), 'issue-shallow-'))
      const originalCi = process.env.CI
      try {
        const source = path.resolve(import.meta.dirname, '../..')
        for (const file of ['AGENTS.md', '.apm', 'evals/codex-issues']) {
          cpSync(path.join(source, file), path.join(directory, file), {
            recursive: true,
          })
        }
        const git = (args: string[]) => {
          const result = spawnSync(
            'git',
            ['-c', 'core.hooksPath=/dev/null', ...args],
            {
              cwd: directory,
              encoding: 'utf8',
            },
          )
          expect(result.status).toBe(0)
          return result.stdout.trim()
        }
        git(['init', '--quiet'])
        git([
          '-c',
          'user.name=Evaluation',
          '-c',
          'user.email=eval@example.invalid',
          'commit',
          '--allow-empty',
          '--quiet',
          '-m',
          'Shallow fixture',
        ])
        writeFileSync(
          path.join(directory, '.git/shallow'),
          `${git(['rev-parse', 'HEAD'])}\n`,
        )
        expect(git(['rev-parse', '--is-shallow-repository'])).toBe('true')
        process.env.CI = options.ci
        const output = path.join(directory, 'report')
        const result = await evaluateIssues({
          root: directory,
          output,
          ...options,
          optIn: false,
          model: 'gpt-6.1-sol',
          effort: 'high',
          seconds: 300,
          maxTokens: 500000,
        })
        const report = JSON.parse(
          readFileSync(path.join(output, 'results.json'), 'utf8'),
        )
        expect(result).toBe(options.mode === 'mock')
        expect(report.status).toBe(
          options.mode === 'mock' ? 'mock_passed' : 'skipped',
        )
        expect(() => loadManifest(directory, directory, true)).toThrow(
          /Git preparation failed|Pinned start commit/,
        )
      } finally {
        if (originalCi === undefined) {
          delete process.env.CI
        } else {
          process.env.CI = originalCi
        }
        rmSync(directory, { recursive: true, force: true })
      }
    },
  )

  it('retains pinned history and hidden-test replacement checks for grading', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'issue-history-'))
    try {
      const source = path.resolve(import.meta.dirname, '../..')
      cpSync(path.join(source, 'evals'), path.join(directory, 'evals'), {
        recursive: true,
      })
      const git = (args: string[]) => {
        const result = spawnSync(
          'git',
          ['-c', 'core.hooksPath=/dev/null', ...args],
          { cwd: directory, encoding: 'utf8' },
        )
        expect(result.status).toBe(0)
        return result.stdout.trim()
      }
      git(['init', '--quiet'])
      git([
        '-c',
        'user.name=Evaluation',
        '-c',
        'user.email=eval@example.invalid',
        'commit',
        '--allow-empty',
        '--quiet',
        '-m',
        'Pinned fixture',
      ])
      const manifestPath = path.join(
        directory,
        'evals/codex-issues/manifest.json',
      )
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
      const save = (commit: string) => {
        for (const item of manifest.cases) {
          item.startCommit = commit
        }
        writeFileSync(manifestPath, JSON.stringify(manifest))
      }
      save(git(['rev-parse', 'HEAD']))
      expect(loadManifest(directory, directory, true).cases).toHaveLength(3)
      const target = manifest.cases[0].hiddenTestTarget
      mkdirSync(path.dirname(path.join(directory, target)), { recursive: true })
      writeFileSync(path.join(directory, target), 'existing test')
      git(['add', target])
      git([
        '-c',
        'user.name=Evaluation',
        '-c',
        'user.email=eval@example.invalid',
        'commit',
        '--quiet',
        '-m',
        'Existing test',
      ])
      save(git(['rev-parse', 'HEAD']))
      expect(() => loadManifest(directory, directory, true)).toThrow(
        'Hidden grader must not replace a test',
      )
      save('a'.repeat(40))
      expect(() => loadManifest(directory, directory, true)).toThrow(
        /Git preparation failed|Pinned start commit/,
      )
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('classifies quiet JSON-reported assertion failures from valid evidence', () => {
    const report = inspectTestReport(
      JSON.stringify({
        numTotalTests: 1,
        numPassedTests: 0,
        numFailedTests: 1,
        numPendingTests: 0,
        testResults: [{ assertionResults: [{ status: 'failed' }] }],
      }),
      1,
    )
    expect(report.valid).toBe(true)
    expect(classifyFailure('JSON report written to scratch', report)).toBe(
      'test_failure',
    )
    expect(
      classifyFailure('permission denied', {
        valid: false,
        passed: false,
        failures: null,
      }),
    ).toBe('sandbox_denied')
    expect(classifyFailure('', inspectTestReport('{}', 1))).toBe('tool_failure')
  })

  it.each(['mock', 'real'])(
    'keeps %s results distinct and never runs real without opt-in',
    (mode) => {
      const directory = mkdtempSync(path.join(tmpdir(), 'issue-eval-contract-'))
      try {
        const output = path.join(directory, 'report')
        const root = path.resolve(import.meta.dirname, '../..')
        const result = spawnSync(
          'bun',
          ['tools/scripts/evaluate-codex-issues.ts', mode, '--output', output],
          { cwd: root, encoding: 'utf8', timeout: 15000 },
        )
        const report = JSON.parse(
          readFileSync(path.join(output, 'results.json'), 'utf8'),
        )
        expect(result.status).toBe(mode === 'mock' ? 0 : 1)
        expect(report.status).toBe(mode === 'mock' ? 'mock_passed' : 'skipped')
        expect(JSON.stringify(report)).not.toContain(directory)
      } finally {
        rmSync(directory, { recursive: true, force: true })
      }
    },
  )

  it.each(['real', 'baseline'])(
    'records %s preflight safely when Codex is unavailable',
    (mode) => {
      const directory = mkdtempSync(
        path.join(tmpdir(), 'issue-preflight-test-'),
      )
      try {
        const bin = path.join(directory, 'bin')
        mkdirSync(bin)
        const fake = path.join(bin, 'codex')
        writeFileSync(fake, '#!/bin/sh\nexit 42\n')
        chmodSync(fake, 0o700)
        const output = path.join(directory, 'report')
        const root = path.resolve(import.meta.dirname, '../..')
        const result = spawnSync(
          'bun',
          ['tools/scripts/evaluate-codex-issues.ts', mode, '--output', output],
          {
            cwd: root,
            encoding: 'utf8',
            timeout: 15000,
            env: {
              ...process.env,
              PATH: `${bin}:${process.env.PATH ?? '/usr/bin:/bin'}`,
            },
          },
        )
        const report = JSON.parse(
          readFileSync(path.join(output, 'results.json'), 'utf8'),
        )
        expect(result.status).toBe(1)
        expect(report.status).toBe(
          mode === 'real' ? 'skipped' : 'infrastructure_failed',
        )
        expect(report.configuration.codex).toBeNull()
        expect(JSON.stringify(report)).not.toContain(directory)
      } finally {
        rmSync(directory, { recursive: true, force: true })
      }
    },
  )
})
