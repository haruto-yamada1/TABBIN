import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { PRODUCTION_EXTENSION_PERMISSIONS } from '#extension-permissions'
import { PRODUCTION_OUTBOUND_HOST_PERMISSIONS } from '#production-network-policy'
import ts from 'typescript'

import { isHostPermission, readStringArray } from './manifestHelpers.ts'
import {
  assertExtensionCspMatchesProductionNetworkPolicy,
  assertGeneratedManifestSecurityInvariants,
} from './manifestSecurityInvariants.ts'
import { collectPotentialNetworkAliasKinds } from './production-network-policy-aliases'
import type { PotentialAliasSummary } from './production-network-policy-aliases'
import {
  NetworkAstTraverser,
  cloneAliasScopes as cloneScopes,
  collectBindingIdentifiers,
  mergeAliasScopeStates as mergeScopeStates,
} from './production-network-policy-ast'
import type { AliasScope } from './production-network-policy-ast'

export type NetworkCallsiteKind =
  | 'network-client-import'
  | 'fetch'
  | 'xml-http-request'
  | 'websocket'
  | 'event-source'
  | 'send-beacon'

export type NetworkCallsite = {
  detail?: string
  kind: NetworkCallsiteKind
  line: number
  path: string
}

export type NormalizedNetworkCallsite = Omit<NetworkCallsite, 'line'>

const NETWORK_CLIENT_MODULES = new Set([
  'ai-sdk-ollama',
  'axios',
  'cross-fetch',
  'got',
  'http',
  'https',
  'ky',
  'node-fetch',
  'node:http',
  'node:https',
  'openai',
  'socket.io-client',
  'superagent',
  'undici',
])

const GLOBAL_OBJECT_NAMES = new Set(['globalThis', 'self', 'window'])

export const PRODUCTION_NETWORK_CALLSITE_INVENTORY: readonly NormalizedNetworkCallsite[] =
  [
    {
      detail: 'ai-sdk-ollama',
      kind: 'network-client-import',
      path: 'src/lib/background/ai-chat.ts',
    },
    {
      kind: 'fetch',
      path: 'src/components/ai-elements/prompt-input.tsx',
    },
  ]

const callsiteKindOrder: readonly NetworkCallsiteKind[] = [
  'network-client-import',
  'fetch',
  'xml-http-request',
  'websocket',
  'event-source',
  'send-beacon',
]

const compareCallsites = (left: NetworkCallsite, right: NetworkCallsite) =>
  callsiteKindOrder.indexOf(left.kind) -
    callsiteKindOrder.indexOf(right.kind) ||
  left.path.localeCompare(right.path) ||
  (left.detail ?? '').localeCompare(right.detail ?? '') ||
  left.line - right.line

const isNetworkClientModule = (moduleName: string): boolean =>
  NETWORK_CLIENT_MODULES.has(moduleName) || moduleName.startsWith('@ai-sdk/')

const directGlobalKinds = new Map<string, NetworkCallsiteKind>([
  ['fetch', 'fetch'],
  ['XMLHttpRequest', 'xml-http-request'],
  ['WebSocket', 'websocket'],
  ['EventSource', 'event-source'],
])

const getAccessedPropertyName = (node: ts.Node): string | null => {
  if (ts.isPropertyAccessExpression(node)) {
    return node.name.text
  }
  if (
    ts.isElementAccessExpression(node) &&
    ts.isStringLiteralLike(node.argumentExpression)
  ) {
    return node.argumentExpression.text
  }
  return null
}

const getAccessReceiver = (node: ts.Node): ts.Expression | null =>
  ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)
    ? node.expression
    : null

const isNamedGlobalObject = (node: ts.Node, name: string): boolean =>
  (ts.isIdentifier(node) && node.text === name) ||
  ((ts.isPropertyAccessExpression(node) ||
    ts.isElementAccessExpression(node)) &&
    ts.isIdentifier(node.expression) &&
    GLOBAL_OBJECT_NAMES.has(node.expression.text) &&
    getAccessedPropertyName(node) === name)

const resolveDirectNetworkReferences = (
  node: ts.Node,
): ReadonlySet<NetworkCallsiteKind> => {
  if (ts.isIdentifier(node)) {
    const kind = directGlobalKinds.get(node.text)
    return kind === undefined ? new Set() : new Set([kind])
  }
  const propertyName = getAccessedPropertyName(node)
  const receiver = getAccessReceiver(node)
  if (propertyName === null || receiver === null) {
    return new Set()
  }
  if (ts.isIdentifier(receiver) && GLOBAL_OBJECT_NAMES.has(receiver.text)) {
    const kind = directGlobalKinds.get(propertyName)
    return kind === undefined ? new Set() : new Set([kind])
  }
  return propertyName === 'sendBeacon' &&
    isNamedGlobalObject(receiver, 'navigator')
    ? new Set(['send-beacon'])
    : new Set()
}

const getBindingPropertyName = (element: ts.BindingElement): string | null => {
  if (element.propertyName === undefined) {
    return ts.isIdentifier(element.name) ? element.name.text : null
  }
  return ts.isIdentifier(element.propertyName) ||
    ts.isStringLiteralLike(element.propertyName)
    ? element.propertyName.text
    : null
}

const resolveDestructuredNetworkKind = (
  initializer: ts.Expression,
  propertyName: string | null,
): NetworkCallsiteKind | null => {
  if (propertyName === null) {
    return null
  }
  if (
    ts.isIdentifier(initializer) &&
    GLOBAL_OBJECT_NAMES.has(initializer.text)
  ) {
    return directGlobalKinds.get(propertyName) ?? null
  }
  if (
    propertyName === 'sendBeacon' &&
    isNamedGlobalObject(initializer, 'navigator')
  ) {
    return 'send-beacon'
  }
  return null
}

const resolveIdentifierNetworkReferences = (
  name: string,
  scopes: readonly AliasScope[],
): ReadonlySet<NetworkCallsiteKind> => {
  const currentFunctionScopeIndex = scopes.findLastIndex(
    (scope) => scope.type === 'function',
  )
  for (let index = scopes.length - 1; index >= 0; index -= 1) {
    const scope = scopes[index]
    if (!scope.bindings.has(name)) {
      continue
    }
    const currentKinds = scope.bindings.get(name) ?? new Set()
    return currentFunctionScopeIndex > index
      ? new Set([
          ...currentKinds,
          ...(scope.potentialBindings.get(name) ?? []),
          ...(scopes[currentFunctionScopeIndex]?.potentialBindings.get(name) ??
            []),
        ])
      : new Set([...currentKinds, ...(scope.capturedBindings.get(name) ?? [])])
  }
  const directKind = directGlobalKinds.get(name)
  return directKind === undefined ? new Set() : new Set([directKind])
}

const resolveAliasNetworkReferences = (
  node: ts.Expression,
  resolveReferences: (node: ts.Node) => ReadonlySet<NetworkCallsiteKind>,
): ReadonlySet<NetworkCallsiteKind> => {
  const directKinds = resolveReferences(node)
  if (directKinds.size > 0) {
    return directKinds
  }
  if (ts.isConditionalExpression(node)) {
    return new Set([
      ...resolveAliasNetworkReferences(node.whenTrue, resolveReferences),
      ...resolveAliasNetworkReferences(node.whenFalse, resolveReferences),
    ])
  }
  if (
    ts.isBinaryExpression(node) &&
    [
      ts.SyntaxKind.AmpersandAmpersandToken,
      ts.SyntaxKind.BarBarToken,
      ts.SyntaxKind.QuestionQuestionToken,
    ].includes(node.operatorToken.kind)
  ) {
    return new Set([
      ...resolveAliasNetworkReferences(node.left, resolveReferences),
      ...resolveAliasNetworkReferences(node.right, resolveReferences),
    ])
  }
  if (!ts.isCallExpression(node)) {
    return new Set()
  }
  const method = getAccessedPropertyName(node.expression)
  const receiver = getAccessReceiver(node.expression)
  return method === 'bind' && receiver !== null
    ? resolveReferences(receiver)
    : new Set()
}

const getLine = (source: ts.SourceFile, node: ts.Node): number =>
  source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1

export const normalizeNetworkCallsite = (
  callsite: NetworkCallsite,
): NormalizedNetworkCallsite => {
  const { line: _line, ...normalized } = callsite
  return normalized
}

type NetworkCallsiteRecorder = {
  add: (kind: NetworkCallsiteKind, node: ts.Node, detail?: string) => void
  resolveInvokedReferences: (
    node: ts.CallExpression,
  ) => ReadonlySet<NetworkCallsiteKind>
  resolveReferences: (node: ts.Node) => ReadonlySet<NetworkCallsiteKind>
}

const recordNetworkCallsite = (
  node: ts.Node,
  recorder: NetworkCallsiteRecorder,
): void => {
  if (
    ts.isImportDeclaration(node) &&
    ts.isStringLiteral(node.moduleSpecifier) &&
    isNetworkClientModule(node.moduleSpecifier.text)
  ) {
    recorder.add('network-client-import', node, node.moduleSpecifier.text)
    return
  }
  if (
    ts.isCallExpression(node) &&
    node.expression.kind === ts.SyntaxKind.ImportKeyword &&
    node.arguments.length === 1 &&
    ts.isStringLiteralLike(node.arguments[0]) &&
    isNetworkClientModule(node.arguments[0].text)
  ) {
    recorder.add('network-client-import', node, node.arguments[0].text)
    return
  }
  if (ts.isCallExpression(node)) {
    for (const kind of recorder.resolveInvokedReferences(node)) {
      recorder.add(kind, node)
    }
  } else if (ts.isNewExpression(node)) {
    for (const kind of recorder.resolveReferences(node.expression)) {
      recorder.add(kind, node)
    }
  }
}

const createAliasScope = (
  type: AliasScope['type'],
  node: ts.Node,
  potentialAliases: WeakMap<ts.Node, PotentialAliasSummary>,
  bindings: Map<string, ReadonlySet<NetworkCallsiteKind>> = new Map<
    string,
    ReadonlySet<NetworkCallsiteKind>
  >(),
): AliasScope => ({
  bindings,
  capturedBindings: potentialAliases.get(node)?.capturedBindings ?? new Map(),
  potentialBindings: potentialAliases.get(node)?.bindings ?? new Map(),
  type,
})

export const collectSourceNetworkCallsites = (
  relativePath: string,
  sourceText: string,
): NetworkCallsite[] => {
  const scriptKind = relativePath.endsWith('.tsx')
    ? ts.ScriptKind.TSX
    : ts.ScriptKind.TS
  const source = ts.createSourceFile(
    relativePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  )
  const callsites: NetworkCallsite[] = []
  const recordedCallsites = new Set<string>()
  const potentialAliasKinds = collectPotentialNetworkAliasKinds(
    source,
    resolveDirectNetworkReferences,
  )
  const sourceScope = createAliasScope(
    'source',
    source,
    potentialAliasKinds,
    new Map(
      [...directGlobalKinds].map(([name, kind]) => [name, new Set([kind])]),
    ),
  )
  let scopes: AliasScope[] = [sourceScope]
  const getCurrentScope = (): AliasScope => scopes.at(-1) ?? sourceScope

  const createNetworkReference = (
    kind: NetworkCallsiteKind | null,
  ): ReadonlySet<NetworkCallsiteKind> =>
    kind === null ? new Set() : new Set([kind])

  const traverseFromClonedState = (
    initialScopes: readonly AliasScope[],
    traverse: () => void,
  ): AliasScope[] => {
    const previousScopes = scopes
    scopes = cloneScopes(initialScopes)
    traverse()
    const result = scopes
    scopes = previousScopes
    return result
  }

  const add = (
    kind: NetworkCallsiteKind,
    node: ts.Node,
    detail?: string,
  ): void => {
    const key = `${kind}:${node.pos}:${detail ?? ''}`
    if (recordedCallsites.has(key)) {
      return
    }
    recordedCallsites.add(key)
    callsites.push({
      ...(detail === undefined ? {} : { detail }),
      kind,
      line: getLine(source, node),
      path: relativePath,
    })
  }

  const resolveNetworkReferences = (
    node: ts.Node,
  ): ReadonlySet<NetworkCallsiteKind> => {
    if (ts.isIdentifier(node)) {
      return resolveIdentifierNetworkReferences(node.text, scopes)
    }
    const propertyName = getAccessedPropertyName(node)
    const receiver = getAccessReceiver(node)
    if (propertyName === null || receiver === null) {
      return new Set()
    }
    if (ts.isIdentifier(receiver) && GLOBAL_OBJECT_NAMES.has(receiver.text)) {
      return createNetworkReference(directGlobalKinds.get(propertyName) ?? null)
    }
    if (
      propertyName === 'sendBeacon' &&
      isNamedGlobalObject(receiver, 'navigator')
    ) {
      return createNetworkReference('send-beacon')
    }
    return new Set()
  }

  const resolveAliasReferences = (
    node: ts.Expression,
  ): ReadonlySet<NetworkCallsiteKind> =>
    resolveAliasNetworkReferences(node, resolveNetworkReferences)

  const declareAlias = (
    name: string,
    kinds: ReadonlySet<NetworkCallsiteKind>,
    scope: AliasScope = getCurrentScope(),
  ): void => {
    scope.bindings.set(name, new Set(kinds))
  }

  const updateAlias = (
    name: string,
    kinds: ReadonlySet<NetworkCallsiteKind>,
  ): void => {
    const currentFunctionScopeIndex = scopes.findLastIndex(
      (scope) => scope.type === 'function',
    )
    for (let index = scopes.length - 1; index >= 0; index -= 1) {
      const scope = scopes[index]
      if (scope.bindings.has(name)) {
        if (currentFunctionScopeIndex > index) {
          declareAlias(name, kinds, scopes[currentFunctionScopeIndex])
          return
        }
        scope.bindings.set(name, new Set(kinds))
        return
      }
    }
    declareAlias(name, kinds)
  }

  const getVariableDeclarationScope = (
    node: ts.VariableDeclaration,
  ): AliasScope => {
    if (ts.isCatchClause(node.parent)) {
      return getCurrentScope()
    }
    const declarationList = ts.isVariableDeclarationList(node.parent)
      ? node.parent
      : null
    if (
      declarationList !== null &&
      (declarationList.flags & ts.NodeFlags.BlockScoped) !== 0
    ) {
      return getCurrentScope()
    }
    return (
      scopes.findLast(
        (scope) => scope.type === 'function' || scope.type === 'source',
      ) ?? scopes[0]
    )
  }

  const registerVariableAliases = (node: ts.VariableDeclaration): void => {
    const declarationScope = getVariableDeclarationScope(node)
    if (node.initializer === undefined) {
      for (const name of collectBindingIdentifiers(node.name)) {
        declareAlias(name, new Set(), declarationScope)
      }
      return
    }
    if (ts.isIdentifier(node.name)) {
      declareAlias(
        node.name.text,
        resolveAliasReferences(node.initializer),
        declarationScope,
      )
      return
    }
    if (!ts.isObjectBindingPattern(node.name)) {
      for (const name of collectBindingIdentifiers(node.name)) {
        declareAlias(name, new Set(), declarationScope)
      }
      return
    }
    for (const element of node.name.elements) {
      if (!ts.isIdentifier(element.name)) {
        continue
      }
      const kind = resolveDestructuredNetworkKind(
        node.initializer,
        getBindingPropertyName(element),
      )
      declareAlias(
        element.name.text,
        createNetworkReference(kind),
        declarationScope,
      )
    }
  }

  const registerAssignmentAlias = (node: ts.BinaryExpression): void => {
    if (
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left)
    ) {
      updateAlias(node.left.text, resolveAliasReferences(node.right))
    }
  }

  const resolveInvokedNetworkReferences = (
    node: ts.CallExpression,
  ): ReadonlySet<NetworkCallsiteKind> => {
    const directKinds = resolveNetworkReferences(node.expression)
    if (directKinds.size > 0) {
      return directKinds
    }
    const method = getAccessedPropertyName(node.expression)
    const receiver = getAccessReceiver(node.expression)
    return (method === 'call' || method === 'apply') && receiver !== null
      ? resolveNetworkReferences(receiver)
      : new Set()
  }

  const enterNodeScope = (node: ts.Node): boolean => {
    if (
      ts.isBlock(node) ||
      ts.isForStatement(node) ||
      ts.isForInStatement(node) ||
      ts.isForOfStatement(node) ||
      ts.isSwitchStatement(node)
    ) {
      scopes.push(createAliasScope('block', node, potentialAliasKinds))
      return true
    }
    return false
  }

  const registerNodeAliases = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node)) {
      registerVariableAliases(node)
    } else if (ts.isBinaryExpression(node)) {
      registerAssignmentAlias(node)
    }
  }

  const traverser = new NetworkAstTraverser({
    cloneScopes,
    createScope: (type, node) =>
      createAliasScope(type, node, potentialAliasKinds),
    declareAlias: (name, kinds) => {
      declareAlias(name, kinds)
    },
    enterNodeScope,
    getScopes: () => scopes,
    mergeScopeStates,
    recordNetworkCallsite: (node) => {
      recordNetworkCallsite(node, {
        add,
        resolveInvokedReferences: resolveInvokedNetworkReferences,
        resolveReferences: resolveNetworkReferences,
      })
    },
    registerNodeAliases,
    setScopes: (nextScopes) => {
      scopes = nextScopes
    },
    traverseFromClonedState,
  })
  traverser.traverse(source)
  return callsites.toSorted(compareCallsites)
}

const isProductionSource = (filePath: string): boolean =>
  /\.(?:ts|tsx)$/u.test(filePath) &&
  !/\.(?:test|spec|stories?)\.(?:ts|tsx)$/u.test(filePath) &&
  !filePath.includes(`${path.sep}test${path.sep}`)

const collectFiles = (root: string): string[] => {
  const files: string[] = []
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        visit(entryPath)
      } else if (entry.isFile() && isProductionSource(entryPath)) {
        files.push(entryPath)
      }
    }
  }
  visit(root)
  return files
}

export const collectProductionNetworkCallsites = (
  projectRoot: string,
): NetworkCallsite[] => {
  const sourceRoot = path.join(projectRoot, 'src')
  return collectFiles(sourceRoot)
    .flatMap((filePath) =>
      collectSourceNetworkCallsites(
        path.relative(projectRoot, filePath),
        readFileSync(filePath, 'utf8'),
      ),
    )
    .toSorted(compareCallsites)
}

const formatCallsite = (callsite: NetworkCallsite): string =>
  `${callsite.path}:${callsite.line} ${callsite.kind}${callsite.detail === undefined ? '' : ` (${callsite.detail})`}`

export const assertProductionNetworkCallsiteInventory = (
  callsites: readonly NetworkCallsite[],
): void => {
  const actual = callsites.map(normalizeNetworkCallsite)
  if (
    JSON.stringify(actual) ===
    JSON.stringify(PRODUCTION_NETWORK_CALLSITE_INVENTORY)
  ) {
    return
  }
  throw new Error(
    `Production network call-site inventory changed. Review every added or removed call site and update the security policy deliberately.\n${callsites.map(formatCallsite).join('\n')}`,
  )
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

export const assertManifestMatchesProductionNetworkPolicy = (
  manifest: unknown,
  label: string,
): void => {
  if (!isRecord(manifest)) {
    throw new TypeError(`${label} manifest is not an object`)
  }
  const manifestVersion = manifest.manifest_version
  if (manifestVersion !== 2 && manifestVersion !== 3) {
    throw new TypeError(`${label} manifest_version must be numeric 2 or 3`)
  }
  const isManifestV2 = manifestVersion === 2
  const hostPermissionProperty = isManifestV2
    ? 'permissions'
    : 'host_permissions'
  const optionalHostPermissionProperty = isManifestV2
    ? 'optional_permissions'
    : 'optional_host_permissions'
  const actual = readStringArray(manifest, hostPermissionProperty, label)
    .filter(isHostPermission)
    .toSorted()
  const expected = [...PRODUCTION_OUTBOUND_HOST_PERMISSIONS].toSorted()
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${label} ${hostPermissionProperty} host patterns do not match the production allowlist: ${JSON.stringify(actual)}; expected ${JSON.stringify(expected)}`,
    )
  }
  if (optionalHostPermissionProperty in manifest) {
    const optionalPermissions = readStringArray(
      manifest,
      optionalHostPermissionProperty,
      label,
    ).filter(isHostPermission)
    if (optionalPermissions.length !== 0) {
      throw new Error(
        `${label} ${optionalHostPermissionProperty} host patterns must be empty: ${JSON.stringify(optionalPermissions)}`,
      )
    }
  }
  assertExtensionCspMatchesProductionNetworkPolicy(
    manifest,
    label,
    manifestVersion,
  )

  const actualApiPermissions = readStringArray(manifest, 'permissions', label)
    .filter((permission) => !isHostPermission(permission))
    .toSorted()
  const expectedApiPermissions = [
    ...PRODUCTION_EXTENSION_PERMISSIONS,
  ].toSorted()
  if (
    JSON.stringify(actualApiPermissions) !==
    JSON.stringify(expectedApiPermissions)
  ) {
    throw new Error(
      `${label} permissions do not match the approved extension permission allowlist: ${JSON.stringify(actualApiPermissions)}; expected ${JSON.stringify(expectedApiPermissions)}`,
    )
  }

  if ('optional_permissions' in manifest) {
    const optionalApiPermissions = readStringArray(
      manifest,
      'optional_permissions',
      label,
    ).filter((permission) => !isHostPermission(permission))
    if (optionalApiPermissions.length !== 0) {
      throw new Error(
        `${label} optional_permissions API permissions must be empty: ${JSON.stringify(optionalApiPermissions)}`,
      )
    }
  }

  assertGeneratedManifestSecurityInvariants(manifest, label)
}
