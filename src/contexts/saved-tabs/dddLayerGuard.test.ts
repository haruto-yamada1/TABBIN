import { readFileSync, readdirSync, statSync } from 'node:fs'
import { relative, resolve, sep } from 'node:path'

import { describe, expect, expectTypeOf, it } from 'vitest'

import type {
  PersistenceChangeEvent,
  PersistenceChangePort,
  PersistenceChangeScope,
} from '@/contexts/saved-tabs/application/ports/PersistenceChangePort'
import type { PersistenceChangeScope as UnitOfWorkPersistenceChangeScope } from '@/contexts/saved-tabs/application/ports/PersistenceV2UnitOfWorkPort'

type RuleEntry = string | [string, ...unknown[]]

type OxlintOverride = {
  files?: string[]
  rules?: Record<string, RuleEntry>
}

type OxlintConfig = {
  overrides?: OxlintOverride[]
}

const contextsRoot = import.meta.dirname
const repoRoot = resolve(contextsRoot, '..', '..', '..')
const oxlintrcPath = resolve(repoRoot, '.oxlintrc.json')
const dependencyCruiserConfigPath = resolve(repoRoot, '.dependency-cruiser.cjs')

const loadOxlintConfig = (): OxlintConfig => {
  const raw = readFileSync(oxlintrcPath, 'utf8')
  return JSON.parse(raw) as OxlintConfig
}

const findOverride = (
  config: OxlintConfig,
  layer: string,
  ruleName?: string,
): OxlintOverride | undefined => {
  // issue #581: DDD override は saved-tabs 固定ではなく src/contexts/* に一般化されている
  const pattern = `src/contexts/*/${layer}/**`
  return config.overrides?.find(
    (entry) =>
      entry.files?.some((file) => file.includes(pattern)) &&
      (!ruleName || Object.hasOwn(entry.rules ?? {}, ruleName)),
  )
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

const getRestrictedGlobalMessages = (
  override: OxlintOverride | undefined,
): Record<string, string> => {
  if (!override?.rules) {
    return {}
  }
  const entry = override.rules['eslint/no-restricted-globals']
  if (!entry || typeof entry === 'string') {
    return {}
  }
  const [, ...rest] = entry
  return Object.fromEntries(
    rest.flatMap((value) => {
      if (!value || typeof value !== 'object') {
        return []
      }
      const record = value as Record<string, unknown>
      if (
        typeof record.name === 'string' &&
        typeof record.message === 'string'
      ) {
        return [[record.name, record.message]]
      }
      return []
    }),
  )
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

const collectSourceFiles = (dir: string): string[] => {
  const result: string[] = []
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return result
  }
  for (const entry of entries) {
    const fullPath = resolve(dir, entry)
    let stats
    try {
      stats = statSync(fullPath)
    } catch {
      continue
    }
    if (stats.isDirectory()) {
      result.push(...collectSourceFiles(fullPath))
      continue
    }
    if (!stats.isFile()) {
      continue
    }
    if (entry.endsWith('.test.ts') || entry.endsWith('.test.tsx')) {
      continue
    }
    if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
      result.push(fullPath)
    }
  }
  return result
}

const collectTestFiles = (dir: string): string[] => {
  const result: string[] = []
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return result
  }
  for (const entry of entries) {
    const fullPath = resolve(dir, entry)
    let stats
    try {
      stats = statSync(fullPath)
    } catch {
      continue
    }
    if (stats.isDirectory()) {
      result.push(...collectTestFiles(fullPath))
      continue
    }
    if (!stats.isFile()) {
      continue
    }
    if (
      entry.endsWith('.test.ts') ||
      entry.endsWith('.test.tsx') ||
      entry.endsWith('.spec.ts') ||
      entry.endsWith('.spec.tsx')
    ) {
      result.push(fullPath)
    }
  }
  return result
}

// JSDoc / コメント内の言及は対象外とするため、検査対象 source から
// ブロックコメント / 行コメントを除去する純粋関数 (issue #582 と同方針)。
// 各テストで定義していた重複 helper を module-level に集約した (issue #648 review)。
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

describe('src/contexts/saved-tabs DDD layer guard', () => {
  const config = loadOxlintConfig()
  const dependencyCruiserSource = readFileSync(
    dependencyCruiserConfigPath,
    'utf8',
  )

  it('.oxlintrc.json に overrides が定義されている', () => {
    expect(Array.isArray(config.overrides)).toBe(true)
    expect(config.overrides?.length ?? 0).toBeGreaterThan(0)
  })

  describe('issue #581: DDD override は src/contexts/* に一般化されている', () => {
    // saved-tabs 固定の glob に戻らないことを担保する。
    // 新しい context が追加されても同じ DDD 制約が自動で効く状態を維持する。
    it('domain / application / presentation の override が src/contexts/*/** を使用している', () => {
      for (const layer of ['domain', 'application', 'presentation']) {
        const override = findOverride(config, layer)
        expect(
          override,
          `${layer} 層の override が見つかりません`,
        ).toBeDefined()
        const hasGeneralized = override?.files?.some((file) =>
          file.includes(`src/contexts/*/${layer}/**`),
        )
        expect(
          hasGeneralized,
          `${layer} 層の override は src/contexts/*/${layer}/** を使用してください`,
        ).toBe(true)
        const hasSavedTabsSpecific = override?.files?.some((file) =>
          file.includes(`src/contexts/saved-tabs/${layer}/**`),
        )
        expect(
          hasSavedTabsSpecific,
          `${layer} 層の override は saved-tabs 固定に戻さないでください`,
        ).toBeFalsy()
      }
    })
  })

  describe('issue #590: public-api.ts の barrel 例外は最小範囲に限定する', () => {
    it('src/contexts/*/public-api.ts のみ oxc/no-barrel-file を例外許可する', () => {
      const barrelFileOverrides =
        config.overrides?.filter(
          (entry) => entry.rules?.['oxc/no-barrel-file'] === 'off',
        ) ?? []

      expect(barrelFileOverrides).toEqual([
        {
          files: ['src/contexts/*/public-api.ts'],
          rules: {
            'oxc/no-barrel-file': 'off',
          },
        },
      ])
    })
  })

  describe('issue #643: production src は同期 browser dialog global を直接使わない', () => {
    const expectedProductionSrcFiles = [
      'src/contexts/**/*.{ts,tsx}',
      'src/features/**/*.{ts,tsx}',
      'src/components/**/*.{ts,tsx}',
      'src/lib/**/*.{ts,tsx}',
      'src/entrypoints/**/*.{ts,tsx}',
    ]

    const productionDialogOverride = config.overrides?.find((entry) =>
      expectedProductionSrcFiles.every((file) => entry.files?.includes(file)),
    )

    it('production src 限定の override が定義されている', () => {
      expect(productionDialogOverride).toBeDefined()
      expect(productionDialogOverride?.files).toStrictEqual(
        expectedProductionSrcFiles,
      )
    })

    it('test / story / tools / config / docs / e2e へ過剰適用していない', () => {
      const files = productionDialogOverride?.files ?? []
      expect(files).not.toContain('tools/**/*.ts')
      expect(files).not.toContain('*.config.ts')
      expect(files).not.toContain('docs/**/*.md')
      expect(files).not.toContain('e2e/**/*.ts')

      const testOverride = config.overrides?.find((entry) =>
        entry.files?.includes('**/*.test.ts'),
      )
      const storyOverride = config.overrides?.find((entry) =>
        entry.files?.includes('**/*.stories.tsx'),
      )
      expect(testOverride?.rules?.['eslint/no-restricted-globals']).toBe('off')
      expect(storyOverride?.rules?.['eslint/no-restricted-globals']).toBe('off')
      expect(testOverride?.rules?.['eslint/no-restricted-properties']).toBe(
        'off',
      )
      expect(storyOverride?.rules?.['eslint/no-restricted-properties']).toBe(
        'off',
      )
    })

    it('alert / confirm / prompt を no-restricted-globals で error にしている', () => {
      const entry =
        productionDialogOverride?.rules?.['eslint/no-restricted-globals']
      expect(entry).toBeDefined()
      expect(Array.isArray(entry)).toBe(true)
      expect(entry?.[0]).toBe('error')

      const names = getRestrictedGlobals(productionDialogOverride)
      expect(names).toContain('alert')
      expect(names).toContain('confirm')
      expect(names).toContain('prompt')
    })

    it('window / globalThis 経由の alert / confirm / prompt も禁止している', () => {
      const names = getRestrictedProperties(productionDialogOverride)
      expect(names).toContain('window.alert')
      expect(names).toContain('window.confirm')
      expect(names).toContain('window.prompt')
      expect(names).toContain('globalThis.alert')
      expect(names).toContain('globalThis.confirm')
      expect(names).toContain('globalThis.prompt')
    })

    it('代替 UI への移行方針を message で示している', () => {
      const messages = getRestrictedGlobalMessages(productionDialogOverride)
      expect(messages.alert).toContain('toast')
      expect(messages.alert).toContain('dialog component')
      expect(messages.confirm).toContain('確認 dialog component')
      expect(messages.prompt).toContain('form')
      expect(messages.prompt).toContain('dialog component')
    })
  })

  describe('domain 層', () => {
    const globalsOverride = findOverride(
      config,
      'domain',
      'eslint/no-restricted-globals',
    )
    const propertiesOverride = findOverride(
      config,
      'domain',
      'eslint/no-restricted-properties',
    )

    it('override が定義されている', () => {
      expect(globalsOverride).toBeDefined()
      expect(propertiesOverride).toBeDefined()
    })

    it('UI / routing / notification / animation 系 package の import を禁止している', () => {
      expect(dependencyCruiserSource).toContain(
        "name: 'no-domain-to-ui-packages'",
      )
    })

    it('@/components / @/features/*/components / @/contexts/*/{application,infrastructure,presentation} への依存を禁止している', () => {
      expect(dependencyCruiserSource).toContain("name: 'no-domain-to-ui'")
      expect(dependencyCruiserSource).toContain(
        "name: 'no-domain-to-outer-layer'",
      )
    })

    it('chrome / localStorage / sessionStorage / indexedDB / document / window の global 参照を禁止している', () => {
      const names = getRestrictedGlobals(globalsOverride)
      expect(names).toContain('chrome')
      expect(names).toContain('localStorage')
      expect(names).toContain('sessionStorage')
      expect(names).toContain('document')
      expect(names).toContain('window')
      // issue #646: indexedDB も storage adapter 経由に限定
      expect(names).toContain('indexedDB')
    })

    it('chrome.tabs / chrome.storage / chrome.contextMenus / chrome.alarms / chrome.notifications / chrome.runtime の直叩きを禁止している', () => {
      const names = getRestrictedProperties(propertiesOverride)
      expect(names).toContain('chrome.tabs')
      expect(names).toContain('chrome.storage')
      expect(names).toContain('chrome.contextMenus')
      expect(names).toContain('chrome.alarms')
      expect(names).toContain('chrome.notifications')
      expect(names).toContain('chrome.runtime')
    })

    it('issue #646: window.localStorage / window.sessionStorage / window.indexedDB / browser.storage の直叩きを禁止している', () => {
      const names = getRestrictedProperties(propertiesOverride)
      expect(names).toContain('window.localStorage')
      expect(names).toContain('window.sessionStorage')
      expect(names).toContain('window.indexedDB')
      expect(names).toContain('browser.storage')
    })

    it('issue #582: Date.now() を no-restricted-properties で禁止している', () => {
      const names = getRestrictedProperties(propertiesOverride)
      expect(names).toContain('Date.now')
    })

    it('issue #642: Math.random() を no-restricted-properties で禁止している', () => {
      const names = getRestrictedProperties(propertiesOverride)
      expect(names).toContain('Math.random')
    })

    it('issue #642: crypto.randomUUID() を no-restricted-properties で禁止している', () => {
      const names = getRestrictedProperties(propertiesOverride)
      expect(names).toContain('crypto.randomUUID')
    })

    it('issue #642: domain 層のソースファイルが Math.random( / crypto.randomUUID( を直接使わない', () => {
      const domainRoot = resolve(repoRoot, 'src/contexts/saved-tabs/domain')
      const domainSourceFiles = collectSourceFiles(domainRoot)
      expect(domainSourceFiles.length).toBeGreaterThan(0)
      for (const absolutePath of domainSourceFiles) {
        const relativePath = relative(repoRoot, absolutePath)
          .split(sep)
          .join('/')
        const source = stripComments(readFileSync(absolutePath, 'utf8'))
        expect(
          source,
          `${relativePath} should not call Math.random() directly (use RandomPort / IdGeneratorPort)`,
        ).not.toMatch(/\bMath\.random\s*\(/)
        expect(
          source,
          `${relativePath} should not call crypto.randomUUID() directly (use IdGeneratorPort)`,
        ).not.toMatch(/\bcrypto\.randomUUID\s*\(/)
      }
    })

    it('issue #582: domain 層のソースファイルが Date.now( / new Date( を直接使わない', () => {
      // JSDoc やコメント内の言及は対象外とする。
      // 検出したいのは「現在時刻の取得」という
      // 副作用での実際のコード呼び出しのみ。
      const domainRoot = resolve(repoRoot, 'src/contexts/saved-tabs/domain')
      const domainSourceFiles = collectSourceFiles(domainRoot)
      expect(domainSourceFiles.length).toBeGreaterThan(0)
      for (const absolutePath of domainSourceFiles) {
        const relativePath = relative(repoRoot, absolutePath)
          .split(sep)
          .join('/')
        const source = stripComments(readFileSync(absolutePath, 'utf8'))
        expect(
          source,
          `${relativePath} should not call Date.now() directly (use ClockPort)`,
        ).not.toMatch(/\bDate\.now\s*\(/)
        expect(
          source,
          `${relativePath} should not call new Date() directly (use ClockPort)`,
        ).not.toMatch(/\bnew\s+Date\s*\(/)
      }
    })

    it('issue #648: fetch の直接利用を no-restricted-globals で禁止している', () => {
      const names = getRestrictedGlobals(globalsOverride)
      expect(names).toContain('fetch')
    })

    it('issue #648: domain 層のソースファイルが fetch( を直接呼ばない', () => {
      // JSDoc / コメント内の言及は対象外とする (issue #582 と同じ stripComments 方針)。
      // domain 層は fetch を直接呼ばず、HttpClientPort / AiClientPort /
      // repository / adapter 経由で外部通信する (issue #648)。
      const domainRoot = resolve(repoRoot, 'src/contexts/saved-tabs/domain')
      const domainSourceFiles = collectSourceFiles(domainRoot)
      expect(domainSourceFiles.length).toBeGreaterThan(0)
      for (const absolutePath of domainSourceFiles) {
        const relativePath = relative(repoRoot, absolutePath)
          .split(sep)
          .join('/')
        const source = stripComments(readFileSync(absolutePath, 'utf8'))
        expect(
          source,
          `${relativePath} should not call fetch() directly (use HttpClientPort / AiClientPort / adapter 経由)`,
        ).not.toMatch(/\bfetch\s*\(/)
      }
    })
  })

  describe('application 層', () => {
    const propertiesOverride = findOverride(
      config,
      'application',
      'eslint/no-restricted-properties',
    )
    const globalsOverride = findOverride(
      config,
      'application',
      'eslint/no-restricted-globals',
    )

    it('override が定義されている', () => {
      expect(propertiesOverride).toBeDefined()
      expect(globalsOverride).toBeDefined()
    })

    it('issue #646: localStorage / sessionStorage / indexedDB の global 参照を禁止している', () => {
      const names = getRestrictedGlobals(globalsOverride)
      expect(names).toContain('localStorage')
      expect(names).toContain('sessionStorage')
      expect(names).toContain('indexedDB')
    })

    it('issue #646: window.localStorage / window.sessionStorage / window.indexedDB / browser.storage の直叩きを禁止している', () => {
      const names = getRestrictedProperties(propertiesOverride)
      expect(names).toContain('window.localStorage')
      expect(names).toContain('window.sessionStorage')
      expect(names).toContain('window.indexedDB')
      expect(names).toContain('browser.storage')
    })

    it('UI / routing / notification / animation 系 package の import を禁止している', () => {
      expect(dependencyCruiserSource).toContain(
        "name: 'no-application-to-ui-packages'",
      )
    })

    it('@/components / @/features/*/components / @/contexts/*/presentation への依存を禁止している', () => {
      expect(dependencyCruiserSource).toContain("name: 'no-application-to-ui'")
      expect(dependencyCruiserSource).toContain(
        "name: 'no-application-to-presentation'",
      )
    })

    it('chrome.tabs / chrome.storage / chrome.contextMenus / chrome.alarms / chrome.notifications の直叩きを禁止している', () => {
      const names = getRestrictedProperties(propertiesOverride)
      expect(names).toContain('chrome.tabs')
      expect(names).toContain('chrome.storage')
      expect(names).toContain('chrome.contextMenus')
      expect(names).toContain('chrome.alarms')
      expect(names).toContain('chrome.notifications')
    })

    it('issue #642: Date.now() を no-restricted-properties で禁止している', () => {
      const names = getRestrictedProperties(propertiesOverride)
      expect(names).toContain('Date.now')
    })

    it('issue #642: Math.random() を no-restricted-properties で禁止している', () => {
      const names = getRestrictedProperties(propertiesOverride)
      expect(names).toContain('Math.random')
    })

    it('issue #642: crypto.randomUUID() を no-restricted-properties で禁止している', () => {
      const names = getRestrictedProperties(propertiesOverride)
      expect(names).toContain('crypto.randomUUID')
    })

    it('issue #642: application 層のソースファイルが Date.now( / new Date( / Math.random( / crypto.randomUUID( を直接使わない', () => {
      const appRoot = resolve(repoRoot, 'src/contexts/saved-tabs/application')
      const appSourceFiles = collectSourceFiles(appRoot)
      expect(appSourceFiles.length).toBeGreaterThan(0)
      for (const absolutePath of appSourceFiles) {
        const relativePath = relative(repoRoot, absolutePath)
          .split(sep)
          .join('/')
        const source = stripComments(readFileSync(absolutePath, 'utf8'))
        expect(
          source,
          `${relativePath} should not call Date.now() directly (use ClockPort)`,
        ).not.toMatch(/\bDate\.now\s*\(/)
        expect(
          source,
          `${relativePath} should not call new Date() directly (use ClockPort)`,
        ).not.toMatch(/\bnew\s+Date\s*\(/)
        expect(
          source,
          `${relativePath} should not call Math.random() directly (use RandomPort / IdGeneratorPort)`,
        ).not.toMatch(/\bMath\.random\s*\(/)
        expect(
          source,
          `${relativePath} should not call crypto.randomUUID() directly (use IdGeneratorPort)`,
        ).not.toMatch(/\bcrypto\.randomUUID\s*\(/)
      }
    })

    it('issue #648: fetch の直接利用を no-restricted-globals で禁止している', () => {
      const names = getRestrictedGlobals(globalsOverride)
      expect(names).toContain('fetch')
    })

    it('issue #648: application 層のソースファイルが fetch( を直接呼ばない', () => {
      // JSDoc / コメント内の言及は対象外とする (issue #582 と同じ stripComments 方針)。
      // application 層は fetch を直接呼ばず、HttpClientPort / AiClientPort /
      // repository / adapter 経由で外部通信する (issue #648)。
      const appRoot = resolve(repoRoot, 'src/contexts/saved-tabs/application')
      const appSourceFiles = collectSourceFiles(appRoot)
      expect(appSourceFiles.length).toBeGreaterThan(0)
      for (const absolutePath of appSourceFiles) {
        const relativePath = relative(repoRoot, absolutePath)
          .split(sep)
          .join('/')
        const source = stripComments(readFileSync(absolutePath, 'utf8'))
        expect(
          source,
          `${relativePath} should not call fetch() directly (use HttpClientPort / AiClientPort / adapter 経由)`,
        ).not.toMatch(/\bfetch\s*\(/)
      }
    })
  })

  describe('infrastructure 層', () => {
    it('react / react-dom の import を禁止している', () => {
      expect(dependencyCruiserSource).toContain(
        "name: 'no-infrastructure-to-react'",
      )
    })

    it('@/components / @/features/*/components / @/contexts/*/presentation への依存を禁止している', () => {
      expect(dependencyCruiserSource).toContain(
        "name: 'no-infrastructure-to-ui'",
      )
      expect(dependencyCruiserSource).toContain(
        "name: 'no-infrastructure-to-presentation'",
      )
    })
  })

  describe('presentation 層', () => {
    const propertiesOverride = findOverride(
      config,
      'presentation',
      'eslint/no-restricted-properties',
    )
    const globalsOverride = findOverride(
      config,
      'presentation',
      'eslint/no-restricted-globals',
    )

    it('override が定義されている', () => {
      expect(propertiesOverride).toBeDefined()
      expect(globalsOverride).toBeDefined()
    })

    it('issue #646: localStorage / sessionStorage / indexedDB の global 参照を禁止している', () => {
      const names = getRestrictedGlobals(globalsOverride)
      expect(names).toContain('localStorage')
      expect(names).toContain('sessionStorage')
      expect(names).toContain('indexedDB')
    })

    it('issue #646: window.localStorage / window.sessionStorage / window.indexedDB / browser.storage の直叩きを禁止している', () => {
      const names = getRestrictedProperties(propertiesOverride)
      expect(names).toContain('window.localStorage')
      expect(names).toContain('window.sessionStorage')
      expect(names).toContain('window.indexedDB')
      expect(names).toContain('browser.storage')
    })

    it('chrome.storage / chrome.tabs / chrome.contextMenus / chrome.alarms / chrome.runtime の直叩きを禁止している', () => {
      const names = getRestrictedProperties(propertiesOverride)
      expect(names).toContain('chrome.storage')
      expect(names).toContain('chrome.tabs')
      expect(names).toContain('chrome.contextMenus')
      expect(names).toContain('chrome.alarms')
      // issue #531: `chrome.runtime.sendMessage` などの background 通信
      // 直叩きも presentation 層ガードで再発防止する。
      expect(names).toContain('chrome.runtime')
    })
  })

  describe('issue #511: domain 層は @/types/storage に依存しない', () => {
    it('dependency-cruiser に storage type 依存禁止 rule が定義されている', () => {
      expect(dependencyCruiserSource).toContain(
        "name: 'no-domain-to-storage-types'",
      )
    })

    it('domain 配下の全 .ts / .tsx ファイルが @/types/storage を import / 利用しない', () => {
      const domainRoot = resolve(repoRoot, 'src/contexts/saved-tabs/domain')
      const domainSourceFiles = collectSourceFiles(domainRoot)
      expect(domainSourceFiles.length).toBeGreaterThan(0)
      for (const absolutePath of domainSourceFiles) {
        const relativePath = relative(repoRoot, absolutePath)
          .split(sep)
          .join('/')
        const source = readFileSync(absolutePath, 'utf8')
        expect(
          source,
          `${relativePath} should not import @/types/storage`,
        ).not.toMatch(/from\s+['"]@\/types\/storage['"]/)
      }
    })
  })

  describe('issue #583: presentation test は domain 層を直接 import しない', () => {
    it('dependency-cruiser に presentation test → domain 依存禁止 rule が定義されている', () => {
      expect(dependencyCruiserSource).toContain(
        "name: 'no-presentation-tests-to-domain'",
      )
    })

    it('presentation 配下の test / spec ファイルが domain を直接 import していない', () => {
      const presentationRoot = resolve(
        repoRoot,
        'src/contexts/saved-tabs/presentation',
      )
      const presentationTestFiles = collectTestFiles(presentationRoot)
      expect(presentationTestFiles.length).toBeGreaterThan(0)
      for (const absolutePath of presentationTestFiles) {
        const relativePath = relative(repoRoot, absolutePath)
          .split(sep)
          .join('/')
        const source = readFileSync(absolutePath, 'utf8')
        expect(
          source,
          `${relativePath} should not import from domain/`,
        ).not.toMatch(/import\s+['"][^'"]*domain\/|from\s+['"][^'"]*domain\//)
      }
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

  describe('issue #459: browser adapter / composition / application factory が追加されている', () => {
    const expectedFiles = [
      'src/contexts/saved-tabs/infrastructure/browser/ChromeBrowserTabAdapter.ts',
      'src/contexts/saved-tabs/infrastructure/browser/SonnerNotificationAdapter.ts',
      'src/contexts/saved-tabs/infrastructure/composition/createSavedTabsUseCasesDeps.ts',
      'src/contexts/saved-tabs/application/createSavedTabsUseCases.ts',
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

  describe('issue #495: chrome.storage.onChanged を StorageChangePort 経由へ移行', () => {
    const expectedFiles = [
      'src/contexts/saved-tabs/application/ports/StorageChangePort.ts',
      'src/contexts/saved-tabs/infrastructure/browser/ChromeStorageChangeAdapter.ts',
    ]

    for (const file of expectedFiles) {
      it(`${file} が存在する`, () => {
        const source = readFileSync(resolve(repoRoot, file), 'utf8')
        expect(source.length).toBeGreaterThan(0)
      })
    }

    it('StorageChangePort は chrome API を import / 利用しない', () => {
      const source = readFileSync(
        resolve(
          repoRoot,
          'src/contexts/saved-tabs/application/ports/StorageChangePort.ts',
        ),
        'utf8',
      )
      expect(source).not.toMatch(/from\s+['"]chrome['"]/)
      // JSDoc 内の言及は除外するため、import / プロパティアクセスを厳密検出
      expect(source).not.toMatch(/chrome\.storage\.(local|onChanged|sync)\.\w/)
      expect(source).not.toMatch(/chrome\.storage\.(local|onChanged|sync)\(/)
    })

    it('ChromeStorageChangeAdapter は StorageChangePort を実装し chrome.storage.onChanged を含む', () => {
      const source = readFileSync(
        resolve(
          repoRoot,
          'src/contexts/saved-tabs/infrastructure/browser/ChromeStorageChangeAdapter.ts',
        ),
        'utf8',
      )
      expect(source).toContain('StorageChangePort')
      expect(source).toContain('getChromeStorageOnChanged')
      expect(source).not.toMatch(/from\s+['"]@\/components/)
      expect(source).not.toMatch(/from\s+['"]@\/features\//)
    })

    it('createSavedTabsUseCasesDeps は storageChangePort を組み立てる', () => {
      const source = readFileSync(
        resolve(
          repoRoot,
          'src/contexts/saved-tabs/infrastructure/composition/createSavedTabsUseCasesDeps.ts',
        ),
        'utf8',
      )
      expect(source).toContain('storageChangePort')
      expect(source).toContain('createChromeStorageChangeAdapter')
    })

    it('createSavedTabsPorts は storageChangePort を組み立てる', () => {
      const source = readFileSync(
        resolve(repoRoot, 'src/app/composition/createSavedTabsPorts.ts'),
        'utf8',
      )
      expect(source).toContain('storageChangePort')
      expect(source).toContain('createChromeStorageChangeAdapter')
    })

    it('SavedTabsApp は chrome.storage.onChanged を直接呼び出さない', () => {
      const source = readFileSync(
        resolve(
          repoRoot,
          'src/contexts/saved-tabs/presentation/app/SavedTabsApp.tsx',
        ),
        'utf8',
      )
      expect(source).not.toMatch(
        /chrome\.storage\.onChanged\.(addListener|removeListener)/,
      )
      expect(source).toContain('storageChangePort')
    })

    it('useCategoryKeywordModal は chrome.storage.onChanged を直接呼び出さない', () => {
      const source = readFileSync(
        resolve(
          repoRoot,
          'src/contexts/saved-tabs/presentation/hooks/useCategoryKeywordModal.ts',
        ),
        'utf8',
      )
      expect(source).not.toMatch(
        /chrome\.storage\.onChanged\.(addListener|removeListener)/,
      )
    })
  })

  describe('issue #503: presentation 配下は chrome.storage.onChanged を直参照しない', () => {
    const presentationRoot = resolve(
      repoRoot,
      'src/contexts/saved-tabs/presentation',
    )
    const presentationSourceFiles = collectSourceFiles(presentationRoot)

    it('presentation 配下に .ts / .tsx ソースファイルが存在する', () => {
      expect(presentationSourceFiles.length).toBeGreaterThan(0)
    })

    for (const absolutePath of presentationSourceFiles) {
      const relativePath = relative(repoRoot, absolutePath).split(sep).join('/')
      it(`${relativePath} は chrome.storage.onChanged 文字列を含まない`, () => {
        const source = readFileSync(absolutePath, 'utf8')
        expect(
          source,
          `${relativePath} should not reference chrome.storage.onChanged`,
        ).not.toMatch(/chrome\.storage\.onChanged/)
      })

      it(`${relativePath} は chrome.storage.onChanged.addListener / removeListener を直接呼び出さない`, () => {
        const source = readFileSync(absolutePath, 'utf8')
        expect(
          source,
          `${relativePath} should not call chrome.storage.onChanged.addListener/removeListener`,
        ).not.toMatch(
          /chrome\.storage\.onChanged\.(addListener|removeListener)/,
        )
      })
    }
  })

  describe('issue #530: presentation 配下は @/lib/storage/* を production code で import しない', () => {
    const presentationRoot = resolve(
      repoRoot,
      'src/contexts/saved-tabs/presentation',
    )
    const presentationSourceFiles = collectSourceFiles(presentationRoot)

    it('presentation 配下に .ts / .tsx ソースファイルが存在する', () => {
      expect(presentationSourceFiles.length).toBeGreaterThan(0)
    })

    for (const absolutePath of presentationSourceFiles) {
      const relativePath = relative(repoRoot, absolutePath).split(sep).join('/')
      it(`${relativePath} は @/lib/storage/* を import しない`, () => {
        const source = readFileSync(absolutePath, 'utf8')
        expect(
          source,
          `${relativePath} should not import @/lib/storage/*`,
        ).not.toMatch(/from\s+['"]@\/lib\/storage\//)
      })
    }
  })

  describe('issue #531: presentation 配下は chrome.runtime.sendMessage を直叩きしない', () => {
    const presentationRoot = resolve(
      repoRoot,
      'src/contexts/saved-tabs/presentation',
    )
    const presentationSourceFiles = collectSourceFiles(presentationRoot)

    it('presentation 配下に .ts / .tsx ソースファイルが存在する', () => {
      expect(presentationSourceFiles.length).toBeGreaterThan(0)
    })

    for (const absolutePath of presentationSourceFiles) {
      const relativePath = relative(repoRoot, absolutePath).split(sep).join('/')
      it(`${relativePath} は chrome.runtime.sendMessage 文字列を含まない`, () => {
        const source = readFileSync(absolutePath, 'utf8')
        expect(
          source,
          `${relativePath} should not reference chrome.runtime.sendMessage`,
        ).not.toMatch(/chrome\.runtime\.sendMessage/)
      })

      it(`${relativePath} は chrome.runtime.* プロパティを直接参照しない`, () => {
        const source = readFileSync(absolutePath, 'utf8')
        expect(
          source,
          `${relativePath} should not call chrome.runtime.* directly`,
        ).not.toMatch(/chrome\.runtime\.\w+\(/)
      })
    }
  })

  describe('issue #531: MessagingPort / ChromeMessagingAdapter ファイルが追加されている', () => {
    const expectedFiles = [
      'src/contexts/saved-tabs/application/ports/MessagingPort.ts',
      'src/contexts/saved-tabs/infrastructure/browser/ChromeMessagingAdapter.ts',
    ]

    for (const file of expectedFiles) {
      it(`${file} が存在する`, () => {
        const source = readFileSync(resolve(repoRoot, file), 'utf8')
        expect(source.length).toBeGreaterThan(0)
      })
    }

    it('MessagingPort は chrome API を import / 利用しない', () => {
      const source = readFileSync(
        resolve(
          repoRoot,
          'src/contexts/saved-tabs/application/ports/MessagingPort.ts',
        ),
        'utf8',
      )
      expect(source).not.toMatch(/from\s+['"]chrome['"]/)
      // JSDoc 内の言及は除外するため、import / プロパティアクセスを厳密検出
      expect(source).not.toMatch(/chrome\.runtime\.\w+\(/)
    })

    it('ChromeMessagingAdapter は MessagingPort を実装し chrome.runtime.sendMessage を含む', () => {
      const source = readFileSync(
        resolve(
          repoRoot,
          'src/contexts/saved-tabs/infrastructure/browser/ChromeMessagingAdapter.ts',
        ),
        'utf8',
      )
      expect(source).toContain('MessagingPort')
      expect(source).toContain('chrome.runtime.sendMessage')
      expect(source).not.toMatch(/from\s+['"]@\/components/)
      expect(source).not.toMatch(/from\s+['"]@\/features\//)
    })

    it('createSavedTabsUseCasesDeps は messagingPort を組み立てる', () => {
      const source = readFileSync(
        resolve(
          repoRoot,
          'src/contexts/saved-tabs/infrastructure/composition/createSavedTabsUseCasesDeps.ts',
        ),
        'utf8',
      )
      expect(source).toContain('messagingPort')
      expect(source).toContain('createChromeMessagingAdapter')
    })

    it('createSavedTabsPorts は messagingPort を組み立てる', () => {
      const source = readFileSync(
        resolve(repoRoot, 'src/app/composition/createSavedTabsPorts.ts'),
        'utf8',
      )
      expect(source).toContain('messagingPort')
      expect(source).toContain('createChromeMessagingAdapter')
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
      // `src/app/composition/createSavedTabsUseCases.ts` は
      // `src/contexts/saved-tabs/application/` の
      // `createSavedTabsUseCases` に委譲する薄いラッパに
      // なった。use-case 群は application 側で組み立てるため、
      // そちらのファイルソースを検証する。
      const source = readFileSync(
        resolve(
          repoRoot,
          'src/contexts/saved-tabs/application/createSavedTabsUseCases.ts',
        ),
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

  describe('issue #485: presentation/components 配下に layout / scroll / chat bridge が追加されている', () => {
    const expectedFiles = [
      'src/contexts/saved-tabs/presentation/components/SavedTabsPresentationLayout.tsx',
      'src/contexts/saved-tabs/presentation/components/SavedTabsResponsiveLayoutContext.tsx',
      'src/contexts/saved-tabs/presentation/components/SavedTabsScrollControls.tsx',
      'src/contexts/saved-tabs/presentation/components/SavedTabsChatWidgetBridge.tsx',
      'src/contexts/saved-tabs/presentation/components/savedTabsPresentationLayout.helpers.ts',
    ]

    for (const file of expectedFiles) {
      it(`${file} が存在する`, () => {
        const source = readFileSync(resolve(repoRoot, file), 'utf8')
        expect(source.length).toBeGreaterThan(0)
      })
    }

    it('SavedTabsPresentationLayout は SavedTabsApp / SavedTabsScrollControls / chat bridge を呼び split layout を組み立てる', () => {
      const source = readFileSync(
        resolve(
          repoRoot,
          'src/contexts/saved-tabs/presentation/components/SavedTabsPresentationLayout.tsx',
        ),
        'utf8',
      )
      expect(source).toContain('SavedTabsApp')
      expect(source).toContain('SavedTabsScrollControls')
      expect(source).toContain('SavedTabsChatWidgetBridge')
      expect(source).toContain('SavedTabsResponsiveLayoutProvider')
      expect(source).toContain('saved-tabs-page-layout')
    })

    it('SavedTabsChatWidgetBridge は LazySavedTabsChatWidget 経由で chat widget を読み込む', () => {
      const source = readFileSync(
        resolve(
          repoRoot,
          'src/contexts/saved-tabs/presentation/components/SavedTabsChatWidgetBridge.tsx',
        ),
        'utf8',
      )
      expect(source).toContain('LazySavedTabsChatWidget')
      expect(source).toContain("historyVariant='dropdown'")
    })

    it('presentation/components は chrome.storage / chrome.tabs / chrome.contextMenus / chrome.alarms の直叩きを禁止している', () => {
      for (const file of expectedFiles) {
        if (!file.endsWith('.tsx') && !file.endsWith('.ts')) {
          continue
        }
        const source = readFileSync(resolve(repoRoot, file), 'utf8')
        expect(source, `${file} should not call chrome.storage`).not.toMatch(
          /chrome\.storage\./,
        )
        expect(source, `${file} should not call chrome.tabs`).not.toMatch(
          /chrome\.tabs\./,
        )
        expect(
          source,
          `${file} should not call chrome.contextMenus`,
        ).not.toMatch(/chrome\.contextMenus\./)
        expect(source, `${file} should not call chrome.alarms`).not.toMatch(
          /chrome\.alarms\./,
        )
      }
    })
  })

  describe('issue #485: contexts/SavedTabsRoute / SavedTabsPage は旧 features route の再 export ではない', () => {
    it('contexts/SavedTabsRoute.tsx は features route を re-export していない', () => {
      const source = readFileSync(
        resolve(
          repoRoot,
          'src/contexts/saved-tabs/presentation/routes/SavedTabsRoute.tsx',
        ),
        'utf8',
      )
      expect(source).not.toMatch(
        /export\s*\{\s*SavedTabsRoute\s*\}\s*from\s+['"]@\/features\/saved-tabs\/routes\/SavedTabsRoute['"]/,
      )
      expect(source).toContain('SavedTabsPage')
      expect(source).toContain('createSavedTabsUseCasesDeps')
    })

    it('contexts/SavedTabsPage.tsx は SavedTabsPresentationLayout を直接描画する', () => {
      const source = readFileSync(
        resolve(
          repoRoot,
          'src/contexts/saved-tabs/presentation/pages/SavedTabsPage.tsx',
        ),
        'utf8',
      )
      expect(source).toContain('SavedTabsPresentationLayout')
    })
  })

  describe('issue #526 followup: application/mappers/ は DTO / snapshot 変換の責務だけに閉じる', () => {
    const mappersRoot = resolve(
      repoRoot,
      'src/contexts/saved-tabs/application/mappers',
    )
    // 追加された mapper も同じガードで再帰検出するため、ディレクトリ列挙で
    // 取得する (test ファイルは collectSourceFiles 側で除外される)。
    const mapperSourceFiles = collectSourceFiles(mappersRoot)

    it('application/mappers/ 配下に production ソースファイルが存在する', () => {
      expect(mapperSourceFiles.length).toBeGreaterThan(0)
    })

    for (const absolutePath of mapperSourceFiles) {
      const relativePath = relative(repoRoot, absolutePath).split(sep).join('/')

      it(`${relativePath} は React / chrome モジュールを import しない`, () => {
        const source = readFileSync(absolutePath, 'utf8')
        expect(source, `${relativePath} should not import react`).not.toMatch(
          /from\s+['"]react['"]/,
        )
        expect(source, `${relativePath} should not import chrome`).not.toMatch(
          /from\s+['"]chrome['"]/,
        )
        // `chrome.storage` への直接関数呼び出しがないことを確認する
        // (JSDoc 内テキストの言及は除外するため、`(local|onChanged|sync)(` で関数呼び出しのみ検出)
        expect(
          source,
          `${relativePath} should not call chrome.storage directly`,
        ).not.toMatch(/chrome\.storage\.(local|onChanged|sync)\(/)
        expect(
          source,
          `${relativePath} should not call chrome.tabs`,
        ).not.toMatch(/chrome\.tabs\.\w+\(/)
        expect(
          source,
          `${relativePath} should not call chrome.runtime`,
        ).not.toMatch(/chrome\.runtime\.\w+\(/)
      })

      it(`${relativePath} は presentation 層に依存しない`, () => {
        const source = readFileSync(absolutePath, 'utf8')
        expect(
          source,
          `${relativePath} should not import presentation layer`,
        ).not.toMatch(/from\s+['"]@\/contexts\/[^/]+\/presentation/)
      })

      it(`${relativePath} は infrastructure 層に依存しない`, () => {
        const source = readFileSync(absolutePath, 'utf8')
        expect(
          source,
          `${relativePath} should not import infrastructure layer`,
        ).not.toMatch(/from\s+['"]@\/contexts\/[^/]+\/infrastructure/)
      })
    }
  })

  describe('issue #538: useProjectManagement は CustomProjectRepository を import しない', () => {
    const useProjectManagementPath = resolve(
      repoRoot,
      'src/contexts/saved-tabs/presentation/hooks/useProjectManagement.ts',
    )
    const useProjectManagementSource = readFileSync(
      useProjectManagementPath,
      'utf8',
    )

    it('useProjectManagement は CustomProjectRepository を import していない', () => {
      expect(useProjectManagementSource).not.toMatch(
        /from\s+['"]@\/contexts\/saved-tabs\/domain\/repositories\/CustomProjectRepository['"]/,
      )
    })

    it('useProjectManagement の deps は customProjectRepository を受け取らない', () => {
      // 第 1 引数が `customProjectRepository` でなく、application
      // query / use-case 関数のみ受け取る形に更新されていること。
      // まず deps 引数 (関数シグネチャ) の型注釈レベルを検証し、
      // import 自体が repository モジュールを直接引いていないかを
      // 別途検証する。
      expect(useProjectManagementSource).not.toMatch(
        /customProjectRepository\s*:\s*CustomProjectRepository/,
      )
      // import 文での repository モジュール直接依存を検証する。
      // JSDoc 中の言及は許容するため、`from '...repository'` 形式
      // の import のみ検出する。
      expect(useProjectManagementSource).not.toMatch(
        /from\s+['"]@\/contexts\/saved-tabs\/domain\/repositories\/CustomProjectRepository['"]/,
      )
    })

    it('useProjectManagement は CustomProjectRepository.findOrder / saveOrder / findAll / findAllRaw / restoreAllRaw / saveAll を直接呼ばない', () => {
      // JSDoc 内の言及は除外し、関数呼び出し形式のみ検出。
      // `repo.findAll` のようなメソッド呼び出しを許容するため、
      // 識別子単体 (`.findOrder` / `.saveOrder` ...) を
      // `customProjectRepositoryRef` 系が保有している経路に限定して
      // 検出する。
      expect(useProjectManagementSource).not.toMatch(
        /customProjectRepositoryRef\.current\.findOrder\(/,
      )
      expect(useProjectManagementSource).not.toMatch(
        /customProjectRepositoryRef\.current\.saveOrder\(/,
      )
      expect(useProjectManagementSource).not.toMatch(
        /customProjectRepositoryRef\.current\.findAll\(/,
      )
      expect(useProjectManagementSource).not.toMatch(
        /customProjectRepositoryRef\.current\.findAllRaw\(/,
      )
      expect(useProjectManagementSource).not.toMatch(
        /customProjectRepositoryRef\.current\.restoreAllRaw\(/,
      )
      expect(useProjectManagementSource).not.toMatch(
        /customProjectRepositoryRef\.current\.saveAll\(/,
      )
    })
  })

  describe('issue #539: useProjectManagement は issue 対象 8 操作を CustomProjectsCommandService 経由で直接呼ばない', () => {
    const useProjectManagementPath = resolve(
      repoRoot,
      'src/contexts/saved-tabs/presentation/hooks/useProjectManagement.ts',
    )
    const useProjectManagementSource = readFileSync(
      useProjectManagementPath,
      'utf8',
    )

    // issue #539 で application use-case へ移設した 8 メソッド。
    // 受け入れ条件「CustomProjectsCommandService の直接呼び出しが消えて
    // いる、または最小化されている」の「消えている」経路を担保する。
    const targetPortMethods = [
      'addUrlToCustomProject',
      'removeUrlFromCustomProject',
      'removeUrlsFromCustomProject',
      'setUrlCategory',
      'updateCategoryOrder',
      'reorderProjectUrls',
      'renameCategoryInProject',
      'updateProjectKeywords',
    ] as const

    for (const method of targetPortMethods) {
      it(`useProjectManagement は customProjectsCommandServiceRef.current.${method}(...) を直接呼ばない`, () => {
        const callPattern = new RegExp(
          `customProjectsCommandServiceRef\\.current\\.${method}\\(`,
        )
        expect(
          useProjectManagementSource,
          `useProjectManagement should not call customProjectsCommandServiceRef.current.${method}() directly; use the corresponding application use-case instead`,
        ).not.toMatch(callPattern)
      })
    }

    it('useProjectManagement の deps は customProjectsCommandService 経由で issue #539 対象 8 メソッドを露出しない (signature にメソッド名が登場しない)', () => {
      // `customProjectsCommandService` パラメータ自体は
      // `addCategoryToProject` / `removeCategoryFromProject` のみが
      // 呼ばれる経路で残るので (受け入れ条件「最小化」)、port 依存
      // 自体は維持する。ただし issue #539 対象 8 メソッドが
      // signature に露出しない (deps 経由で利用者に公開されない) こと
      // を担保する。
      const exposesTargetMethod = targetPortMethods.some((method) =>
        new RegExp(`customProjectsCommandService[^,)]*\\b${method}\\b`).test(
          useProjectManagementSource,
        ),
      )
      expect(
        exposesTargetMethod,
        'useProjectManagement deps / body should not expose issue #539 target port methods',
      ).toBe(false)
    })
  })

  describe('issue #540: SavedTabsApp は customProjectRepository / customProjectsCommandService を deps 経由で利用しない', () => {
    const savedTabsAppPath = resolve(
      repoRoot,
      'src/contexts/saved-tabs/presentation/app/SavedTabsApp.tsx',
    )
    const savedTabsAppSource = readFileSync(savedTabsAppPath, 'utf8')
    const useProjectManagementPath = resolve(
      repoRoot,
      'src/contexts/saved-tabs/presentation/hooks/useProjectManagement.ts',
    )
    const useProjectManagementSource = readFileSync(
      useProjectManagementPath,
      'utf8',
    )

    it('SavedTabsApp は CustomProjectRepository を import していない', () => {
      expect(savedTabsAppSource).not.toMatch(
        /from\s+['"]@\/contexts\/saved-tabs\/domain\/repositories\/CustomProjectRepository['"]/,
      )
    })

    it('SavedTabsApp は CustomProjectsCommandService を import していない', () => {
      expect(savedTabsAppSource).not.toMatch(
        /from\s+['"]@\/contexts\/saved-tabs\/application\/ports\/CustomProjectsCommandService['"]/,
      )
    })

    it('SavedTabsApp の deps から customProjectRepository が消えている', () => {
      // `deps.customProjectRepository.*` 形式のアクセスがないこと。
      // 旧 `handleMoveUrlBetweenProjects` の `deps.customProjectRepository.findAll()`
      // 直叩きを撤去した (issue #540 受け入れ条件) ことを担保する。
      expect(savedTabsAppSource).not.toMatch(/deps\.customProjectRepository\b/)
    })

    it('SavedTabsApp の deps から customProjectsCommandService が消えている', () => {
      // `deps.customProjectsCommandService.*` 形式のアクセスがないこと。
      // 旧 `handleMoveUrlBetweenProjects` の `deps.customProjectsCommandService.moveUrlBetweenCustomProjects`
      // 直叩きを撤去した (issue #540 受け入れ条件) ことを担保する。
      expect(savedTabsAppSource).not.toMatch(
        /deps\.customProjectsCommandService\b/,
      )
    })

    it('useProjectManagement の deps は customProjectsCommandService を受け取らない', () => {
      // issue #540 で `customProjectsCommandService` パラメータを
      // 完全に撤去し、`addCategoryToProject` /
      // `removeCategoryFromProject` も application use-case
      // (`addCategoryToCustomProject` /
      // `removeCategoryFromCustomProject`) へ移設した。
      expect(useProjectManagementSource).not.toMatch(
        /customProjectsCommandService/,
      )
    })

    it('useProjectManagement は CustomProjectsCommandService を import していない', () => {
      expect(useProjectManagementSource).not.toMatch(
        /from\s+['"]@\/contexts\/saved-tabs\/application\/ports\/CustomProjectsCommandService['"]/,
      )
    })

    it('useProjectManagement は CustomProjectRepository を import していない (issue #538 からの継続)', () => {
      expect(useProjectManagementSource).not.toMatch(
        /from\s+['"]@\/contexts\/saved-tabs\/domain\/repositories\/CustomProjectRepository['"]/,
      )
    })
  })

  describe('issue #544: SavedTabsApp に旧コメントアウトの chrome.storage 直叩きコードを残さない', () => {
    const savedTabsAppPath = resolve(
      repoRoot,
      'src/contexts/saved-tabs/presentation/app/SavedTabsApp.tsx',
    )
    const savedTabsAppSource = readFileSync(savedTabsAppPath, 'utf8')

    it('SavedTabsApp は旧コメントアウト handleDragEnd ブロックを残さない', () => {
      // DDD 移行前に残っていた `Chrome.storage.local.set({ savedTabs: ... })`
      // を含むコメントアウト済み handleDragEnd (大文字始まりの keyword
      // 表記 = 旧実装のメモ書き) の再発を防ぐ。
      expect(savedTabsAppSource).not.toMatch(/Chrome\.storage\.local\.set\(/)
      expect(savedTabsAppSource).not.toMatch(/savedTabs:\s*newGroups/)
      // `Const` / `Set` / `If` / `Return` のような旧コードの keyword 表記。
      // `const` / `set` / `if` / `return` の通常コードは影響しないよう、
      // 旧 handleDragEnd ブロック固有の context を含めて厳密検出する。
      expect(savedTabsAppSource).not.toMatch(/^.*Const handleDragEnd/m)
      expect(savedTabsAppSource).not.toMatch(
        /Chrome\.storage\.local\.set\(\{\s*savedTabs:\s*newGroups/,
      )
    })
  })

  describe('issue #582: domain 層の直接時刻依存を禁止する ClockPort 導入', () => {
    it('ClockPort が定義されている', () => {
      const source = readFileSync(
        resolve(
          repoRoot,
          'src/contexts/saved-tabs/application/ports/ClockPort.ts',
        ),
        'utf8',
      )
      expect(source).toContain('type ClockPort')
      expect(source).toContain('now:')
    })

    it('ClockPort は chrome API を import / 利用しない', () => {
      const source = readFileSync(
        resolve(
          repoRoot,
          'src/contexts/saved-tabs/application/ports/ClockPort.ts',
        ),
        'utf8',
      )
      expect(source).not.toMatch(/from\s+['"]chrome['"]/)
      // ClockPort はプリントの interface のみで、Date.now() も使わない
      expect(source).not.toMatch(/\bDate\.now\s*\(/)
    })

    it('SystemClockAdapter が定義されている', () => {
      const source = readFileSync(
        resolve(
          repoRoot,
          'src/contexts/saved-tabs/infrastructure/browser/SystemClockAdapter.ts',
        ),
        'utf8',
      )
      expect(source).toContain('ClockPort')
      expect(source).toContain('createSystemClock')
      // SystemClock は infrastructure 層なので Date.now() 使用は OK
      expect(source).toContain('Date.now()')
    })

    it('createSavedTabsUseCasesDeps は clock を組み立てる', () => {
      const source = readFileSync(
        resolve(
          repoRoot,
          'src/contexts/saved-tabs/infrastructure/composition/createSavedTabsUseCasesDeps.ts',
        ),
        'utf8',
      )
      expect(source).toContain('clock:')
      expect(source).toContain('createSystemClock')
    })

    it('SavedTabsUseCasesDeps は clock を含む', () => {
      const source = readFileSync(
        resolve(
          repoRoot,
          'src/contexts/saved-tabs/application/SavedTabsUseCasesDeps.ts',
        ),
        'utf8',
      )
      expect(source).toContain('clock: ClockPort')
      expect(source).toContain('import type { ClockPort }')
    })
  })

  describe('issue #642: domain / application 層の直接 ID 生成依存を禁止する IdGeneratorPort 導入', () => {
    it('IdGeneratorPort が定義されている', () => {
      const source = readFileSync(
        resolve(
          repoRoot,
          'src/contexts/saved-tabs/application/ports/IdGeneratorPort.ts',
        ),
        'utf8',
      )
      expect(source).toContain('type IdGeneratorPort')
      expect(source).toContain('generate:')
    })

    it('IdGeneratorPort は chrome API を import / 利用しない', () => {
      const source = readFileSync(
        resolve(
          repoRoot,
          'src/contexts/saved-tabs/application/ports/IdGeneratorPort.ts',
        ),
        'utf8',
      )
      expect(source).not.toMatch(/from\s+['"]chrome['"]/)
      expect(source).not.toMatch(/\bcrypto\.randomUUID\s*\(/)
    })

    it('SystemIdGeneratorAdapter が定義されている', () => {
      const source = readFileSync(
        resolve(
          repoRoot,
          'src/contexts/saved-tabs/infrastructure/browser/SystemIdGeneratorAdapter.ts',
        ),
        'utf8',
      )
      expect(source).toContain('IdGeneratorPort')
      expect(source).toContain('createSystemIdGenerator')
      // SystemIdGenerator は infrastructure 層なので crypto.randomUUID() 使用は OK
      expect(source).toContain('crypto.randomUUID()')
    })

    it('createSavedTabsUseCasesDeps は idGenerator を組み立てる', () => {
      const source = readFileSync(
        resolve(
          repoRoot,
          'src/contexts/saved-tabs/infrastructure/composition/createSavedTabsUseCasesDeps.ts',
        ),
        'utf8',
      )
      expect(source).toContain('idGenerator:')
      expect(source).toContain('createSystemIdGenerator')
    })

    it('SavedTabsUseCasesDeps は idGenerator を含む', () => {
      const source = readFileSync(
        resolve(
          repoRoot,
          'src/contexts/saved-tabs/application/SavedTabsUseCasesDeps.ts',
        ),
        'utf8',
      )
      expect(source).toContain('idGenerator: IdGeneratorPort')
      expect(source).toContain('import type { IdGeneratorPort }')
    })

    it('CreateParentCategoryUseCase は idGenerator を use-case 依存として受け取る', () => {
      const source = readFileSync(
        resolve(
          repoRoot,
          'src/contexts/saved-tabs/application/use-cases/CreateParentCategoryUseCase.ts',
        ),
        'utf8',
      )
      expect(source).toContain('idGenerator: IdGeneratorPort')
      expect(source).toContain('deps.idGenerator.generate()')
    })

    it('CreateCustomProjectUseCase は idGenerator を use-case 依存として受け取る', () => {
      const source = readFileSync(
        resolve(
          repoRoot,
          'src/contexts/saved-tabs/application/use-cases/CreateCustomProjectUseCase.ts',
        ),
        'utf8',
      )
      expect(source).toContain('idGenerator: IdGeneratorPort')
      expect(source).toContain('deps.idGenerator.generate()')
      // uuid package の直接 import が残っていないことを確認
      expect(source).not.toMatch(/from\s+['"]uuid['"]/)
    })
  })

  describe('issue #584: domain/repositories/ は contract のみで実装を含まない', () => {
    // `src/contexts/*/domain/repositories/` 配下は interface / type /
    // DTO contract の置き場であり、実装 class や Chrome Storage /
    // IndexedDB / localStorage / fetch などの外部 API 呼び出しを
    // 混入させない。実装は infrastructure 層に置く。
    //
    // JSDoc 内の禁止 API 言及は対象外とするため、コメントを除去してから
    // 検査する (issue #582 の stripComments と同じ方針)。
    const contextsDir = resolve(repoRoot, 'src/contexts')
    const repositoryFiles: string[] = []
    for (const entry of readdirSync(contextsDir)) {
      const repositoriesDir = resolve(
        contextsDir,
        entry,
        'domain',
        'repositories',
      )
      repositoryFiles.push(...collectSourceFiles(repositoriesDir))
    }

    it('検査対象の repository contract ファイルが存在する', () => {
      expect(repositoryFiles.length).toBeGreaterThan(0)
    })

    for (const absolutePath of repositoryFiles) {
      const relativePath = relative(repoRoot, absolutePath).split(sep).join('/')

      it(`${relativePath} は実装 class / 外部 API 呼び出しを含まない`, () => {
        const source = stripComments(readFileSync(absolutePath, 'utf8'))
        expect(
          source,
          `${relativePath} should not contain class declarations`,
        ).not.toMatch(/\bclass\b/)
        expect(
          source,
          `${relativePath} should not instantiate classes`,
        ).not.toMatch(/\bnew\s+[a-zA-Z]/)
        expect(source, `${relativePath} should not use chrome API`).not.toMatch(
          /\bchrome\./,
        )
        expect(
          source,
          `${relativePath} should not use localStorage`,
        ).not.toMatch(/\blocalStorage\./)
        expect(
          source,
          `${relativePath} should not use sessionStorage`,
        ).not.toMatch(/\bsessionStorage\./)
        expect(source, `${relativePath} should not use indexedDB`).not.toMatch(
          /\bindexedDB\b/,
        )
        expect(source, `${relativePath} should not call fetch()`).not.toMatch(
          /\bfetch\s*\(/,
        )
      })
    }
  })

  describe('issue #729 phase 1: production cutover remains deferred', () => {
    const sourceRoot = resolve(repoRoot, 'src')
    const productionFiles = collectSourceFiles(sourceRoot).filter(
      (path) =>
        !/\.(?:test|testing)\.tsx?$/.test(path) &&
        !path.includes(`${sep}testing${sep}`),
    )

    it('production source does not enable complete cutover', () => {
      for (const absolutePath of productionFiles) {
        const relativePath = relative(repoRoot, absolutePath)
          .split(sep)
          .join('/')
        const source = stripComments(readFileSync(absolutePath, 'utf8'))
        expect(
          source,
          `${relativePath} must not enable production complete cutover`,
        ).not.toMatch(/cutoverPolicy\s*:\s*['"]complete['"]/)
      }
    })

    it('production source does not import testing-only cutover seams', () => {
      for (const absolutePath of productionFiles) {
        const relativePath = relative(repoRoot, absolutePath)
          .split(sep)
          .join('/')
        const source = stripComments(readFileSync(absolutePath, 'utf8'))
        expect(
          source,
          `${relativePath} must not import a testing-only cutover seam`,
        ).not.toMatch(
          /(?:from|import)\s+['"][^'"]*(?:\/testing\/|\.testing)['"]/,
        )
      }
    })
  })
  describe('issue #739: persistence invalidation contract', () => {
    const unitOfWorkPortPath = resolve(
      repoRoot,
      'src/contexts/saved-tabs/application/ports/PersistenceV2UnitOfWorkPort.ts',
    )

    it('PersistenceChangePort は exact な invalidation hint contract を公開する', () => {
      expectTypeOf<keyof PersistenceChangeEvent>().toEqualTypeOf<
        'changeId' | 'revision' | 'scopes'
      >()
      expectTypeOf<PersistenceChangeEvent['changeId']>().toEqualTypeOf<string>()
      expectTypeOf<PersistenceChangeEvent['revision']>().toEqualTypeOf<number>()
      expectTypeOf<PersistenceChangeEvent['scopes']>().toEqualTypeOf<
        readonly PersistenceChangeScope[]
      >()
      expectTypeOf<PersistenceChangeEvent>().toEqualTypeOf<{
        readonly changeId: string
        readonly revision: number
        readonly scopes: readonly PersistenceChangeScope[]
      }>()

      expectTypeOf<PersistenceChangeScope>().toEqualTypeOf<
        | 'analyticsViews'
        | 'categories'
        | 'collections'
        | 'conversations'
        | 'groups'
        | 'memberships'
        | 'recoverySnapshots'
        | 'urls'
      >()

      expectTypeOf<PersistenceChangePort['publish']>().toEqualTypeOf<
        (event: PersistenceChangeEvent) => Promise<void>
      >()
      expectTypeOf<(event: PersistenceChangeEvent) => void>().not.toExtend<
        PersistenceChangePort['publish']
      >()
      expectTypeOf<PersistenceChangePort['subscribe']>().toEqualTypeOf<
        (listener: (event: PersistenceChangeEvent) => void) => () => void
      >()
    })

    it('UnitOfWork は shared scope alias を import / re-export し、union を再定義しない', () => {
      expectTypeOf<UnitOfWorkPersistenceChangeScope>().toEqualTypeOf<PersistenceChangeScope>()

      const unitOfWorkSource = readFileSync(unitOfWorkPortPath, 'utf8')
      expect(unitOfWorkSource).toMatch(
        /import type \{ PersistenceChangeScope \} from ['"]@\/contexts\/saved-tabs\/application\/ports\/PersistenceChangePort['"]/,
      )
      expect(unitOfWorkSource).not.toMatch(
        /export type PersistenceChangeScope\s*=/,
      )
    })
  })

  describe('issue #587: application boundary naming conventions', () => {
    // application 層が presentation に公開する contract の命名規約を定義する。
    // presentation が domain entity に直接依存せず、DTO / ViewModel /
    // Command / Query をファイル名から判断できるようにする。
    //
    // 規約 (docs/architecture/ddd.md 参照):
    //   application/commands/     -> *Command.ts
    //   application/queries/      -> *Query.ts
    //   application/dto/          -> *Dto.ts
    //   application/use-cases/    -> *UseCase.ts
    //   application/mappers/     -> *Mapper.ts
    //   application/ports/       -> *Port.ts | *Ports.ts | *Service.ts
    //   application/services/    -> *Service.ts
    //   presentation/view-models/ -> *ViewModel.ts

    type NamingConvention = {
      readonly layer: string
      readonly subdirectory: string
      readonly suffixes: readonly string[]
    }

    const namingConventions: readonly NamingConvention[] = [
      { layer: 'application', subdirectory: 'commands', suffixes: ['Command'] },
      { layer: 'application', subdirectory: 'queries', suffixes: ['Query'] },
      { layer: 'application', subdirectory: 'dto', suffixes: ['Dto'] },
      {
        layer: 'application',
        subdirectory: 'use-cases',
        suffixes: ['UseCase'],
      },
      { layer: 'application', subdirectory: 'mappers', suffixes: ['Mapper'] },
      {
        layer: 'application',
        subdirectory: 'ports',
        suffixes: ['Port', 'Ports', 'Service'],
      },
      { layer: 'application', subdirectory: 'services', suffixes: ['Service'] },
      {
        layer: 'presentation',
        subdirectory: 'view-models',
        suffixes: ['ViewModel'],
      },
    ]

    const contextsDir = resolve(repoRoot, 'src', 'contexts')
    const allContextNames = readdirSync(contextsDir).filter((entry) => {
      try {
        return (
          statSync(resolve(contextsDir, entry)).isDirectory() &&
          !entry.startsWith('.')
        )
      } catch {
        return false
      }
    })

    it('検査対象の context ディレクトリが存在する', () => {
      expect(allContextNames.length).toBeGreaterThan(0)
    })

    for (const convention of namingConventions) {
      for (const contextName of allContextNames) {
        const dir = resolve(
          contextsDir,
          contextName,
          convention.layer,
          convention.subdirectory,
        )
        const files = collectSourceFiles(dir)
        if (files.length === 0) {
          continue
        }

        it(`${contextName}/${convention.layer}/${convention.subdirectory}/ の非テストファイルは ${convention.suffixes.join(' | ')} 接尾辞に命名されている`, () => {
          for (const absolutePath of files) {
            const filename = absolutePath.split(sep).pop() ?? absolutePath
            const matches = convention.suffixes.some(
              (suffix) =>
                filename.endsWith(`${suffix}.ts`) ||
                filename.endsWith(`${suffix}.tsx`),
            )
            expect(
              matches,
              `${filename} in ${contextName}/${convention.layer}/${convention.subdirectory}/ should end with one of: ${convention.suffixes.map((s) => `${s}.ts(x)`).join(', ')}`,
            ).toBe(true)
          }
        })
      }
    }

    it('dependency-cruiser に presentation -> domain 依存禁止 rule が定義されている', () => {
      expect(dependencyCruiserSource).toContain(
        "name: 'no-presentation-to-domain'",
      )
    })

    it('presentation 配下の非テストファイルが domain を直接 import していない', () => {
      for (const contextName of allContextNames) {
        const presentationRoot = resolve(
          contextsDir,
          contextName,
          'presentation',
        )
        const presentationSourceFiles = collectSourceFiles(presentationRoot)
        for (const absolutePath of presentationSourceFiles) {
          const relativePath = relative(repoRoot, absolutePath)
            .split(sep)
            .join('/')
          const source = readFileSync(absolutePath, 'utf8')
          expect(
            source,
            `${relativePath} should not import from domain/`,
          ).not.toMatch(/(?:from|import)\s+['"][^'"]*\/domain(?:\/|['"])/)
        }
      }
    })
  })
})
