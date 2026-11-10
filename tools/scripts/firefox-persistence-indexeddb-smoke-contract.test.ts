import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const repoRoot = path.resolve(import.meta.dirname, '../..')

const requiredFiles = {
  ci: '.github/workflows/ci.yml',
  harness: 'e2e/support/firefox-persistence-indexeddb-harness.ts',
  package: 'package.json',
  runner: 'tools/scripts/firefox-persistence-indexeddb-smoke.ts',
  environment: 'tools/scripts/firefoxSmokeEnvironment.ts',
} as const

const academyUiResult = {
  status: 'passed',
  academyUI: {
    englishDirect: true,
    japaneseKeyboard: true,
    narrowDarkReducedMotion: true,
    revisit: true,
    persistenceUnchanged: true,
    screenGuide: true,
    parentGuide: true,
    quality: {
      lessonPaths: 8,
      videoVariants: 16,
      captionLanguages: ['ja', 'en'],
      noAutoplay: true,
      manualPlayback: true,
      progressIndependent: true,
      persistenceUnchanged: true,
      tabsUnchanged: true,
    },
    domainPractice: {
      parentComplete: true,
      childComplete: true,
      reorderComplete: true,
      restoreSimulated: true,
      rewindResetSkip: true,
      japaneseNarrow: true,
      nativeCalls: 0,
      persistenceUnchanged: true,
      tabsUnchanged: true,
    },
  },
}

const runAcademySpec = ({
  flag = '',
  commandStatus = 0,
  smokeResult = academyUiResult,
} = {}) => {
  const temporaryRoot = mkdtempSync(
    path.join(os.tmpdir(), 'tabbin-firefox-academy-contract-'),
  )
  const commandArgsPath = path.join(temporaryRoot, 'command-args.json')
  try {
    // Exercise the real Playwright spec without launching a browser or building
    // artifacts. The native command's stdout includes build logs before JSON.
    writeFileSync(
      path.join(temporaryRoot, 'bun'),
      `#!${process.execPath}
const fs = require('node:fs')
fs.writeFileSync(${JSON.stringify(commandArgsPath)}, JSON.stringify(process.argv.slice(2)))
process.stdout.write('WXT build output\\n{ "build": "completed" }\\n')
process.stdout.write(JSON.stringify(${JSON.stringify(smokeResult)}, null, 2) + '\\n')
process.exit(${String(commandStatus)})
`,
      { mode: 0o700 },
    )
    const result = spawnSync(
      process.execPath,
      [
        path.join(repoRoot, 'node_modules/@playwright/test/cli.js'),
        'test',
        '--config',
        'playwright.firefox.config.ts',
        'firefox.extension.academy.spec.ts',
        '--workers=1',
        '--reporter=json',
        '--output',
        path.join(temporaryRoot, 'test-results'),
      ],
      {
        cwd: repoRoot,
        encoding: 'utf8',
        timeout: 15_000,
        env: {
          ...process.env,
          CI: '',
          FIREFOX_EXTENSION_SMOKE: flag,
          FLAKE_REPORT_PATH: '',
          PATH: `${temporaryRoot}${path.delimiter}${process.env.PATH ?? ''}`,
        },
      },
    )
    const commandArgs: unknown = existsSync(commandArgsPath)
      ? JSON.parse(readFileSync(commandArgsPath, 'utf8'))
      : undefined
    return { ...result, commandArgs }
  } finally {
    rmSync(temporaryRoot, { force: true, recursive: true })
  }
}

const readRequired = (relativePath: string): string => {
  const absolutePath = path.join(repoRoot, relativePath)
  expect(existsSync(absolutePath), `${relativePath} must exist`).toBe(true)
  return existsSync(absolutePath) ? readFileSync(absolutePath, 'utf8') : ''
}

describe('Firefox IndexedDB persistence smoke contract', () => {
  it('requires native capture failure evidence before accepting a fresh Firefox result', () => {
    const harness = readRequired(requiredFiles.harness)
    const runner = readRequired(requiredFiles.runner)
    expect(harness).toContain(
      'captureSafety: await runFirefoxCaptureSafetySmoke()',
    )
    expect(runner).toContain('assert.deepEqual(result.captureSafety, {')
    for (const fact of [
      'directFailures: 16',
      'toolbarFailures: 16',
      'fixtureTabs: 3',
      'tabsUnchanged: true',
      'persistenceUnchanged: true',
      'settingsUnchanged: true',
      'restored: true',
    ]) {
      expect(runner).toContain(fact)
    }
  })

  it('requires native settings safety evidence before accepting a fresh Firefox result', () => {
    const harness = readRequired(requiredFiles.harness)
    const runner = readRequired(requiredFiles.runner)
    expect(harness).toContain(
      'settingsSafety: await runFirefoxSettingsSafetySmoke()',
    )
    expect(runner).toContain('assert.deepEqual(result.settingsSafety, {')
    for (const fact of [
      'firstUseDefaults',
      'legacyReadUnchanged',
      'legacyUpgradePreserved',
      'invalidReadRejected',
      'invalidWriteRejected',
      'invalidUnchanged',
      'resetDefaults',
      'restored',
    ]) {
      expect(runner).toContain(`${fact}: true`)
    }
  })

  it('owns a dedicated non-skippable WebDriver restart scenario', () => {
    const runner = readRequired(requiredFiles.runner)

    expect(runner).not.toMatch(/\.skip\s*\(|test\.fixme/u)
    expect(runner).toContain('resolveFirefoxSmokeEnvironment')
    expect(readRequired(requiredFiles.environment)).toContain(
      'GECKODRIVER_PATH',
    )
    expect(runner).toContain("runHarnessPhase(session, 'fresh')")
    expect(runner).toContain("runHarnessPhase(session, 'verify')")
    expect(runner).toContain('deleteSession')
  })

  it('opens IndexedDB directly and proves stale legacy metadata is inert', () => {
    const harness = readRequired(requiredFiles.harness)

    expect(harness).toContain('createPersistenceBootstrapRuntime')
    expect(harness).not.toMatch(
      /MigrationPreflight|ChromeRawLegacy|DataPlaneRouter|MigrationTarget/u,
    )
    expect(harness).toContain('createIndexedDbSavedTabsUseCases')
    expect(harness).toContain('IndexedDbSavedTabsQueryAdapter')
    expect(harness).toContain('createExportBackupV2UseCase')
    expect(harness).toContain('obsoleteStorageAfterWrite')
    expect(harness).toContain('withoutStorageAccess')
    expect(harness).toContain('recoveryAfterRetry')
  })

  it('reports an explicit unsupported executable blocker instead of skipping', () => {
    const runner = readRequired(requiredFiles.runner)

    expect(readRequired(requiredFiles.environment)).toContain(
      'FIREFOX_INDEXEDDB_SMOKE_UNSUPPORTED_EXECUTABLE',
    )
    expect(runner).not.toContain('isFirefoxExtensionSmokeEnabled')
  })

  it('exposes an unmasked package command for the IndexedDB smoke', () => {
    const packageJson = JSON.parse(
      readRequired(requiredFiles.package),
    ) as unknown
    expect(packageJson).toBeTypeOf('object')
    const scripts = (packageJson as { scripts?: Record<string, string> })
      .scripts
    const command = scripts?.['test:firefox:indexeddb-smoke']

    expect(command).toContain(
      'tools/scripts/firefox-persistence-indexeddb-smoke.ts',
    )
    expect(command).not.toMatch(/\|\|\s*true|--pass-with-no-tests/u)
    expect(command?.split(' && ')).toEqual([
      'bun run verify:firefox-smoke-environment',
      'bun run build:firefox',
      'bun run build:firefox:indexeddb-smoke-harness',
      'bun tools/scripts/firefox-persistence-indexeddb-smoke.ts',
    ])

    const ci = readRequired(requiredFiles.ci)
    expect(ci).toContain('bun run test:firefox:indexeddb-smoke')
  })
})

describe('Academy Firefox Playwright smoke contract', () => {
  it('fails when Domain practice omits its committed reorder proof', () => {
    const domainPractice = { ...academyUiResult.academyUI.domainPractice }
    Reflect.deleteProperty(domainPractice, 'reorderComplete')
    const result = runAcademySpec({
      flag: '1',
      smokeResult: {
        ...academyUiResult,
        academyUI: { ...academyUiResult.academyUI, domainPractice },
      },
    })
    expect(result.error).toBeUndefined()
    expect(result.status).toBe(1)
    expect(result.stdout).toContain('"unexpected": 1')
  }, 20_000)

  it.each(['screenGuide', 'parentGuide', 'domainPractice', 'quality'] as const)(
    'fails when the native result omits the %s runtime proof',
    (field) => {
      const facts = { ...academyUiResult.academyUI }
      Reflect.deleteProperty(facts, field)
      const result = runAcademySpec({
        flag: '1',
        smokeResult: { ...academyUiResult, academyUI: facts },
      })
      expect(result.error).toBeUndefined()
      expect(result.status).toBe(1)
      expect(result.stdout).toContain('"unexpected": 1')
    },
    20_000,
  )

  it.each(['', 'true'])(
    'does not run the native command when FIREFOX_EXTENSION_SMOKE=%j',
    (flag) => {
      const result = runAcademySpec({ flag })
      expect(result.error).toBeUndefined()
      expect(result.status).toBe(0)
      expect(result.stdout).toContain('"skipped": 1')
      expect(result.commandArgs).toBeUndefined()
    },
    20_000,
  )

  it('runs the prepared package command and validates JSON after build logs when opted in', () => {
    const result = runAcademySpec({ flag: '1' })
    expect(result.error).toBeUndefined()
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('"expected": 1')
    expect(result.commandArgs).toEqual(['run', 'test:firefox:indexeddb-smoke'])
  }, 20_000)

  it('fails on a nonzero native command even when stdout claims success', () => {
    const result = runAcademySpec({ flag: '1', commandStatus: 1 })
    expect(result.error).toBeUndefined()
    expect(result.status).toBe(1)
    expect(result.stdout).toContain('"unexpected": 1')
  }, 20_000)

  it('fails when the native command does not prove every Academy UI assertion', () => {
    const result = runAcademySpec({
      flag: '1',
      smokeResult: {
        ...academyUiResult,
        academyUI: { ...academyUiResult.academyUI, revisit: false },
      },
    })
    expect(result.error).toBeUndefined()
    expect(result.status).toBe(1)
    expect(result.stdout).toContain('"unexpected": 1')
  }, 20_000)
})

describe('Academy Firefox UI CI prerequisites', () => {
  it('prepares the native harness and executable paths before the Playwright startup smoke', () => {
    const workflow = parse(readRequired(requiredFiles.ci)) as {
      jobs: Record<
        string,
        { steps: { run?: string; env?: Record<string, string> }[] }
      >
    }
    const job = Object.values(workflow.jobs).find((item) =>
      item.steps.some((step) => step.run === 'bun run test:firefox:smoke'),
    )
    expect(job).toBeDefined()
    const steps = job?.steps ?? []
    const smokeIndex = steps.findIndex(
      (step) => step.run === 'bun run test:firefox:smoke',
    )
    const buildIndex = steps.findIndex(
      (step) => step.run === 'bun run build:firefox:indexeddb-smoke-harness',
    )
    expect(buildIndex).toBeGreaterThan(-1)
    expect(buildIndex).toBeLessThan(smokeIndex)
    expect(steps[smokeIndex]?.env?.GECKODRIVER_PATH).toBe('/tmp/geckodriver')
    expect(steps[smokeIndex]?.env?.FIREFOX_EXECUTABLE_PATH).toBe(
      `\${{ steps.firefox-executable.outputs.path }}`,
    )
  })
})
