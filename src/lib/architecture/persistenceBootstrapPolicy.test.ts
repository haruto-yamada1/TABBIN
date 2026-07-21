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
    expect(useCaseComposition).toContain(
      'const domainLocal = getPersistenceStorageLocal()',
    )
    expect(useCaseComposition).toContain(
      'const settingsLocal = getChromeStorageLocal()',
    )
    expect(useCaseComposition).toContain(
      'createChromeUserSettingsRepository(settingsPort)',
    )
  })

  it('enforces preflight freshness and exposes app-level recovery', () => {
    const port = readRepositoryFile(
      'src/contexts/saved-tabs/application/ports/PersistenceBootstrapPort.ts',
    )
    const bootstrap = readRepositoryFile(
      'src/contexts/saved-tabs/application/services/PersistenceBootstrapService.ts',
    )
    const app = readRepositoryFile('src/entrypoints/app/main.tsx')

    expect(port).toContain('readCurrentSourceFingerprint')
    expect(port).toContain('readPreflightSourceFingerprint')
    expect(bootstrap).toContain('PERSISTENCE_PREFLIGHT_STALE')
    expect(app).toContain('<PersistenceRecoveryNotice />')
  })
})
