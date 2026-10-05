import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import * as ts from '#typescript-parser'
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
  return ts.parseSourceFile(fileName, source)
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

// expect().toBeDefined() は実行時に throw するが TS はそれを認識できず、戻り値を
// narrow するには non-null assertion が必要になる。typescript/no-non-null-assertion
// (error) を満たすため、制御フローで narrow して non-null assertion を使わずに
// 値を返す。以降の expect(actual, message) は戻り値を再利用しない純粋な assertion
// 用途の直接呼び出しなので、両者の使い分けは役割分担で矛盾しない。
const requireDefined = <T>(value: T | undefined, message: string): T => {
  if (value === undefined) {
    throw new Error(message)
  }
  return value
}

const persistenceBootstrapFiles = [
  'src/app/composition/analyticsViewsDataPlane.ts',
  'src/app/composition/aiConversationHistoryDataPlane.ts',
  'src/app/composition/backgroundSavedTabsDataPlane.ts',
  'src/app/composition/PersistenceRecoveryNotice.tsx',
  'src/contexts/saved-tabs/application/ports/PersistenceBootstrapPort.ts',
  'src/contexts/saved-tabs/application/services/PersistenceBootstrapService.ts',
  'src/contexts/saved-tabs/application/services/PersistenceOperationGateService.ts',
  'src/contexts/saved-tabs/application/services/PersistenceRecoveryService.ts',
  'src/contexts/saved-tabs/infrastructure/composition/persistenceBootstrapRuntime.ts',
  'src/contexts/saved-tabs/infrastructure/browser/WebLocksPersistenceCoordinationAdapter.ts',
  'src/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbConnectionManager.ts',
  'src/contexts/saved-tabs/infrastructure/persistence/indexed-db/persistenceDatabaseSchema.ts',
] as const

// Issue #861 replaces the historical Legacy facade/cutover guarantees with
// absence of those backends. Schema upgrades and IndexedDB recovery remain.
const retiredPersistencePaths = [
  'src/app/composition/persistenceStorageLocal.ts',
  'src/app/composition/createSavedTabsRepositories.ts',
  'src/app/composition/createMigrationPreflightController.ts',
  'src/app/composition/createLegacyStorageCleanupController.ts',
  'src/contexts/saved-tabs/application/services/PersistenceDataPlaneRouterService.ts',
  'src/contexts/saved-tabs/infrastructure/persistence/control-plane/ChromePersistenceControlStateRepository.ts',
  'src/lib/storage/categories.ts',
  'src/lib/storage/migration.ts',
  'src/lib/storage/projects.ts',
  'src/lib/storage/tabs.ts',
  'src/lib/storage/url-migration.ts',
  'src/lib/storage/urls.ts',
] as const

const backgroundPersistencePaths = [
  'src/features/analytics/lib/loadAnalyticsRecords.ts',
  'src/features/analytics/routes/AnalyticsRoute.tsx',
  'src/features/analytics/routes/analyticsRoute.helpers.ts',
  'src/lib/background/ai-chat.ts',
  'src/lib/background/expired-tabs.ts',
  'src/lib/background/extension-actions.ts',
  'src/lib/background/url-storage.ts',
] as const

const executableSource = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')

describe('IndexedDB-only PersistenceBootstrap architecture policy', () => {
  it('keeps bootstrap, coordination, schema upgrades and recovery explicit', () => {
    for (const path of persistenceBootstrapFiles) {
      expect({ path, exists: existsSync(repositoryPath(path)) }).toEqual({
        path,
        exists: true,
      })
    }
    for (const path of retiredPersistencePaths) {
      expect({ path, exists: existsSync(repositoryPath(path)) }).toEqual({
        path,
        exists: false,
      })
    }
  })

  it('documents the single authority and fail-closed readiness contract', () => {
    const model = readRepositoryFile(
      'docs/architecture/persistence-model-v2.md',
    )
    const indexedDb = readRepositoryFile(
      'docs/architecture/indexeddb-persistence.md',
    )
    const documented = `${model}\n${indexedDb}`.replace(/\s+/g, ' ')
    for (const contract of [
      /IndexedDB.*only domain-data source/i,
      /without consulting legacy Chrome Storage records or migration state/i,
      /database schema upgrades/i,
      /PERSISTENCE_COORDINATION_UNAVAILABLE/,
      /Backup V2/,
    ]) {
      expect(documented).toMatch(contract)
    }
  })

  it('keeps every domain entrypoint in the enforced writer inventory', () => {
    const inventory = readRepositoryFile(
      'docs/architecture/current-storage-writer-inventory.md',
    )
    for (const path of [
      'PERSISTENCE-V2-SAVED-TABS',
      'PERSISTENCE-V2-AI-HISTORY',
      'PERSISTENCE-V2-ANALYTICS',
      'PERSISTENCE-V2-RECOVERY',
      'IMPORT-OVERWRITE',
      'DDD-USER-SETTINGS',
      'AI-SELECTION',
      'RELEASE-CONTROL',
    ]) {
      expect(inventory).toContain(path)
    }
  })

  it.each([
    ['src/lib/storage/analytics.ts', 'analyticsViewsDataPlane'],
    [
      'src/features/ai-chat/lib/conversation-history.ts',
      'aiConversationHistoryDataPlane',
    ],
  ])('keeps %s behind its IndexedDB composition', (path, composition) => {
    const source = executableSource(readRepositoryFile(path))
    expect(source).toContain(`from '@/app/composition/${composition}'`)
    expect(source).not.toMatch(
      /\bchrome\.storage\.local\b|getChromeStorageLocal/,
    )
  })

  it('keeps background, AI and analytics domain consumers behind the native data plane', () => {
    for (const path of backgroundPersistencePaths) {
      const source = executableSource(readRepositoryFile(path))
      expect(source).toContain(
        "from '@/app/composition/backgroundSavedTabsDataPlane'",
      )
      expect(source).not.toMatch(
        /\bchrome\.storage\.local\b|getChromeStorageLocal/,
      )
    }
    const dataPlane = readRepositoryFile(
      'src/app/composition/backgroundSavedTabsDataPlane.ts',
    )
    expect(dataPlane).toContain('runtime.operationGate')
    expect(dataPlane).toContain('IndexedDbSavedTabsSessionService')
    expect(dataPlane).toContain('createBackgroundSavedTabsIndexedDbDataPlane')
    expect(dataPlane).not.toMatch(
      /legacyStorage|dataPlaneRouter|selectedIndexedDbGate|runIndexedDbSession/,
    )
  })

  it('requires the operation gate at every IndexedDB data and backup boundary', () => {
    for (const name of [
      'IndexedDbPersistenceSnapshotReader',
      'IndexedDbPersistenceUnitOfWork',
      'IndexedDbPersistenceReplacementAdapter',
      'IndexedDbPersistenceRecoverySnapshotRepository',
    ]) {
      const source = readRepositoryFile(
        `src/contexts/saved-tabs/infrastructure/persistence/indexed-db/${
          name
        }.ts`,
      )
      expect(source).toContain('PersistenceOperationGatePort')
      expect(source).toMatch(/runIndexedDb(?:Read|Write)/)
    }
  })

  it('keeps user settings in dedicated Chrome Storage repositories independently of IndexedDB', () => {
    const source = readRepositoryFile(
      'src/contexts/saved-tabs/infrastructure/composition/createIndexedDbSavedTabsExternalDeps.ts',
    )
    expect(source).toContain('const settingsStorage = getChromeStorageLocal()')
    expect(source).toContain('createChromeUserSettingsRepository(settingsPort)')
    expect(source).not.toContain('getPersistenceStorageLocal')
    expect(readRepositoryFile('src/lib/storage/settings.ts')).toContain(
      "get(['userSettings'])",
    )
  })

  it('passes the same runtime connection and gate into each exported native composition', () => {
    const sourceFile = parseRepositorySourceFile(
      'src/app/composition/createSavedTabsUseCases.ts',
    )
    const entries = [
      ['createSavedTabsUseCases', 'createIndexedDbSavedTabsUseCases'],
      [
        'createSavedTabsPresentationComposition',
        'createNativeIndexedDbSavedTabsRuntime',
      ],
    ] as const
    for (const [entryPoint, nativeFactory] of entries) {
      const body = requireDefined(
        findNamedFunctionBody(sourceFile, entryPoint),
        `${entryPoint} must exist`,
      )
      const runtimeName = requireDefined(
        findVariableAssignedFromCall(body, 'getPersistenceBootstrapRuntime'),
        `${entryPoint} must use the shared runtime`,
      )
      const factory = requireDefined(
        collectCallExpressions(body).find(
          (call) => calleeIdentifier(call) === nativeFactory,
        ),
        `${entryPoint} must call ${nativeFactory}`,
      )
      const options = requireDefined(
        factory.arguments[0],
        `${nativeFactory} must receive options`,
      )
      if (!ts.isObjectLiteralExpression(options)) {
        throw new Error(`${nativeFactory} options must be an object literal`)
      }
      for (const property of ['connectionManager', 'operationGate']) {
        const assignment = options.properties.find(
          (node): node is ts.PropertyAssignment =>
            ts.isPropertyAssignment(node) &&
            ts.isIdentifier(node.name) &&
            node.name.text === property,
        )
        const value = requireDefined(
          assignment,
          `${property} must be explicit`,
        ).initializer
        expect(
          ts.isPropertyAccessExpression(value) &&
            ts.isIdentifier(value.expression) &&
            value.expression.text === runtimeName &&
            value.name.text === property,
        ).toBe(true)
      }
      expect(options.getText(sourceFile)).not.toMatch(/\blegacy\b|\brouter\b/)
    }
  })

  it('awaits direct readiness and preserves app recovery without source preflight', () => {
    const app = readRepositoryFile('src/entrypoints/app/main.tsx')
    const background = readRepositoryFile('src/entrypoints/background.ts')
    const runtime = readRepositoryFile(
      'src/contexts/saved-tabs/infrastructure/composition/persistenceBootstrapRuntime.ts',
    )
    expect(app).toContain('<PersistenceRecoveryNotice />')
    expect(app).toMatch(
      /await\s+getPersistenceBootstrapRuntime\(\)\.bootstrap\.ready\(\)/,
    )
    expect(background).toMatch(/await\s+runtime\.bootstrap\.ready\(\)/)
    for (const source of [app, background, runtime]) {
      expect(source).not.toMatch(
        /MigrationPreflight|LegacyStorageCleanup|PersistenceControlState|dataPlaneRouter/,
      )
    }
    const notice = readRepositoryFile(
      'src/app/composition/PersistenceRecoveryNotice.tsx',
    )
    expect(notice).toContain('.retry()')
    expect(notice).not.toMatch(/createEmergencyBackup|rerunPreflightAndRetry/)
  })

  it('keeps forward-fix and rollback metadata safeguards with read-only Backup V2 export', () => {
    const runbook = readRepositoryFile(
      'docs/runbooks/persistence-v2-emergency.md',
    )
    const release = readRepositoryFile('docs/release.md')
    const metadata = readRepositoryFile('src/public/persistence-release.json')
    for (const contract of [
      'pre-IDB',
      'forward-fix',
      'minimumCompatibleAppVersion',
      'destructiveSchemaChange',
      'queryWriteContractCompatible',
      'git tag',
      'verify:persistence-release-compatibility',
    ]) {
      expect(`${runbook}\n${release}\n${metadata}`).toContain(contract)
    }
    expect(readRepositoryFile('package.json')).toContain(
      'verify:persistence-release-compatibility',
    )
    for (const path of ['optionsBackupRecovery', 'optionsBackupV2Export']) {
      expect(readRepositoryFile(`src/app/composition/${path}.ts`)).toContain(
        'readUserSettingsWithoutRepair',
      )
    }
  })
})
