import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const repoRoot = path.resolve(import.meta.dirname, '../..')

const requiredFiles = {
  ci: '.github/workflows/ci.yml',
  harness: 'e2e/support/firefox-persistence-indexeddb-harness.ts',
  package: 'package.json',
  runner: 'tools/scripts/firefox-persistence-indexeddb-smoke.ts',
} as const

const readRequired = (relativePath: string): string => {
  const absolutePath = path.join(repoRoot, relativePath)
  expect(existsSync(absolutePath), `${relativePath} must exist`).toBe(true)
  return existsSync(absolutePath) ? readFileSync(absolutePath, 'utf8') : ''
}

describe('Firefox IndexedDB persistence smoke contract', () => {
  it('owns a dedicated non-skippable WebDriver restart scenario', () => {
    const runner = readRequired(requiredFiles.runner)

    expect(runner).not.toMatch(/\.skip\s*\(|test\.fixme/u)
    expect(runner).toContain('GECKODRIVER_PATH')
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

    expect(runner).toContain('FIREFOX_INDEXEDDB_SMOKE_UNSUPPORTED_EXECUTABLE')
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

    const ci = readRequired(requiredFiles.ci)
    expect(ci).toContain('bun run test:firefox:indexeddb-smoke')
  })
})
