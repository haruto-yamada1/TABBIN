import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const repositoryPath = (path: string): string => resolve(process.cwd(), path)

const readRepositoryFile = (path: string): string =>
  readFileSync(repositoryPath(path), 'utf8')

// CodeRabbit review: ファイル全体の正規表現は「呼び出しの存在」しか検証できず、
// 別関数に正しい呼び出しが1つ残っているだけで通ってしまう。各 exported
// composition 関数の本体内で deps データフローを検証するための AST helper。
const parseRepositorySourceFile = (path: string): ts.SourceFile => {
  const source = readRepositoryFile(path)
  const fileName = path.split('/').pop() ?? path
  return ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
}

const calleeIdentifier = (call: ts.CallExpression): string | undefined => {
  const expression = call.expression
  return ts.isIdentifier(expression) ? expression.text : undefined
}

const collectCallExpressions = (
  node: ts.Node,
): readonly ts.CallExpression[] => {
  const calls: ts.CallExpression[] = []
  const visit = (current: ts.Node): void => {
    if (ts.isCallExpression(current)) {
      calls.push(current)
    }
    ts.forEachChild(current, visit)
  }
  visit(node)
  return calls
}

// `const <name> = <callee>(...)` 形式の変数宣言を探し、束縛された変数名を返す。
const findVariableAssignedFromCall = (
  scope: ts.Node,
  expectedCallee: string,
): string | undefined => {
  let assignedName: string | undefined
  const visit = (node: ts.Node): void => {
    if (assignedName !== undefined) {
      return
    }
    if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (
          ts.isIdentifier(declaration.name) &&
          declaration.initializer !== undefined &&
          ts.isCallExpression(declaration.initializer) &&
          calleeIdentifier(declaration.initializer) === expectedCallee
        ) {
          assignedName = declaration.name.text
          return
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(scope)
  return assignedName
}

// `const <name> = (...) => ...` / `export const <name> = (...) => ...` で
// 束縛された関数の本体を返す。
const findNamedFunctionBody = (
  sourceFile: ts.SourceFile,
  name: string,
): ts.Node | undefined => {
  let body: ts.Node | undefined
  const visit = (node: ts.Node): void => {
    if (body !== undefined) {
      return
    }
    if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (
          ts.isIdentifier(declaration.name) &&
          declaration.name.text === name &&
          declaration.initializer !== undefined &&
          (ts.isArrowFunction(declaration.initializer) ||
            ts.isFunctionExpression(declaration.initializer))
        ) {
          body = declaration.initializer.body
          return
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return body
}

// expect().toBeDefined() は実行時に throw するが TS はそれを認識できず、
// 2 引数 expect は vitest/valid-expect で弾かれるため、制御フローで narrow
// して non-null assertion を使わずに値を返す。
const requireDefined = <T>(value: T | undefined, message: string): T => {
  if (value === undefined) {
    throw new Error(message)
  }
  return value
}

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

  it('production composition routes the selected legacy deps through the route-aware use-case wiring', () => {
    // CodeRabbit review: ファイル全体への正規表現は3つの呼び出しの存在しか確認
    // せず、別関数に正しい呼び出しが1つ残っていれば結線が壊れても通る。
    // 各 exported composition 関数の本体内で、同じ deps 変数のデータフローを
    // AST で検証する。
    const sourceFile = parseRepositorySourceFile(
      'src/app/composition/createSavedTabsUseCases.ts',
    )

    // createProductionSavedTabsUseCases は deps を createApplicationSavedTabsUseCases へ渡し、
    // その結果を createRouteAwareSavedTabsUseCases の legacy slot へ結線する。
    const productionBody = requireDefined(
      findNamedFunctionBody(sourceFile, 'createProductionSavedTabsUseCases'),
      'createProductionSavedTabsUseCases must be defined',
    )
    const productionCalls = collectCallExpressions(productionBody)
    const routeAwareCall = productionCalls.find(
      (call) => calleeIdentifier(call) === 'createRouteAwareSavedTabsUseCases',
    )
    expect(
      routeAwareCall,
      'createProductionSavedTabsUseCases must call createRouteAwareSavedTabsUseCases',
    ).toBeDefined()
    const applicationUseCaseCall = requireDefined(
      productionCalls.find(
        (call) =>
          calleeIdentifier(call) === 'createApplicationSavedTabsUseCases',
      ),
      'createProductionSavedTabsUseCases must call createApplicationSavedTabsUseCases',
    )
    const applicationUseCaseArgument = applicationUseCaseCall.arguments[0]
    expect(
      ts.isIdentifier(applicationUseCaseArgument) &&
        applicationUseCaseArgument.text === 'deps',
      'createApplicationSavedTabsUseCases must receive the deps parameter directly',
    ).toBe(true)

    // 各 exported entry point は createSelectedLegacySavedTabsUseCasesDeps の戻り値を
    // 同じ変数へ束縛し、その変数を createProductionSavedTabsUseCases へ渡す。
    const entryPoints = [
      'createSavedTabsUseCases',
      'createSavedTabsPresentationComposition',
    ]
    for (const entryPoint of entryPoints) {
      const body = requireDefined(
        findNamedFunctionBody(sourceFile, entryPoint),
        `${entryPoint} must be defined`,
      )
      const depsVariableName = requireDefined(
        findVariableAssignedFromCall(
          body,
          'createSelectedLegacySavedTabsUseCasesDeps',
        ),
        `${entryPoint} must assign createSelectedLegacySavedTabsUseCasesDeps result to a variable`,
      )
      const calls = collectCallExpressions(body)
      const productionCall = requireDefined(
        calls.find(
          (call) =>
            calleeIdentifier(call) === 'createProductionSavedTabsUseCases',
        ),
        `${entryPoint} must call createProductionSavedTabsUseCases`,
      )
      const productionArgument = productionCall.arguments[0]
      expect(
        ts.isIdentifier(productionArgument) &&
          productionArgument.text === depsVariableName,
        `${entryPoint} must pass the selected legacy deps variable to createProductionSavedTabsUseCases`,
      ).toBe(true)
    }
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
