import { readFileSync, readdirSync, statSync } from 'node:fs'
import { relative, resolve, sep } from 'node:path'

import * as ts from '#typescript-parser'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(import.meta.dirname, '../../..')
const sourceRoot = resolve(repoRoot, 'src')

const LEGACY_SAVED_TABS_STORAGE_TYPES = new Set([
  'CustomProject',
  'DomainCategorySettings',
  'DomainParentCategoryMapping',
  'ParentCategory',
  'ProjectKeywordSettings',
  'SubCategoryKeyword',
  'TabGroup',
  'UrlRecord',
])

// Issue #861 retires the migration-only import and legacy-shape allowlists.
// Current production layers have no exceptional Chrome domain boundary.

const normalIndexedDbRuntimePaths = [
  'src/app/composition/backgroundSavedTabsIndexedDbDataPlane.ts',
  'src/app/composition/backgroundSavedTabsDataPlane.ts',
  'src/app/composition/createSavedTabsUseCases.ts',
  'src/contexts/saved-tabs/infrastructure/composition/createIndexedDbSavedTabsExternalDeps.ts',
  'src/contexts/saved-tabs/infrastructure/composition/createIndexedDbSavedTabsUseCases.ts',
  'src/contexts/saved-tabs/infrastructure/composition/IndexedDbSavedTabsSessionService.ts',
  'src/contexts/saved-tabs/infrastructure/composition/NativeSavedTabsPersistenceAdapters.ts',
] as const

const forbiddenNormalIndexedDbRuntimeDependency =
  /(?:createIndexedDbCompatibilitySession|createIndexedDbCompatibilityPersistenceAdapters|createSessionBackedSavedTabsUseCases|IndexedDbCompatibilityPersistenceAdapters|LegacyChromeStorageDto|LegacyCompatibilityStorageRecord|LegacyStorageToPersistenceV2Mapper|PersistenceV2CompatibilitySessionService|PersistenceV2LegacyCompatibilityMapper|SessionBackedSavedTabsUseCases)/

const isProductionSource = (path: string): boolean =>
  /\.tsx?$/.test(path) &&
  !/\.(?:test|spec|stories)\.tsx?$/.test(path) &&
  !/TestFixtures\.tsx?$/.test(path) &&
  !path.endsWith('.testing.ts') &&
  !path.includes(`${sep}testing${sep}`) &&
  !path.includes(`${sep}test${sep}`)

const collectSourceFiles = (directory: string): string[] => {
  const files: string[] = []
  for (const entry of readdirSync(directory)) {
    const absolutePath = resolve(directory, entry)
    if (statSync(absolutePath).isDirectory()) {
      files.push(...collectSourceFiles(absolutePath))
      continue
    }
    if (isProductionSource(absolutePath)) {
      files.push(absolutePath)
    }
  }
  return files.toSorted()
}

const toRepositoryPath = (absolutePath: string): string =>
  relative(repoRoot, absolutePath).split(sep).join('/')

const parseSourceFile = (absolutePath: string): ts.SourceFile =>
  ts.parseSourceFile(absolutePath, readFileSync(absolutePath, 'utf8'))

const isCurrentProductionLayer = (path: string): boolean =>
  path.startsWith('src/contexts/saved-tabs/domain/') ||
  path.startsWith('src/contexts/saved-tabs/application/') ||
  path.startsWith('src/contexts/saved-tabs/presentation/') ||
  path.startsWith('src/features/ai-chat/') ||
  path.startsWith('src/features/analytics/') ||
  path.startsWith('src/features/options/') ||
  path.startsWith('src/lib/background/') ||
  path.startsWith('src/app/composition/')

const importedNames = (node: ts.ImportDeclaration): readonly string[] => {
  const bindings = node.importClause?.namedBindings
  if (!bindings) {
    return node.importClause ? ['<default>'] : ['<side-effect>']
  }
  if (ts.isNamespaceImport(bindings)) {
    return ['<namespace>']
  }
  return bindings.elements.map(
    (element) => element.propertyName?.text ?? element.name.text,
  )
}

const legacyImportReason = (
  node: ts.ImportDeclaration,
  modulePath: string,
): string | undefined => {
  if (modulePath === '@/types/storage') {
    const legacyNames = importedNames(node).filter((name) =>
      LEGACY_SAVED_TABS_STORAGE_TYPES.has(name),
    )
    return legacyNames.length > 0
      ? `legacy storage types: ${legacyNames.join(', ')}`
      : undefined
  }
  if (
    /^@\/lib\/storage\/(?:categories|migration|projects|tabs|url-migration|urls)$/.test(
      modulePath,
    )
  ) {
    return `legacy domain storage module: ${modulePath}`
  }
  if (
    /(?:LegacyChromeStorageDto|LegacyStorageToPersistenceV2Mapper|RawLegacyStorageReaderPort)/.test(
      modulePath,
    )
  ) {
    return `legacy migration DTO module: ${modulePath}`
  }
  if (
    modulePath.includes('/infrastructure/persistence/chrome-storage/') &&
    !modulePath.endsWith('/ChromeUserSettingsRepository') &&
    !modulePath.endsWith('/ChromeStorageLocalPort')
  ) {
    return `Chrome domain persistence module: ${modulePath}`
  }
  if (modulePath.includes('/features/options/lib/import-export/legacy/')) {
    return `legacy backup module: ${modulePath}`
  }
  return undefined
}

type ShapeViolation = {
  readonly declaration: string
  readonly path: string
  readonly reason: string
}

const propertyName = (member: ts.TypeElement): string | undefined => {
  if (!ts.isPropertySignature(member) || !member.name) {
    return undefined
  }
  if (ts.isIdentifier(member.name) || ts.isStringLiteral(member.name)) {
    return member.name.text
  }
  return undefined
}

const declarationMembers = (
  node: ts.InterfaceDeclaration | ts.TypeAliasDeclaration,
): readonly ts.TypeElement[] => {
  if (ts.isInterfaceDeclaration(node)) {
    return [...node.members]
  }
  return ts.isTypeLiteralNode(node.type) ? [...node.type.members] : []
}

const collectShapeViolations = (absolutePath: string): ShapeViolation[] => {
  const repositoryPath = toRepositoryPath(absolutePath)
  const sourceFile = parseSourceFile(absolutePath)
  const violations: ShapeViolation[] = []
  const isCurrentModelDeclaration =
    repositoryPath.startsWith('src/contexts/saved-tabs/domain/') ||
    repositoryPath.startsWith('src/contexts/saved-tabs/application/')

  for (const statement of sourceFile.statements) {
    if (
      !ts.isInterfaceDeclaration(statement) &&
      !ts.isTypeAliasDeclaration(statement)
    ) {
      continue
    }
    const names = new Set(
      declarationMembers(statement)
        .map(propertyName)
        .filter((name): name is string => name !== undefined),
    )
    const reasons: string[] = []
    if (names.has('urls') && names.has('urlIds')) {
      reasons.push('exposes both urls and urlIds')
    }
    if (names.has('urlSubCategories')) {
      reasons.push('exposes urlSubCategories')
    }
    if (names.has('urlMetadata')) {
      reasons.push('exposes urlMetadata')
    }
    if (names.has('urlIds')) {
      reasons.push('exposes urlIds instead of memberships')
    }
    if (names.has('domains') && names.has('domainNames')) {
      reasons.push('duplicates parent relation as domains and domainNames')
    }
    if (isCurrentModelDeclaration) {
      for (const legacyField of [
        'subCategories',
        'categoryKeywords',
        'subCategoryOrder',
        'subCategoryOrderWithUncategorized',
        'parentCategoryId',
        'categoryOrder',
      ]) {
        if (names.has(legacyField)) {
          reasons.push(
            `exposes legacy ${legacyField} instead of Collection/Category/Group projection`,
          )
        }
      }

      if (
        /(?:CustomProject|ProjectRawSnapshot)/.test(statement.name.text) &&
        names.has('categories')
      ) {
        reasons.push(
          'exposes CustomProject categories instead of CollectionCategory projection',
        )
      }
      if (statement.name.text.includes('TabGroup') && names.has('domain')) {
        reasons.push(
          'exposes TabGroup domain instead of Collection.definition projection',
        )
      }
    }
    for (const reason of reasons) {
      violations.push({
        declaration: statement.name.text,
        path: repositoryPath,
        reason,
      })
    }
  }
  return violations
}

const findNamedFunctionBody = (
  sourceFile: ts.SourceFile,
  name: string,
): ts.ConciseBody | undefined => {
  for (const statement of sourceFile.statements) {
    if (
      ts.isVariableStatement(statement) &&
      statement.declarationList.declarations.length === 1
    ) {
      const declaration = statement.declarationList.declarations[0]
      if (
        declaration &&
        ts.isIdentifier(declaration.name) &&
        declaration.name.text === name &&
        declaration.initializer &&
        (ts.isArrowFunction(declaration.initializer) ||
          ts.isFunctionExpression(declaration.initializer))
      ) {
        return declaration.initializer.body
      }
    }
  }
  return undefined
}

const findCallObjectArgument = (
  body: ts.ConciseBody,
  calleeName: string,
): ts.ObjectLiteralExpression | undefined => {
  let result: ts.ObjectLiteralExpression | undefined
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === calleeName &&
      node.arguments[0] &&
      ts.isObjectLiteralExpression(node.arguments[0])
    ) {
      result = node.arguments[0]
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(body)
  return result
}

const objectProperty = (
  object: ts.ObjectLiteralExpression,
  name: string,
): ts.PropertyAssignment | undefined =>
  object.properties.find(
    (property): property is ts.PropertyAssignment =>
      ts.isPropertyAssignment(property) &&
      ((ts.isIdentifier(property.name) && property.name.text === name) ||
        (ts.isStringLiteral(property.name) && property.name.text === name)),
  )

describe('Issue #861 IndexedDB-only persistence boundary', () => {
  it('shared current storage types do not declare legacy saved-tabs shapes', () => {
    const storageTypesPath = resolve(repoRoot, 'src/types/storage.ts')
    const sourceFile = parseSourceFile(storageTypesPath)
    const declaredLegacyTypes = sourceFile.statements
      .filter(
        (
          statement,
        ): statement is ts.InterfaceDeclaration | ts.TypeAliasDeclaration =>
          ts.isInterfaceDeclaration(statement) ||
          ts.isTypeAliasDeclaration(statement),
      )
      .map((statement) => statement.name.text)
      .filter((name) => LEGACY_SAVED_TABS_STORAGE_TYPES.has(name))

    expect(declaredLegacyTypes).toStrictEqual([])
  })

  it('current production layers do not import legacy saved-tabs storage DTOs', () => {
    const violations: string[] = []
    for (const absolutePath of collectSourceFiles(sourceRoot)) {
      const repositoryPath = toRepositoryPath(absolutePath)
      if (!isCurrentProductionLayer(repositoryPath)) {
        continue
      }
      const sourceFile = parseSourceFile(absolutePath)
      for (const statement of sourceFile.statements) {
        if (
          !ts.isImportDeclaration(statement) ||
          !ts.isStringLiteral(statement.moduleSpecifier)
        ) {
          continue
        }
        const reason = legacyImportReason(
          statement,
          statement.moduleSpecifier.text,
        )
        if (reason) {
          violations.push(`${repositoryPath}: ${reason}`)
        }
      }
    }

    expect(violations).toStrictEqual([])
  })

  it('production composition injects only the native IndexedDB connection and operation gate', () => {
    const sourceFile = parseSourceFile(
      resolve(repoRoot, 'src/app/composition/createSavedTabsUseCases.ts'),
    )
    for (const [entryPoint, nativeFactory] of [
      ['createSavedTabsUseCases', 'createIndexedDbSavedTabsUseCases'],
      [
        'createSavedTabsPresentationComposition',
        'createNativeIndexedDbSavedTabsRuntime',
      ],
    ] as const) {
      const body = findNamedFunctionBody(sourceFile, entryPoint)
      expect(body).toBeDefined()
      if (!body) {
        throw new Error(`${entryPoint} must exist`)
      }
      const options = findCallObjectArgument(body, nativeFactory)
      expect(options).toBeDefined()
      if (!options) {
        throw new Error(`${nativeFactory} must be called`)
      }
      expect(objectProperty(options, 'connectionManager')).toBeDefined()
      expect(objectProperty(options, 'operationGate')).toBeDefined()
      expect(objectProperty(options, 'legacy')).toBeUndefined()
      expect(objectProperty(options, 'router')).toBeUndefined()
    }
  })

  it('normal production IndexedDB paths do not import migration compatibility modules', () => {
    const violations: string[] = []
    for (const repositoryPath of normalIndexedDbRuntimePaths) {
      const sourceFile = parseSourceFile(resolve(repoRoot, repositoryPath))
      for (const statement of sourceFile.statements) {
        if (
          !ts.isImportDeclaration(statement) ||
          !ts.isStringLiteral(statement.moduleSpecifier)
        ) {
          continue
        }
        const importSource = statement.getText(sourceFile)
        if (forbiddenNormalIndexedDbRuntimeDependency.test(importSource)) {
          violations.push(`${repositoryPath}: ${importSource}`)
        }
      }
    }

    expect(violations).toStrictEqual([])
  })

  it('background data-plane public contract exposes only current projections', () => {
    const facadePath = resolve(
      repoRoot,
      'src/app/composition/backgroundSavedTabsDataPlane.ts',
    )
    const sourceFile = parseSourceFile(facadePath)
    const forbiddenLegacyType =
      /\b(?:LegacyCompatibilityStorageRecord|CustomProject|ParentCategory|TabGroup|UrlRecord)\b/
    const violations = sourceFile.statements
      .filter(
        (
          statement,
        ): statement is ts.InterfaceDeclaration | ts.TypeAliasDeclaration =>
          (ts.isInterfaceDeclaration(statement) ||
            ts.isTypeAliasDeclaration(statement)) &&
          statement.modifiers?.some(
            (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
          ) === true,
      )
      .filter((statement) =>
        forbiddenLegacyType.test(statement.getText(sourceFile)),
      )
      .map((statement) => statement.name.text)

    expect(violations).toStrictEqual([])
  })

  it('IndexedDB domain compositions do not import Chrome Storage or retired route factories', () => {
    for (const path of [
      'src/app/composition/createSavedTabsUseCases.ts',
      'src/app/composition/backgroundSavedTabsDataPlane.ts',
      'src/app/composition/analyticsViewsDataPlane.ts',
      'src/contexts/saved-tabs/infrastructure/composition/createIndexedDbSavedTabsUseCases.ts',
    ]) {
      const source = readFileSync(resolve(repoRoot, path), 'utf8')
      expect(source).not.toMatch(
        /getChromeStorageLocal|chrome\.storage\.local|PersistenceDataPlaneRouter|createLegacy|createRouteAware|legacyStorage/,
      )
    }
    const aiHistory = readFileSync(
      resolve(
        repoRoot,
        'src/app/composition/aiConversationHistoryDataPlane.ts',
      ),
      'utf8',
    )
    expect(aiHistory).toContain(
      "const ACTIVE_CONVERSATION_ID_KEY = 'activeAiChatConversationId'",
    )
    expect(aiHistory).not.toMatch(
      /aiChatConversations|createLegacy|createRouteAware|PersistenceDataPlaneRouter/,
    )
  })

  it('current domain/application/presentation shapes do not expose legacy dual fields', () => {
    const shapeRoots = [
      'src/contexts/saved-tabs/application/dto',
      'src/contexts/saved-tabs/domain/dto',
      'src/contexts/saved-tabs/domain/entities',
      'src/contexts/saved-tabs/domain/repositories',
      'src/contexts/saved-tabs/presentation/types',
      'src/contexts/saved-tabs/presentation/view-models',
    ]
    const violations = shapeRoots
      .flatMap((path) => collectSourceFiles(resolve(repoRoot, path)))
      .flatMap(collectShapeViolations)
      .toSorted((left, right) =>
        `${left.path}:${left.declaration}:${left.reason}`.localeCompare(
          `${right.path}:${right.declaration}:${right.reason}`,
        ),
      )

    expect(violations).toStrictEqual([])
  })
})
