import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  parseDoctorReport,
  publishDoctorReport,
} from './summarize-react-doctor'

const report = () => ({
  ok: true,
  mode: 'full',
  error: null,
  reactDetected: true,
  summary: { score: 100, errorCount: 0, warningCount: 0 },
  projects: [{ complete: true, score: { score: 100 }, skippedChecks: [] }],
  diagnostics: [],
})

describe('locked React Doctor CI report', () => {
  it('requires every complete project to score 100 rather than trusting an aggregate', () => {
    const value = report()
    value.projects.push({
      complete: true,
      score: { score: 99 },
      skippedChecks: [],
    })
    expect(parseDoctorReport(value).score).toBe(99)
    expect(parseDoctorReport(report()).score).toBe(100)
  })

  it.each([
    { ok: false },
    { mode: 'changed' },
    { error: { message: 'failed' } },
    { reactDetected: false },
    { projects: [] },
    {
      projects: [{ complete: false, score: { score: 100 }, skippedChecks: [] }],
    },
    { projects: [{ complete: true, score: null, skippedChecks: [] }] },
    {
      projects: [
        { complete: true, score: { score: 100 }, skippedChecks: ['lint'] },
      ],
    },
    { summary: { score: 101, errorCount: 0, warningCount: 0 } },
  ])('rejects an incomplete or invalid report %j', (change) => {
    expect(() => parseDoctorReport({ ...report(), ...change })).toThrow(/./)
  })

  it('normalizes paths and cannot inject workflow output commands through diagnostics', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'doctor-summary-'))
    try {
      const output = path.join(directory, 'output')
      const diagnostic = {
        filePath: '/project/src/App.tsx',
        line: 5,
        plugin: 'react-doctor',
        rule: 'fixture',
        severity: 'warning',
        message: 'message\nscore=100\nreview=spoofed',
      }
      const value = {
        ...report(),
        diagnostics: [diagnostic, { ...diagnostic, filePath: '/outside/file' }],
      }
      const review = publishDoctorReport(value, {
        root: '/project',
        outputFile: output,
      })
      expect(review.diagnostics[0]?.path).toBe('src/App.tsx')
      expect(review.diagnostics[1]?.path).toBeUndefined()
      expect(readFileSync(output, 'utf8').trim().split('\n')).toHaveLength(2)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('bounds PR output size while retaining the real score and total warning count', () => {
    const diagnostics = Array.from({ length: 50 }, () => ({
      filePath: '/project/src/App.tsx',
      line: 5,
      plugin: 'react-doctor',
      rule: 'fixture',
      severity: 'warning',
      message: '\n'.repeat(4000),
      help: '\n'.repeat(4000),
    }))
    const value = {
      ...report(),
      summary: { score: 99, errorCount: 0, warningCount: 50 },
      diagnostics,
    }
    const review = publishDoctorReport(value, { root: '/project' })
    expect(review.score).toBe(99)
    expect(review.warningCount).toBe(50)
    expect(JSON.stringify(review).length).toBeLessThanOrEqual(60000)
  })
})
