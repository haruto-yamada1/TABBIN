import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const repositoryPath = (path: string): string => resolve(process.cwd(), path)

const readRepositoryFile = (path: string): string =>
  readFileSync(repositoryPath(path), 'utf8')

const persistenceBootstrapFiles = [
  'src/app/composition/persistenceStorageLocal.ts',
  'src/contexts/saved-tabs/application/ports/PersistenceBootstrapPort.ts',
  'src/contexts/saved-tabs/application/services/PersistenceBootstrapService.ts',
  'src/contexts/saved-tabs/application/services/PersistenceControlStateService.ts',
  'src/contexts/saved-tabs/application/services/PersistenceOperationGateService.ts',
  'src/contexts/saved-tabs/application/services/PersistenceRecoveryService.ts',
  'src/contexts/saved-tabs/infrastructure/browser/WebLocksPersistenceCoordinationAdapter.ts',
  'src/contexts/saved-tabs/infrastructure/persistence/control-plane/ChromePersistenceControlStateRepository.ts',
  'src/app/composition/PersistenceRecoveryNotice.tsx',
] as const

const legacyPersistencePaths = [
  'src/features/ai-chat/lib/conversation-history.ts',
  'src/features/analytics/routes/AnalyticsRoute.tsx',
  'src/features/analytics/routes/analyticsRoute.helpers.ts',
  'src/features/options/lib/import-export/flows.ts',
  'src/lib/background/expired-tabs.ts',
  'src/lib/background/ai-chat.ts',
  'src/lib/background/url-storage.ts',
  'src/lib/storage/analytics.ts',
  'src/lib/storage/categories.ts',
  'src/lib/storage/migration.ts',
  'src/lib/storage/projects.ts',
  'src/lib/storage/tabs.ts',
  'src/lib/storage/url-migration.ts',
  'src/lib/storage/urls.ts',
] as const

const gatedChromeRepositoryPaths = [
  'src/contexts/saved-tabs/infrastructure/persistence/chrome-storage/ChromeCustomProjectRepository.ts',
  'src/contexts/saved-tabs/infrastructure/persistence/chrome-storage/ChromeDomainCategoryMappingRepository.ts',
  'src/contexts/saved-tabs/infrastructure/persistence/chrome-storage/ChromeDomainCategorySettingsRepository.ts',
  'src/contexts/saved-tabs/infrastructure/persistence/chrome-storage/ChromeParentCategoryRepository.ts',
  'src/contexts/saved-tabs/infrastructure/persistence/chrome-storage/ChromeTabGroupRepository.ts',
  'src/contexts/saved-tabs/infrastructure/persistence/chrome-storage/ChromeUrlRecordRepository.ts',
] as const

describe('PersistenceBootstrap architecture policy', () => {
  it('keeps the bootstrap, control state, operation gate, and adapters explicit', () => {
    for (const path of persistenceBootstrapFiles) {
      expect(existsSync(repositoryPath(path))).toBe(true)
    }
  })

  it('documents the authoritative control plane and fail-closed barrier', () => {
    const model = readRepositoryFile(
      'docs/architecture/persistence-model-v2.md',
    )
    const indexedDb = readRepositoryFile(
      'docs/architecture/indexeddb-persistence.md',
    )

    for (const contract of [
      'tabbin:persistenceControlState:v2',
      'cutover-pending',
      'read-only-emergency',
      'TRUSTED_CONTEXTS',
      'PERSISTENCE_COORDINATION_UNAVAILABLE',
    ]) {
      expect(`${model}\n${indexedDb}`).toContain(contract)
    }
  })

  it('keeps every Issue #727 production path in the enforced inventory', () => {
    const inventory = readRepositoryFile(
      'docs/architecture/current-storage-writer-inventory.md',
    )

    for (const path of [
      'URL save / delete',
      'saved-tabs query',
      'collection mutation',
      'options import/export read',
      'analytics query',
      'AI saved URL context build',
      'expiration / cleanup job',
      'context menu save',
      'background tab created handler',
    ]) {
      expect(inventory).toContain(path)
    }
  })

  it('routes every legacy persistence path through the shared facade', () => {
    for (const path of legacyPersistencePaths) {
      const source = readRepositoryFile(path)
      const executableSource = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
      expect(source).toContain(
        "from '@/app/composition/persistenceStorageLocal'",
      )
      expect(executableSource).not.toMatch(/\bchrome\.storage\.local\b/)
      expect(executableSource).not.toContain('getChromeStorageLocal')
    }
  })

  it('requires the operation gate at both IndexedDB boundaries', () => {
    for (const path of [
      'src/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceSnapshotReader.ts',
      'src/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceUnitOfWork.ts',
    ]) {
      const source = readRepositoryFile(path)
      expect(source).toContain('PersistenceOperationGatePort')
      expect(source).toMatch(/runIndexedDb(?:Read|Write)/)
    }
  })

  it('requires an injected gated port for every Chrome domain repository', () => {
    for (const path of gatedChromeRepositoryPaths) {
      const source = readRepositoryFile(path)
      expect(source).not.toContain('getChromeStorageLocal')
      expect(source).not.toMatch(/port:[^=\n,)]*=/)
    }
  })

  it('keeps settings outside the migrated domain route after cutover', () => {
    const composition = readRepositoryFile(
      'src/app/composition/createSavedTabsRepositories.ts',
    )
    const useCaseComposition = readRepositoryFile(
      'src/contexts/saved-tabs/infrastructure/composition/createSavedTabsUseCasesDeps.ts',
    )

    expect(composition).toContain(
      'createChromeStorageLocalPort(getPersistenceStorageLocal())',
    )
    expect(composition).toContain(
      'createChromeStorageLocalPort(getChromeStorageLocal())',
    )
    expect(composition).toContain(
      'createChromeUserSettingsRepository(settingsPort)',
    )
    // 同一型の位置引数による誤配線を防ぐため、名前付き引数で domain / settings
    // storage の対応を明示的に検証する (CodeRabbit review)。
    expect(useCaseComposition).toMatch(
      /domainLocal:\s*getPersistenceStorageLocal\(\)/,
    )
    expect(useCaseComposition).toMatch(
      /settingsLocal:\s*getChromeStorageLocal\(\)/,
    )
    expect(useCaseComposition).toContain(
      'createChromeUserSettingsRepository(settingsPort)',
    )
  })

  it('production composition calls createSelectedLegacySavedTabsUseCasesDeps and routes the result', () => {
    // 関数名の定義 / import だけでは通らないよう、実際の呼び出し形状と
    // route-aware use-case composition への結線を検証する (CodeRabbit review)。
    const productionComposition = readRepositoryFile(
      'src/app/composition/createSavedTabsUseCases.ts',
    )

    // import 文 (`createSelectedLegacySavedTabsUseCasesDeps,`) ではなく
    // 呼び出し (`createSelectedLegacySavedTabsUseCasesDeps(`) を検出する。
    expect(productionComposition).toMatch(
      /createSelectedLegacySavedTabsUseCasesDeps\s*\(/,
    )
    // 呼び出し結果を route-aware な use-case composition へ渡している。
    expect(productionComposition).toMatch(
      /createRouteAwareSavedTabsUseCases\s*\(\s*\{/,
    )
    expect(productionComposition).toMatch(
      /createApplicationSavedTabsUseCases\s*\(\s*deps\s*\)/,
    )
  })

  it('enforces preflight freshness, silent startup, and app-level recovery', () => {
    const port = readRepositoryFile(
      'src/contexts/saved-tabs/application/ports/PersistenceBootstrapPort.ts',
    )
    const bootstrap = readRepositoryFile(
      'src/contexts/saved-tabs/application/services/PersistenceBootstrapService.ts',
    )
    const app = readRepositoryFile('src/entrypoints/app/main.tsx')
    const preflightController = readRepositoryFile(
      'src/app/composition/createMigrationPreflightController.ts',
    )
    const preflightPort = readRepositoryFile(
      'src/contexts/saved-tabs/application/ports/MigrationPreflightPort.ts',
    )
    const preflightRuntime = readRepositoryFile(
      'src/contexts/saved-tabs/infrastructure/composition/migrationPreflightRuntime.ts',
    )
    const rawReader = readRepositoryFile(
      'src/contexts/saved-tabs/infrastructure/persistence/chrome-storage/ChromeRawLegacyStorageReader.ts',
    )

    expect(port).toContain('readCurrentSourceFingerprint')
    expect(port).toContain('readPreflightSourceFingerprint')
    expect(bootstrap).toContain('PERSISTENCE_PREFLIGHT_STALE')
    expect(app).toContain('<PersistenceRecoveryNotice />')
    expect(app).toContain('getMigrationPreflightController')
    expect(app).toContain('runMigrationPreflight()')
    expect(app).not.toContain('<MigrationPreflightNotice />')
    expect(preflightController).not.toContain('copyDiagnostic')
    expect(preflightController).not.toContain('backupCurrentData')
    expect(preflightPort).toContain('readHealthySourceFingerprint')
    expect(preflightRuntime).toContain(
      'getPersistenceBootstrapRuntime().coordination',
    )
    expect(rawReader).toContain('MIGRATION_SOURCE_KEYS')
    expect(rawReader).not.toContain('.set(')
    expect(rawReader).not.toContain('getSavedTabs')
    expect(rawReader).not.toContain('getCustomProjects')
  })

  it('requires the post-cutover forward-fix runbook and release guard', () => {
    const runbookPath = 'docs/runbooks/persistence-v2-emergency.md'
    expect(existsSync(repositoryPath(runbookPath))).toBe(true)
    if (!existsSync(repositoryPath(runbookPath))) {
      return
    }

    const runbook = readRepositoryFile(runbookPath)
    const release = readRepositoryFile('docs/release.md')
    const packageJson = readRepositoryFile('package.json')
    const releaseMetadata = readRepositoryFile(
      'src/public/persistence-release.json',
    )
    const backupCompositions = [
      'src/app/composition/optionsBackupRecovery.ts',
      'src/app/composition/optionsBackupV2Export.ts',
      'src/app/composition/optionsLegacyBackupMerge.ts',
    ].map(readRepositoryFile)

    for (const contract of [
      'pre-IDB',
      'forward-fix',
      'read-only-emergency',
      'minimumCompatibleAppVersion',
      'destructiveSchemaChange',
      'queryWriteContractCompatible',
      'git tag',
      'verify:persistence-release-compatibility',
    ]) {
      expect(`${runbook}\n${release}\n${releaseMetadata}`).toContain(contract)
    }
    expect(packageJson).toContain('verify:persistence-release-compatibility')
    for (const composition of backupCompositions) {
      expect(composition).toContain('readUserSettingsWithoutRepair')
    }
  })
})
