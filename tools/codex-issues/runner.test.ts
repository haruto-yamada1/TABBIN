import { spawnSync } from 'node:child_process'
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  chmodSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { decideResult, validateManifest } from './contract'
import { loadManifest } from './runner'
import { summarizeEvents } from './runtime'
import { guardedPackage } from './scope'

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
