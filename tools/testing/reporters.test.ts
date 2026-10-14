import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, describe, expect, test } from 'vitest'

const require = createRequire(import.meta.url)
const vitestDir = dirname(require.resolve('vitest/package.json'))
const playwrightDir = dirname(require.resolve('@playwright/test/package.json'))
const playwrightCli = join(
  dirname(require.resolve('playwright/package.json')),
  'cli.js',
)
const reporterDir = import.meta.dirname
const directories: string[] = []
const privateText = 'https://private.example/query?token=fixture-secret'

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

function runFixture(
  runner: 'vitest' | 'playwright',
  setupFailure = false,
  extraFixture = '',
  deviceDefault = false,
) {
  const directory = mkdtempSync(join(tmpdir(), `tabbin-${runner}-flake-`))
  directories.push(directory)
  const reportPath = join(directory, 'report.json')
  const fixtureName = `${runner === 'vitest' ? 'tools' : 'e2e'}/fixture.test.ts`
  const fixturePath = join(directory, fixtureName)
  mkdirSync(dirname(fixturePath))
  const configuration = join(directory, 'config.ts')
  if (runner === 'vitest') {
    writeFileSync(
      fixturePath,
      `import {test, expect, aroundEach} from ${JSON.stringify(join(vitestDir, 'dist/index.js'))}
let attempts = 0
test(${JSON.stringify(privateText)}, {retry: 1}, () => {
  console.log(${JSON.stringify(privateText)})
  expect(++attempts).toBe(2)
})
test('final failure', {retry: 1}, () => { throw new Error(${JSON.stringify(privateText)}) })
test.skip('skipped', () => {})
test.fails('expected failure', () => { throw new Error('expected') })
${extraFixture}
`,
    )
    writeFileSync(
      configuration,
      `export default {test: {
root: ${JSON.stringify(directory)}, include: [${JSON.stringify(fixtureName)}],
name: 'node', pool: 'forks',
runner: ${JSON.stringify(join(reporterDir, 'vitest-flake-runner.ts'))},
reporters: [${JSON.stringify(join(reporterDir, 'vitest-flake-reporter.ts'))}],
${setupFailure ? `globalSetup: ${JSON.stringify(join(directory, 'setup.ts'))},` : ''}
}}`,
    )
  } else {
    writeFileSync(
      fixturePath,
      `import {test, expect} from ${JSON.stringify(join(playwrightDir, 'index.mjs'))}
test(${JSON.stringify(privateText)}, async ({}, info) => {
  console.log(${JSON.stringify(privateText)})
  expect(info.retry).toBe(1)
})
test('final failure', async () => { throw new Error(${JSON.stringify(privateText)}) })
test.skip('skipped', async () => {})
test('expected failure', async () => { test.fail(); throw new Error('expected') })
`,
    )
    writeFileSync(
      configuration,
      `export default {
testDir: ${JSON.stringify(directory)}, testMatch: '**/fixture.test.ts',
workers: 1, retries: 1,
projects: [{name: 'chromium', use: {${deviceDefault ? "defaultBrowserType: 'firefox'" : "browserName: 'chromium'"}}}],
reporter: [[${JSON.stringify(join(reporterDir, 'playwright-flake-reporter.ts'))}]],
${setupFailure ? `globalSetup: ${JSON.stringify(join(directory, 'setup.ts'))},` : ''}
}`,
    )
  }
  if (setupFailure) {
    writeFileSync(
      join(directory, 'setup.ts'),
      `export default () => { throw new Error(${JSON.stringify(privateText)}) }`,
    )
  }
  const cli =
    runner === 'vitest' ? join(vitestDir, 'vitest.mjs') : playwrightCli
  const child = spawnSync(
    process.execPath,
    [cli, runner === 'vitest' ? 'run' : 'test', '--config', configuration],
    {
      cwd: directory,
      encoding: 'utf8',
      timeout: 30_000,
      env: {
        ...process.env,
        CI: 'true',
        FLAKE_SUITE: runner === 'vitest' ? 'vitest' : 'chrome',
        FLAKE_REPORT_PATH: reportPath,
      },
    },
  )
  expect(child.error).toBeUndefined()
  expect(child.status).toBe(1)
  expect(existsSync(reportPath)).toBe(true)
  const serialized = readFileSync(reportPath, 'utf8')
  expect(serialized).not.toContain(privateText)
  expect(serialized).not.toContain('fixture-secret')
  expect(serialized).not.toContain('attachments')
  expect(serialized).not.toContain('stdout')
  return JSON.parse(serialized)
}

describe('real reporter adapters', () => {
  test.each(['vitest', 'playwright'] as const)(
    '%s preserves each retry and excludes private payloads',
    (runner) => {
      const report = runFixture(runner)
      expect(report.complete).toBe(true)
      expect(report.tests).toHaveLength(4)
      const statuses = report.tests.map(
        (item: { attempts: { status: string }[] }) =>
          item.attempts.map((attempt) => attempt.status),
      )
      expect(statuses).toContainEqual(['failed', 'passed'])
      expect(statuses).toContainEqual(['failed', 'failed'])
      expect(statuses).toContainEqual(['skipped'])
      expect(statuses).toContainEqual(['failed'])
      for (const item of report.tests) {
        expect(item.file).toBe(
          `${runner === 'vitest' ? 'tools' : 'e2e'}/fixture.test.ts`,
        )
        expect(item.project).toBe(runner === 'vitest' ? 'node' : 'chromium')
        expect(item.browser).toBe(runner === 'vitest' ? 'none' : 'chromium')
        item.attempts.forEach(
          (attempt: { index: number; durationMs: number }, index: number) => {
            expect(attempt.index).toBe(index)
            expect(attempt.durationMs).toBeGreaterThanOrEqual(0)
            expect(Number.isFinite(attempt.durationMs)).toBe(true)
          },
        )
      }
    },
  )

  test.each(['vitest', 'playwright'] as const)(
    '%s preserves global setup failure as run-level failure',
    (runner) => {
      const report = runFixture(runner, true)
      expect(report.runErrors).toBeGreaterThan(0)
      expect(report.tests).toHaveLength(0)
    },
  )

  test('Playwright records the engine selected by a device descriptor', () => {
    const report = runFixture('playwright', false, '', true)
    expect(
      report.tests.every(
        (item: { browser: string }) => item.browser === 'firefox',
      ),
    ).toBe(true)
  })

  test('Vitest reports failed repeats even when the last physical attempt passes', () => {
    const report = runFixture(
      'vitest',
      false,
      `
let repeatedAttempts = 0
test('repeated test', {repeats: 1}, () => { expect(++repeatedAttempts).toBe(2) })`,
    )
    const repeated = report.tests.find(
      (item: { attempts: { status: string }[]; frameworkStatus: string }) =>
        item.frameworkStatus === 'failed' &&
        item.attempts.at(-1)?.status === 'passed',
    )
    expect(repeated).toBeDefined()
    expect(
      repeated?.attempts.map((item: { status: string }) => item.status),
    ).toEqual(['failed', 'passed'])
  })

  test('Vitest retains failures when distinct tests have identical titles', () => {
    const report = runFixture(
      'vitest',
      false,
      `
test('identical title', () => { throw new Error('first failed') })
test('identical title', () => {})`,
    )
    expect(report.complete).toBe(true)
    expect(report.tests).toHaveLength(6)
    expect(
      new Set(report.tests.map((item: { id: string }) => item.id)).size,
    ).toBe(6)
    expect(
      report.tests.filter(
        (item: { attempts: { status: string }[] }) =>
          item.attempts.length === 1 && item.attempts[0]?.status === 'failed',
      ),
    ).toHaveLength(2)
  })

  test('Vitest reconciles failures thrown during aroundEach teardown', () => {
    const report = runFixture(
      'vitest',
      false,
      `let cleanups = 0
aroundEach(async (run, context) => {
  await run()
  if (context.task.name === 'late cleanup' && ++cleanups === 1) {
    throw new Error('cleanup')
  }
})
test('late cleanup', {retry: 1}, () => {})`,
    )
    expect(report.complete).toBe(true)
    expect(report.tests).toHaveLength(5)
    expect(
      report.tests.filter(
        (item: { attempts: { status: string }[] }) =>
          item.attempts.map((attempt) => attempt.status).join(',') ===
          'failed,passed',
      ),
    ).toHaveLength(2)
  })

  test('Vitest keeps unsupported setup attempts explicitly incomplete', () => {
    const report = runFixture(
      'vitest',
      false,
      `aroundEach(async (run, context) => {
  if (context.task.name === 'around setup') throw new Error('setup')
  await run()
})
test('around setup', {retry: 1}, () => {})`,
    )
    expect(report.complete).toBe(false)
    expect(report.tests).toHaveLength(4)
  })
})
