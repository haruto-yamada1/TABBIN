import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../..')

const runPressureScenario = (body: string, retries = 0) => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'release-e2e-pressure-'))
  try {
    const config = path.join(directory, 'playwright.config.ts')
    writeFileSync(
      config,
      `export default ${JSON.stringify({
        testDir: directory,
        outputDir: path.join(directory, 'results'),
        reporter: [[path.join(root, 'tools/testing/release-e2e-reporter.ts')]],
        forbidOnly: true,
        retries,
        workers: 1,
      })}`,
    )
    writeFileSync(
      path.join(directory, 'pressure.spec.ts'),
      `import { test, expect } from ${JSON.stringify(path.join(root, 'node_modules/@playwright/test/index.mjs'))}\n${body}`,
    )
    return spawnSync(
      process.execPath,
      [
        path.join(root, 'node_modules/@playwright/test/cli.js'),
        'test',
        '-c',
        config,
      ],
      {
        cwd: root,
        encoding: 'utf8',
        timeout: 15_000,
        env: { PATH: process.env.PATH },
      },
    )
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

const saved = "test('save @release-saved-tabs', () => {})"
const backup = "test('backup @release-backup-v2', () => {})"

describe('release E2E reporter against the real Playwright runner', () => {
  it('accepts both critical flows passing', () => {
    const result = runPressureScenario(`${saved}\n${backup}`)
    expect(result.error).toBeUndefined()
    expect(result.status).toBe(0)
  }, 20_000)

  it.each([
    ['missing critical flow', saved],
    ['skip', `${saved}\ntest.skip('backup @release-backup-v2', () => {})`],
    [
      'expected failure',
      `${saved}\ntest('backup @release-backup-v2', () => { test.fail(); expect(1).toBe(2) })`,
    ],
    [
      'failure',
      `${saved}\ntest('backup @release-backup-v2', () => { expect(1).toBe(2) })`,
    ],
    [
      'focused test',
      `${saved}\ntest.only('backup @release-backup-v2', () => {})`,
    ],
    ['empty selection', ''],
  ])(
    'rejects %s instead of allowing distribution',
    (_label, body) => {
      const result = runPressureScenario(body)
      expect(result.error).toBeUndefined()
      expect(result.status).toBe(1)
    },
    20_000,
  )

  it('rejects a retry-recovered flaky test', () => {
    const result = runPressureScenario(
      `${saved}\ntest('backup @release-backup-v2', ({}, info) => { expect(info.retry).toBe(1) })`,
      1,
    )
    expect(result.error).toBeUndefined()
    expect(result.status).toBe(1)
  }, 20_000)
})
