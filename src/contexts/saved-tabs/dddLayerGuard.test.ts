import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

type RuleEntry = string | [string, ...unknown[]]

interface OxlintOverride {
  files?: string[]
  rules?: Record<string, RuleEntry>
}

interface OxlintConfig {
  overrides?: OxlintOverride[]
}

const contextsRoot = import.meta.dirname
const repoRoot = resolve(contextsRoot, '..', '..', '..')
const oxlintrcPath = resolve(repoRoot, '.oxlintrc.json')

const loadOxlintConfig = (): OxlintConfig => {
  const raw = readFileSync(oxlintrcPath, 'utf8')
  return JSON.parse(raw) as OxlintConfig
}

const findOverride = (
  config: OxlintConfig,
  layer: string,
): OxlintOverride | undefined => {
  const pattern = `src/contexts/saved-tabs/${layer}/**`
  return config.overrides?.find((entry) =>
    entry.files?.some((file) => file.includes(pattern)),
  )
}

const collectRulePatterns = (entry: RuleEntry | undefined): string[] => {
  if (!entry) {
    return []
  }
  if (typeof entry === 'string') {
    return [entry]
  }
  const [, options] = entry
  if (!options || typeof options !== 'object') {
    return []
  }
  const optionsObj = options as Record<string, unknown>
  const pathEntries = Array.isArray(optionsObj.paths) ? optionsObj.paths : []
  const patternEntries = Array.isArray(optionsObj.patterns)
    ? optionsObj.patterns
    : []
  const names: string[] = []
  for (const value of [...pathEntries, ...patternEntries]) {
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>
      if (typeof record.name === 'string') {
        names.push(record.name)
      }
      if (typeof record.regex === 'string') {
        names.push(record.regex)
      }
    }
  }
  return names
}

const getRestrictedImportNames = (
  override: OxlintOverride | undefined,
): string[] => {
  if (!override?.rules) {
    return []
  }
  return collectRulePatterns(override.rules['eslint/no-restricted-imports'])
}

const getRestrictedGlobals = (
  override: OxlintOverride | undefined,
): string[] => {
  if (!override?.rules) {
    return []
  }
  const entry = override.rules['eslint/no-restricted-globals']
  if (!entry || typeof entry === 'string') {
    return []
  }
  const [, ...rest] = entry
  return rest.flatMap((value) => {
    if (!value || typeof value !== 'object') {
      return []
    }
    const record = value as Record<string, unknown>
    return typeof record.name === 'string' ? [record.name] : []
  })
}

const getRestrictedProperties = (
  override: OxlintOverride | undefined,
): string[] => {
  if (!override?.rules) {
    return []
  }
  const entry = override.rules['eslint/no-restricted-properties']
  if (!entry || typeof entry === 'string') {
    return []
  }
  const [, ...rest] = entry
  return rest.flatMap((value) => {
    if (!value || typeof value !== 'object') {
      return []
    }
    const record = value as Record<string, unknown>
    if (
      typeof record.object === 'string' &&
      typeof record.property === 'string'
    ) {
      return [`${record.object}.${record.property}`]
    }
    return []
  })
}

describe('src/contexts/saved-tabs DDD layer guard', () => {
  const config = loadOxlintConfig()

  it('.oxlintrc.json に overrides が定義されている', () => {
    expect(Array.isArray(config.overrides)).toBe(true)
    expect(config.overrides?.length ?? 0).toBeGreaterThan(0)
  })

  describe('domain 層', () => {
    const override = findOverride(config, 'domain')

    it('override が定義されている', () => {
      expect(override).toBeDefined()
    })

    it('react / react-dom の import を禁止している', () => {
      const names = getRestrictedImportNames(override)
      expect(names).toContain('react')
      expect(names).toContain('react-dom')
    })

    it('@/components / @/features/*/components / @/contexts/*/{application,infrastructure,presentation} への依存を禁止している', () => {
      const names = getRestrictedImportNames(override)
      expect(names.some((name) => name.includes('@/components'))).toBe(true)
      expect(
        names.some(
          (name) =>
            name.includes('@/features/') && name.includes('/components'),
        ),
      ).toBe(true)
      expect(names.some((name) => name.includes('/application'))).toBe(true)
      expect(names.some((name) => name.includes('/infrastructure'))).toBe(true)
      expect(names.some((name) => name.includes('/presentation'))).toBe(true)
    })

    it('chrome / localStorage / sessionStorage / document / window の global 参照を禁止している', () => {
      const names = getRestrictedGlobals(override)
      expect(names).toContain('chrome')
      expect(names).toContain('localStorage')
      expect(names).toContain('sessionStorage')
      expect(names).toContain('document')
      expect(names).toContain('window')
    })

    it('chrome.tabs / chrome.storage / chrome.contextMenus / chrome.alarms / chrome.notifications / chrome.runtime の直叩きを禁止している', () => {
      const names = getRestrictedProperties(override)
      expect(names).toContain('chrome.tabs')
      expect(names).toContain('chrome.storage')
      expect(names).toContain('chrome.contextMenus')
      expect(names).toContain('chrome.alarms')
      expect(names).toContain('chrome.notifications')
      expect(names).toContain('chrome.runtime')
    })
  })

  describe('application 層', () => {
    const override = findOverride(config, 'application')

    it('override が定義されている', () => {
      expect(override).toBeDefined()
    })

    it('react / react-dom の import を禁止している', () => {
      const names = getRestrictedImportNames(override)
      expect(names).toContain('react')
      expect(names).toContain('react-dom')
    })

    it('@/components / @/features/*/components / @/contexts/*/presentation への依存を禁止している', () => {
      const names = getRestrictedImportNames(override)
      expect(names.some((name) => name.includes('@/components'))).toBe(true)
      expect(
        names.some(
          (name) =>
            name.includes('@/features/') && name.includes('/components'),
        ),
      ).toBe(true)
      expect(names.some((name) => name.includes('/presentation'))).toBe(true)
    })

    it('chrome.tabs / chrome.storage / chrome.contextMenus / chrome.alarms / chrome.notifications の直叩きを禁止している', () => {
      const names = getRestrictedProperties(override)
      expect(names).toContain('chrome.tabs')
      expect(names).toContain('chrome.storage')
      expect(names).toContain('chrome.contextMenus')
      expect(names).toContain('chrome.alarms')
      expect(names).toContain('chrome.notifications')
    })
  })

  describe('infrastructure 層', () => {
    const override = findOverride(config, 'infrastructure')

    it('override が定義されている', () => {
      expect(override).toBeDefined()
    })

    it('react / react-dom の import を禁止している', () => {
      const names = getRestrictedImportNames(override)
      expect(names).toContain('react')
      expect(names).toContain('react-dom')
    })

    it('@/components / @/features/*/components / @/contexts/*/presentation への依存を禁止している', () => {
      const names = getRestrictedImportNames(override)
      expect(names.some((name) => name.includes('@/components'))).toBe(true)
      expect(
        names.some(
          (name) =>
            name.includes('@/features/') && name.includes('/components'),
        ),
      ).toBe(true)
      expect(names.some((name) => name.includes('/presentation'))).toBe(true)
    })
  })

  describe('presentation 層', () => {
    const override = findOverride(config, 'presentation')

    it('override が定義されている', () => {
      expect(override).toBeDefined()
    })

    it('chrome.storage / chrome.tabs / chrome.contextMenus / chrome.alarms の直叩きを禁止している', () => {
      const names = getRestrictedProperties(override)
      expect(names).toContain('chrome.storage')
      expect(names).toContain('chrome.tabs')
      expect(names).toContain('chrome.contextMenus')
      expect(names).toContain('chrome.alarms')
    })
  })

  describe('issue #459: presentation controller / view-model / page ファイルが追加されている', () => {
    const expectedFiles = [
      'src/contexts/saved-tabs/presentation/controllers/useSavedTabsController.ts',
      'src/contexts/saved-tabs/presentation/view-models/SavedTabsViewModel.ts',
      'src/contexts/saved-tabs/presentation/view-models/TabGroupViewModel.ts',
      'src/contexts/saved-tabs/presentation/view-models/CustomProjectViewModel.ts',
      'src/contexts/saved-tabs/presentation/pages/SavedTabsPage.tsx',
      'src/contexts/saved-tabs/presentation/routes/SavedTabsRoute.tsx',
    ]

    for (const file of expectedFiles) {
      it(`${file} が存在する`, () => {
        const source = readFileSync(resolve(repoRoot, file), 'utf8')
        expect(source.length).toBeGreaterThan(0)
      })
    }

    it('SavedTabsPage は chrome.* / localStorage / sessionStorage を import / 利用しない', () => {
      const source = readFileSync(
        resolve(
          repoRoot,
          'src/contexts/saved-tabs/presentation/pages/SavedTabsPage.tsx',
        ),
        'utf8',
      )
      expect(source).not.toMatch(/from\s+['"]chrome['"]/)
      expect(source).not.toMatch(/chrome\.storage\.local\./)
      expect(source).not.toMatch(/chrome\.tabs\./)
      expect(source).not.toMatch(/\blocalStorage\./)
      expect(source).not.toMatch(/\bsessionStorage\./)
    })

    it('useSavedTabsController は chrome.* / localStorage / sessionStorage を import / 利用しない', () => {
      const source = readFileSync(
        resolve(
          repoRoot,
          'src/contexts/saved-tabs/presentation/controllers/useSavedTabsController.ts',
        ),
        'utf8',
      )
      expect(source).not.toMatch(/from\s+['"]chrome['"]/)
      expect(source).not.toMatch(/chrome\.storage\.local\./)
      expect(source).not.toMatch(/chrome\.tabs\./)
      expect(source).not.toMatch(/\blocalStorage\./)
      expect(source).not.toMatch(/\bsessionStorage\./)
    })
  })

  describe('issue #459: infrastructure browser adapter / composition ファイルが追加されている', () => {
    const expectedFiles = [
      'src/contexts/saved-tabs/infrastructure/browser/ChromeBrowserTabAdapter.ts',
      'src/contexts/saved-tabs/infrastructure/browser/SonnerNotificationAdapter.ts',
      'src/contexts/saved-tabs/infrastructure/composition/createSavedTabsUseCasesDeps.ts',
      'src/contexts/saved-tabs/infrastructure/composition/createSavedTabsUseCases.ts',
    ]

    for (const file of expectedFiles) {
      it(`${file} が存在する`, () => {
        const source = readFileSync(resolve(repoRoot, file), 'utf8')
        expect(source.length).toBeGreaterThan(0)
      })
    }

    it('ChromeBrowserTabAdapter は application port 経由で chrome.tabs を呼ぶ', () => {
      const source = readFileSync(
        resolve(
          repoRoot,
          'src/contexts/saved-tabs/infrastructure/browser/ChromeBrowserTabAdapter.ts',
        ),
        'utf8',
      )
      expect(source).toContain('BrowserTabPort')
      expect(source).not.toMatch(/from\s+['"]@\/components/)
      expect(source).not.toMatch(/from\s+['"]@\/features\//)
    })

    it('SonnerNotificationAdapter は application port 経由で sonner を呼ぶ', () => {
      const source = readFileSync(
        resolve(
          repoRoot,
          'src/contexts/saved-tabs/infrastructure/browser/SonnerNotificationAdapter.ts',
        ),
        'utf8',
      )
      expect(source).toContain('NotificationPort')
      expect(source).not.toMatch(/from\s+['"]@\/components/)
      expect(source).not.toMatch(/from\s+['"]@\/features\//)
    })
  })

  describe('domain/repositories/ の純度 (issue #457)', () => {
    const repositoryInterfaceFiles = [
      'src/contexts/saved-tabs/domain/repositories/TabGroupRepository.ts',
      'src/contexts/saved-tabs/domain/repositories/UrlRecordRepository.ts',
      'src/contexts/saved-tabs/domain/repositories/ParentCategoryRepository.ts',
      'src/contexts/saved-tabs/domain/repositories/CustomProjectRepository.ts',
    ]

    for (const file of repositoryInterfaceFiles) {
      it(`${file} は chrome.* や storage / 副作用を import / 利用しない`, () => {
        const source = readFileSync(resolve(repoRoot, file), 'utf8')
        // コード本体に限定して import / プロパティアクセス / import パスを検査する。
        // JSDoc のテキスト説明は対象外。
        expect(source).not.toMatch(/from\s+['"]chrome['"]/)
        expect(source).not.toMatch(/from\s+['"]@\/lib\/storage/)
        expect(source).not.toMatch(/chrome\.storage\.local\./)
        expect(source).not.toMatch(/chrome\.storage\.onChanged/)
        expect(source).not.toMatch(/\blocalStorage\./)
        expect(source).not.toMatch(/\bsessionStorage\./)
        expect(source).not.toMatch(/chrome\.runtime\.sendMessage/)
      })
    }
  })

  describe('issue #469: app-level composition root が追加されている', () => {
    const appCompositionFiles = [
      'src/app/composition/createSavedTabsRepositories.ts',
      'src/app/composition/createSavedTabsPorts.ts',
      'src/app/composition/createSavedTabsUseCases.ts',
    ]

    for (const file of appCompositionFiles) {
      it(`${file} が存在する`, () => {
        const source = readFileSync(resolve(repoRoot, file), 'utf8')
        expect(source.length).toBeGreaterThan(0)
      })
    }

    it('createSavedTabsRepositories は 4 つの Chrome*Repository を組み立てる', () => {
      const source = readFileSync(
        resolve(repoRoot, 'src/app/composition/createSavedTabsRepositories.ts'),
        'utf8',
      )
      expect(source).toContain('createChromeTabGroupRepository')
      expect(source).toContain('createChromeUrlRecordRepository')
      expect(source).toContain('createChromeParentCategoryRepository')
      expect(source).toContain('createChromeCustomProjectRepository')
    })

    it('createSavedTabsPorts は ChromeBrowserTabAdapter / SonnerNotificationAdapter を組み立てる', () => {
      const source = readFileSync(
        resolve(repoRoot, 'src/app/composition/createSavedTabsPorts.ts'),
        'utf8',
      )
      expect(source).toContain('createChromeBrowserTabAdapter')
      expect(source).toContain('createSonnerNotificationAdapter')
    })

    it('createSavedTabsUseCases は 5 つの use-case を返す', () => {
      const source = readFileSync(
        resolve(repoRoot, 'src/app/composition/createSavedTabsUseCases.ts'),
        'utf8',
      )
      expect(source).toContain('createOpenSavedUrlUseCase')
      expect(source).toContain('createDeleteTabGroupUseCase')
      expect(source).toContain('createRestoreOpenedUrlsSnapshotUseCase')
      expect(source).toContain('createSyncCategoryAssignmentsUseCase')
      expect(source).toContain('createRemoveUnreferencedUrlRecordsUseCase')
    })

    it('app/composition 配下は React / @/components / @/features/*/components を import しない', () => {
      for (const file of appCompositionFiles) {
        const source = readFileSync(resolve(repoRoot, file), 'utf8')
        expect(source, `${file} should not import react`).not.toMatch(
          /from\s+['"]react['"]/,
        )
        expect(source, `${file} should not import @/components`).not.toMatch(
          /from\s+['"]@\/components/,
        )
        expect(
          source,
          `${file} should not import @/features/*/components`,
        ).not.toMatch(/from\s+['"]@\/features\/[^/]+\/components/)
      }
    })
  })

  describe('issue #469: application 層に SavedTabsUseCases 型が追加されている', () => {
    it('application/SavedTabsUseCases.ts が存在する', () => {
      const source = readFileSync(
        resolve(
          repoRoot,
          'src/contexts/saved-tabs/application/SavedTabsUseCases.ts',
        ),
        'utf8',
      )
      expect(source.length).toBeGreaterThan(0)
    })

    it('application/SavedTabsUseCases.ts は 5 つの use-case プロパティを export する', () => {
      const source = readFileSync(
        resolve(
          repoRoot,
          'src/contexts/saved-tabs/application/SavedTabsUseCases.ts',
        ),
        'utf8',
      )
      expect(source).toMatch(/openSavedUrl/)
      expect(source).toMatch(/deleteTabGroup/)
      expect(source).toMatch(/restoreOpenedUrlsSnapshot/)
      expect(source).toMatch(/syncCategoryAssignments/)
      expect(source).toMatch(/removeUnreferencedUrlRecords/)
    })

    it('application/SavedTabsUseCases.ts は React / chrome.* / 永続化 API を import しない', () => {
      const source = readFileSync(
        resolve(
          repoRoot,
          'src/contexts/saved-tabs/application/SavedTabsUseCases.ts',
        ),
        'utf8',
      )
      expect(source).not.toMatch(/from\s+['"]react['"]/)
      expect(source).not.toMatch(/from\s+['"]chrome['"]/)
      expect(source).not.toMatch(/from\s+['"]sonner['"]/)
      expect(source).not.toMatch(/chrome\.storage\./)
    })
  })
})
