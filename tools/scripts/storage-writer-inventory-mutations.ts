import path from 'node:path'

import * as ts from '#typescript-parser'

const normalizeRepoPath = (filePath: string): string =>
  filePath.split(path.sep).join('/')

const STORAGE_MUTATION_METHODS = new Set(['clear', 'remove', 'set'])
const STORAGE_LOCAL_FACTORY_NAMES = new Set([
  'getChromeStorageLocal',
  'getPersistenceStorageLocal',
  'getRequiredPersistenceStorageLocal',
  'getStorageLocalRemove',
])

const getPropertyAccessPath = (
  expression: ts.Expression,
): readonly string[] => {
  if (ts.isIdentifier(expression)) {
    return [expression.text]
  }
  if (ts.isParenthesizedExpression(expression)) {
    return getPropertyAccessPath(expression.expression)
  }
  if (!ts.isPropertyAccessExpression(expression)) {
    return []
  }

  const receiverPath = getPropertyAccessPath(expression.expression)
  return receiverPath.length === 0
    ? []
    : [...receiverPath, expression.name.text]
}

const isChromeStorageRepositoryPath = (relativePath: string): boolean =>
  /(?:^|\/)(?:chrome-storage\/Chrome[^/]*Repository|persistence\/control-plane\/ChromePersistenceControlStateRepository)\.[cm]?[jt]sx?$/.test(
    normalizeRepoPath(relativePath),
  )

type StorageLexicalScope = {
  readonly bindings: Map<string, boolean>
  readonly parent: StorageLexicalScope | null
  readonly type: 'block' | 'function' | 'source'
}

const collectBindingNames = (
  name: ts.BindingName | undefined,
): readonly string[] => {
  if (name === undefined) {
    return []
  }
  if (ts.isIdentifier(name)) {
    return [name.text]
  }
  return name.elements.flatMap((element) =>
    ts.isOmittedExpression(element) ? [] : collectBindingNames(element.name),
  )
}

const isChromeStorageLocalInitializer = (
  initializer: ts.Expression | undefined,
): boolean =>
  initializer !== undefined &&
  ts.isCallExpression(initializer) &&
  ts.isIdentifier(initializer.expression) &&
  STORAGE_LOCAL_FACTORY_NAMES.has(initializer.expression.text)

const getStorageScopeType = (
  node: ts.Node,
): StorageLexicalScope['type'] | null => {
  if (ts.isFunctionLike(node)) {
    return 'function'
  }
  if (
    ts.isBlock(node) ||
    ts.isCatchClause(node) ||
    ts.isForStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isSwitchStatement(node)
  ) {
    return 'block'
  }
  return null
}

const findVariableScope = (scope: StorageLexicalScope): StorageLexicalScope => {
  let current = scope
  while (current.type === 'block' && current.parent !== null) {
    current = current.parent
  }
  return current
}

const isIndexedDbStoreParameter = (
  parameter: ts.ParameterDeclaration,
  name: string,
  sourceFile: ts.SourceFile,
): boolean => {
  const type = parameter.type
  if (!type) {
    return false
  }
  if (ts.isTypeReferenceNode(type)) {
    return type.typeName.getText(sourceFile) === 'IDBObjectStore'
  }
  if (!ts.isTypeLiteralNode(type)) {
    return false
  }
  return type.members.some((member) => {
    if (
      !ts.isPropertySignature(member) ||
      member.name.getText(sourceFile) !== name
    ) {
      return false
    }
    const memberType = ts.getPropertySignatureType(member)
    return (
      memberType !== undefined &&
      ts.isTypeReferenceNode(memberType) &&
      memberType.typeName.getText(sourceFile) === 'IDBObjectStore'
    )
  })
}

const recordStorageVariableBinding = (
  node: ts.VariableDeclaration,
  scope: StorageLexicalScope,
  indexedDb: boolean,
): void => {
  const declarationList = ts.isVariableDeclarationList(node.parent)
    ? node.parent
    : null
  const isBlockScoped =
    ts.isCatchClause(node.parent) ||
    (declarationList !== null &&
      (declarationList.flags & ts.NodeFlags.BlockScoped) !== 0)
  const declarationScope = isBlockScoped ? scope : findVariableScope(scope)
  const isChromeStorageLocal =
    ts.isIdentifier(node.name) &&
    (indexedDb
      ? isIndexedDbStoreInitializer(node.initializer)
      : isChromeStorageLocalInitializer(node.initializer))
  for (const name of collectBindingNames(node.name)) {
    const existing = declarationScope.bindings.get(name)
    declarationScope.bindings.set(
      name,
      (existing ?? true) && isChromeStorageLocal,
    )
  }
}

const collectStorageLexicalScopes = (
  sourceFile: ts.SourceFile,
  indexedDb = false,
): WeakMap<ts.Node, StorageLexicalScope> => {
  const scopes = new WeakMap<ts.Node, StorageLexicalScope>()
  const sourceScope: StorageLexicalScope = {
    bindings: new Map(),
    parent: null,
    type: 'source',
  }
  const visit = (node: ts.Node, parentScope: StorageLexicalScope): void => {
    const scopeType = node === sourceFile ? null : getStorageScopeType(node)
    const scope =
      scopeType === null
        ? parentScope
        : {
            bindings: new Map<string, boolean>(),
            parent: parentScope,
            type: scopeType,
          }
    scopes.set(node, scope)

    if (ts.isFunctionLike(node)) {
      for (const parameter of node.parameters) {
        for (const name of collectBindingNames(parameter.name)) {
          scope.bindings.set(
            name,
            indexedDb && isIndexedDbStoreParameter(parameter, name, sourceFile),
          )
        }
      }
    }
    if (ts.isVariableDeclaration(node)) {
      recordStorageVariableBinding(node, scope, indexedDb)
    }

    ts.forEachChild(node, (child) => {
      visit(child, scope)
    })
  }
  visit(sourceFile, sourceScope)
  return scopes
}

const unwrapParentheses = (expression: ts.Expression): ts.Expression =>
  ts.isParenthesizedExpression(expression)
    ? unwrapParentheses(expression.expression)
    : expression

const getSingleReceiverIdentifier = (
  callExpression: ts.CallExpression,
): ts.Identifier | null => {
  const callee = unwrapParentheses(callExpression.expression)
  if (!ts.isPropertyAccessExpression(callee)) {
    return null
  }
  const receiver = unwrapParentheses(callee.expression)
  return ts.isIdentifier(receiver) ? receiver : null
}

const isChromeStorageLocalAlias = (
  identifier: ts.Identifier,
  scopes: Readonly<WeakMap<ts.Node, StorageLexicalScope>>,
  fallbackName = 'storageLocal',
): boolean => {
  let scope: StorageLexicalScope | null = scopes.get(identifier) ?? null
  while (scope !== null) {
    if (scope.bindings.has(identifier.text)) {
      return scope.bindings.get(identifier.text) === true
    }
    scope = scope.parent
  }
  return identifier.text === fallbackName
}

const isIndexedDbStoreInitializer = (
  initializer: ts.Expression | undefined,
): boolean => {
  if (initializer === undefined) {
    return false
  }
  const expression = unwrapParentheses(initializer)
  return (
    ts.isCallExpression(expression) &&
    ts.isPropertyAccessExpression(expression.expression) &&
    expression.expression.name.text === 'objectStore'
  )
}

const isIndexedDbMutationCall = (
  call: ts.CallExpression,
  scopes: Readonly<WeakMap<ts.Node, StorageLexicalScope>>,
): boolean => {
  const callee = unwrapParentheses(call.expression)
  if (
    !ts.isPropertyAccessExpression(callee) ||
    !['add', 'put', 'delete', 'clear'].includes(callee.name.text)
  ) {
    return false
  }
  const receiver = unwrapParentheses(callee.expression)
  return (
    isIndexedDbStoreInitializer(receiver) ||
    (ts.isIdentifier(receiver) &&
      isChromeStorageLocalAlias(receiver, scopes, ''))
  )
}

const isStorageMutationCall = ({
  callExpression,
  isChromeStorageRepository,
  storageLexicalScopes,
}: {
  readonly callExpression: ts.CallExpression
  readonly isChromeStorageRepository: boolean
  readonly storageLexicalScopes: Readonly<WeakMap<ts.Node, StorageLexicalScope>>
}): boolean => {
  const callee = unwrapParentheses(callExpression.expression)
  const accessPath = getPropertyAccessPath(callExpression.expression)
  const method = ts.isPropertyAccessExpression(callee)
    ? callee.name.text
    : accessPath.at(-1)
  if (!method || !STORAGE_MUTATION_METHODS.has(method)) {
    return false
  }

  const receiverPath = accessPath.slice(0, -1)
  if (receiverPath.join('.') === 'chrome.storage.local') {
    return true
  }
  const receiverIdentifier = getSingleReceiverIdentifier(callExpression)
  if (
    receiverPath.length === 1 &&
    receiverIdentifier !== null &&
    isChromeStorageLocalAlias(receiverIdentifier, storageLexicalScopes)
  ) {
    return true
  }

  if (
    ts.isPropertyAccessExpression(callee) &&
    isChromeStorageLocalInitializer(unwrapParentheses(callee.expression))
  ) {
    return true
  }

  const receiver = receiverPath.at(-1)
  return (
    isChromeStorageRepository &&
    (receiver === 'port' ||
      receiver === 'storage' ||
      receiver === 'storagePort')
  )
}

export const containsStorageMutationBoundary = (
  sourceCode: string,
  relativePath: string,
  parse: ts.SourceParser = ts.parseSourceFile,
): boolean => {
  const sourceFile = parse(relativePath, sourceCode)
  const isChromeStorageRepository = isChromeStorageRepositoryPath(relativePath)
  const storageLexicalScopes = collectStorageLexicalScopes(sourceFile)
  const indexedDbScopes = collectStorageLexicalScopes(sourceFile, true)
  let containsMutation = false

  const visit = (node: ts.Node): void => {
    if (containsMutation) {
      return
    }
    if (
      ts.isCallExpression(node) &&
      (isStorageMutationCall({
        callExpression: node,
        isChromeStorageRepository,
        storageLexicalScopes,
      }) ||
        isIndexedDbMutationCall(node, indexedDbScopes))
    ) {
      containsMutation = true
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)

  return containsMutation
}
