import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import {
  PRODUCTION_OUTBOUND_ALLOWED_ORIGINS,
  PRODUCTION_OUTBOUND_HOST_PERMISSIONS,
  createProductionExtensionCsp,
} from '#production-network-policy'
import ts from 'typescript'

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

type AliasScope = {
  bindings: Map<string, NetworkCallsiteKind | null>
  type: 'block' | 'function' | 'source'
}

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

const getLine = (source: ts.SourceFile, node: ts.Node): number =>
  source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1

const collectBindingIdentifiers = (name: ts.BindingName): string[] => {
  if (ts.isIdentifier(name)) {
    return [name.text]
  }
  return name.elements.flatMap((element) =>
    ts.isOmittedExpression(element)
      ? []
      : collectBindingIdentifiers(element.name),
  )
}

export const normalizeNetworkCallsite = (
  callsite: NetworkCallsite,
): NormalizedNetworkCallsite => {
  const { line: _line, ...normalized } = callsite
  return normalized
}

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
  const sourceScope: AliasScope = { bindings: new Map(), type: 'source' }
  const scopes: AliasScope[] = [sourceScope]
  const getCurrentScope = (): AliasScope => scopes.at(-1) ?? sourceScope

  const add = (
    kind: NetworkCallsiteKind,
    node: ts.Node,
    detail?: string,
  ): void => {
    callsites.push({
      ...(detail === undefined ? {} : { detail }),
      kind,
      line: getLine(source, node),
      path: relativePath,
    })
  }

  const resolveNetworkReference = (
    node: ts.Node,
  ): NetworkCallsiteKind | null => {
    if (ts.isIdentifier(node)) {
      for (let index = scopes.length - 1; index >= 0; index -= 1) {
        const scope = scopes[index]
        if (scope.bindings.has(node.text)) {
          return scope.bindings.get(node.text) ?? null
        }
      }
      return directGlobalKinds.get(node.text) ?? null
    }
    const propertyName = getAccessedPropertyName(node)
    const receiver = getAccessReceiver(node)
    if (propertyName === null || receiver === null) {
      return null
    }
    if (ts.isIdentifier(receiver) && GLOBAL_OBJECT_NAMES.has(receiver.text)) {
      return directGlobalKinds.get(propertyName) ?? null
    }
    if (
      propertyName === 'sendBeacon' &&
      isNamedGlobalObject(receiver, 'navigator')
    ) {
      return 'send-beacon'
    }
    return null
  }

  const resolveAliasSource = (
    node: ts.Expression,
  ): NetworkCallsiteKind | null => {
    const directKind = resolveNetworkReference(node)
    if (directKind !== null) {
      return directKind
    }
    if (!ts.isCallExpression(node)) {
      return null
    }
    const method = getAccessedPropertyName(node.expression)
    const receiver = getAccessReceiver(node.expression)
    return method === 'bind' && receiver !== null
      ? resolveNetworkReference(receiver)
      : null
  }

  const declareAlias = (
    name: string,
    kind: NetworkCallsiteKind | null,
    scope: AliasScope = getCurrentScope(),
  ): void => {
    scope.bindings.set(name, kind)
  }

  const updateAlias = (
    name: string,
    kind: NetworkCallsiteKind | null,
  ): void => {
    for (let index = scopes.length - 1; index >= 0; index -= 1) {
      const scope = scopes[index]
      if (scope.bindings.has(name)) {
        scope.bindings.set(name, kind)
        return
      }
    }
    declareAlias(name, kind)
  }

  const getVariableDeclarationScope = (
    node: ts.VariableDeclaration,
  ): AliasScope => {
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
        declareAlias(name, null, declarationScope)
      }
      return
    }
    if (ts.isIdentifier(node.name)) {
      declareAlias(
        node.name.text,
        resolveAliasSource(node.initializer),
        declarationScope,
      )
      return
    }
    if (!ts.isObjectBindingPattern(node.name)) {
      for (const name of collectBindingIdentifiers(node.name)) {
        declareAlias(name, null, declarationScope)
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
      declareAlias(element.name.text, kind, declarationScope)
    }
  }

  const registerAssignmentAlias = (node: ts.BinaryExpression): void => {
    if (
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left)
    ) {
      updateAlias(node.left.text, resolveAliasSource(node.right))
    }
  }

  const resolveInvokedNetworkReference = (
    node: ts.CallExpression,
  ): NetworkCallsiteKind | null => {
    const directKind = resolveNetworkReference(node.expression)
    if (directKind !== null) {
      return directKind
    }
    const method = getAccessedPropertyName(node.expression)
    const receiver = getAccessReceiver(node.expression)
    return (method === 'call' || method === 'apply') && receiver !== null
      ? resolveNetworkReference(receiver)
      : null
  }

  const enterNodeScope = (node: ts.Node): boolean => {
    if (ts.isFunctionDeclaration(node) && node.name !== undefined) {
      declareAlias(node.name.text, null)
    }
    if (ts.isFunctionLike(node)) {
      scopes.push({ bindings: new Map(), type: 'function' })
      for (const parameter of node.parameters) {
        for (const name of collectBindingIdentifiers(parameter.name)) {
          declareAlias(name, null)
        }
      }
      return true
    }
    if (ts.isBlock(node)) {
      scopes.push({ bindings: new Map(), type: 'block' })
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

  const recordNetworkCallsite = (node: ts.Node): void => {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      isNetworkClientModule(node.moduleSpecifier.text)
    ) {
      add('network-client-import', node, node.moduleSpecifier.text)
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteralLike(node.arguments[0]) &&
      isNetworkClientModule(node.arguments[0].text)
    ) {
      add('network-client-import', node, node.arguments[0].text)
    } else if (ts.isCallExpression(node)) {
      const kind = resolveInvokedNetworkReference(node)
      if (kind !== null) {
        add(kind, node)
      }
    } else if (ts.isNewExpression(node)) {
      const kind = resolveNetworkReference(node.expression)
      if (kind !== null) {
        add(kind, node)
      }
    }
  }

  const visit = (node: ts.Node): void => {
    const createdScope = enterNodeScope(node)
    registerNodeAliases(node)
    recordNetworkCallsite(node)
    ts.forEachChild(node, visit)
    if (createdScope) {
      scopes.pop()
    }
  }

  visit(source)
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const readStringArray = (
  manifest: Record<string, unknown>,
  property: string,
  label: string,
): string[] => {
  const value = manifest[property]
  if (
    !Array.isArray(value) ||
    !value.every((item) => typeof item === 'string')
  ) {
    throw new TypeError(`${label} ${property} is missing or not a string array`)
  }
  return value
}

const readExtensionPagesCsp = (
  manifest: Record<string, unknown>,
  label: string,
): string => {
  const value = manifest.content_security_policy
  if (typeof value === 'string') {
    return value
  }
  if (isRecord(value) && typeof value.extension_pages === 'string') {
    return value.extension_pages
  }
  throw new TypeError(
    `${label} content_security_policy is missing an extension policy`,
  )
}

const parseCspDirectives = (
  csp: string,
  label: string,
): Map<string, string[]> => {
  const directives = new Map<string, string[]>()
  const sections = csp
    .split(';')
    .map((section) => section.trim())
    .filter((section) => section !== '')
  for (const section of sections) {
    const [directive, ...values] = section.split(/\s+/u)
    if (directives.has(directive)) {
      throw new Error(
        `${label} content_security_policy contains duplicate directive ${directive}`,
      )
    }
    directives.set(directive, values)
  }
  return directives
}

const assertExtensionCspMatchesProductionNetworkPolicy = (
  manifest: Record<string, unknown>,
  label: string,
): void => {
  const directives = parseCspDirectives(
    readExtensionPagesCsp(manifest, label),
    label,
  )
  const expectedConnectSources = [
    "'self'",
    'blob:',
    ...PRODUCTION_OUTBOUND_ALLOWED_ORIGINS,
  ].toSorted()
  const actualConnectSources = directives.get('connect-src')?.toSorted()
  if (
    actualConnectSources === undefined ||
    JSON.stringify(actualConnectSources) !==
      JSON.stringify(expectedConnectSources)
  ) {
    throw new Error(
      `${label} connect-src does not match the production allowlist: ${JSON.stringify(actualConnectSources)}; expected ${JSON.stringify(expectedConnectSources)}`,
    )
  }
  for (const directive of ['object-src', 'frame-src', 'form-action']) {
    if (
      JSON.stringify(directives.get(directive)) !== JSON.stringify(["'none'"])
    ) {
      throw new Error(`${label} ${directive} must be 'none'`)
    }
  }
  const manifestVersion = manifest.manifest_version === 2 ? 2 : 3
  const expectedDirectives = parseCspDirectives(
    createProductionExtensionCsp(manifestVersion),
    'production network policy',
  )
  for (const [directive, expectedValues] of expectedDirectives) {
    if (directive === 'connect-src') {
      continue
    }
    const actualValues = directives.get(directive)
    if (
      actualValues === undefined ||
      JSON.stringify(actualValues.toSorted()) !==
        JSON.stringify(expectedValues.toSorted())
    ) {
      throw new Error(
        `${label} ${directive} does not match the production policy`,
      )
    }
  }
  const unexpectedDirectives = [...directives.keys()].filter(
    (directive) => !expectedDirectives.has(directive),
  )
  if (unexpectedDirectives.length !== 0) {
    throw new Error(
      `${label} content_security_policy contains unexpected directives: ${unexpectedDirectives.join(', ')}`,
    )
  }
}

export const assertManifestMatchesProductionNetworkPolicy = (
  manifest: unknown,
  label: string,
): void => {
  if (!isRecord(manifest)) {
    throw new TypeError(`${label} manifest is not an object`)
  }
  const isManifestV2 = manifest.manifest_version === 2
  const hostPermissionProperty = isManifestV2
    ? 'permissions'
    : 'host_permissions'
  const optionalHostPermissionProperty = isManifestV2
    ? 'optional_permissions'
    : 'optional_host_permissions'
  const isHostPermission = (permission: string): boolean =>
    permission === '<all_urls>' || permission.includes('://')
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
  assertExtensionCspMatchesProductionNetworkPolicy(manifest, label)
}
