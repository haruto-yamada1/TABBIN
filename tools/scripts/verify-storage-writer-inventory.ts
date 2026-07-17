import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

import ts from 'typescript'

export type StorageWriterInventoryVerificationOptions = {
  readonly repoRoot: string
  readonly inventoryPath: string
  readonly sourceRoots: readonly string[]
}

export type ParsedStorageWriterInventory = {
  readonly storageKeys: ReadonlySet<string>
  readonly writerCategories: ReadonlySet<string>
  readonly mutationFiles: ReadonlySet<string>
  readonly writerTable: {
    readonly columns: readonly string[]
    readonly found: boolean
    readonly rows: readonly ParsedStorageWriterRow[]
  }
}

export type ParsedStorageWriterRow = {
  readonly cells: readonly string[]
  readonly fileReferences: ReadonlySet<string>
  readonly id: string
  readonly rowNumber: number
}

const REQUIRED_STORAGE_KEYS = [
  'savedTabs',
  'urls',
  'customProjects',
  'parentCategories',
  'userSettings',
  'aiChatConversations',
  'savedAnalyticsViews',
] as const

const REQUIRED_WRITER_CATEGORIES = [
  'explicit mutation',
  'implicit repair',
  'normalize-on-read',
  'self-healing load',
  'startup migration',
  'scheduled maintenance',
  'ui sync',
  'background listener',
  'import/restore',
  'cleanup',
] as const

const REQUIRED_WRITER_COLUMNS = [
  'ID',
  'Storage key',
  'Category',
  'Context',
  'Entry point',
  'Mutation boundary',
  'Read keys',
  'Write keys',
  'RMW',
  'Queue/lock',
  'Cache',
  'Preflight barrier',
  'Migration barrier',
  'Change notification',
  'v2 target',
] as const

const CURRENT_WRITER_IDS = [
  'UI-THEME',
  'UI-COLOR-RESET',
  'UI-ROUTE-CLEANUP',
  'RELEASE-CONTROL',
  'SETTINGS-REPAIR',
  'SETTINGS-SAVE',
  'SETTINGS-AUTO-DELETE',
  'AI-HISTORY-REPAIR',
  'AI-HISTORY-SAVE',
  'ANALYTICS-VIEWS',
  'ANALYTICS-UNDO',
  'IMPORT-MERGE',
  'IMPORT-OVERWRITE',
  'DDD-URLS',
  'DDD-TAB-GROUPS',
  'DDD-CUSTOM-PROJECTS',
  'DDD-CUSTOM-ORDER-UNDO',
  'DDD-PARENT-CATEGORIES',
  'DDD-DOMAIN-SETTINGS',
  'DDD-DOMAIN-MAPPINGS',
  'DDD-USER-SETTINGS',
  'LEGACY-PARENT-CATEGORIES',
  'LEGACY-DOMAIN-CATEGORIES',
  'PARENT-CATEGORY-MIGRATION',
  'SAVE-TABS-FACADE',
  'HOSTNAME-MIGRATION',
  'URL-MIGRATION',
  'PROJECTS-REPAIR',
  'PROJECTS-WRITE',
  'PROJECTS-DOMAIN-SYNC',
  'SAVED-TABS-WRITE',
  'SAVED-TABS-AUTO',
  'SAVED-TABS-DELETE-UNDO',
  'URLS-WRITE',
  'URLS-CLEANUP-DEDUPE',
  'BACKGROUND-URL-REMOVE',
  'EXPIRED-TABS-CLEANUP',
  'TAB-TIMESTAMP-UPDATE',
] as const

const PRODUCTION_SOURCE_EXTENSION = /\.(?:c|m)?[jt]sx?$/
const EXCLUDED_FILE_NAME =
  /\.(?:d|fixture|generated|spec|stories?|test)\.[cm]?[jt]sx?$/
const EXCLUDED_DIRECTORY_NAMES = new Set([
  '.git',
  '.output',
  '__fixtures__',
  '__tests__',
  'build',
  'coverage',
  'dist',
  'fixtures',
  'generated',
  'node_modules',
  'stories',
  'test',
  'tests',
])

type InventorySection =
  | 'mutationFiles'
  | 'storageKeys'
  | 'writerCategories'
  | 'writerTable'
type MarkdownFence = {
  readonly character: '`' | '~'
  readonly length: number
}

const INVENTORY_SECTION_BY_HEADING: Readonly<Record<string, InventorySection>> =
  {
    'current writer inventory': 'writerTable',
    'mutation files': 'mutationFiles',
    'required storage keys': 'storageKeys',
    'storage keys': 'storageKeys',
    'writer categories': 'writerCategories',
  }

const MARKDOWN_HEADING = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/
const MARKDOWN_LIST_ENTRY = /^\s*[-+*]\s+(.+?)\s*$/
const MARKDOWN_TABLE_ROW = /^\s*\|(.+)\|\s*$/
const MARKDOWN_TABLE_SEPARATOR = /^:?-{3,}:?$/
const INLINE_CODE_ENTRY = /^`([^`\n]+)`$/
const INLINE_CODE_SPAN = /`([^`\n]+)`/g
const MARKDOWN_FENCE_OPENING = /^ {0,3}(`{3,}|~{3,})(.*)$/
const MARKDOWN_FENCE_CLOSING = /^ {0,3}(`+|~+)[ \t]*$/
const MARKDOWN_INDENTED_CODE = /^(?: {4}| {0,3}\t)/

const normalizeRepoPath = (filePath: string): string =>
  filePath.split(path.sep).join('/')

const resolveFromRepo = (repoRoot: string, filePath: string): string =>
  path.isAbsolute(filePath) ? filePath : path.join(repoRoot, filePath)

const parseMarkdownEntry = (entry: string): string => {
  const trimmedEntry = entry.trim()
  return INLINE_CODE_ENTRY.exec(trimmedEntry)?.[1] ?? trimmedEntry
}

const parseMarkdownEntries = (line: string): readonly string[] => {
  const listEntry = MARKDOWN_LIST_ENTRY.exec(line)
  if (listEntry) {
    return [parseMarkdownEntry(listEntry[1])]
  }

  const tableRow = MARKDOWN_TABLE_ROW.exec(line)
  if (!tableRow) {
    return []
  }

  const cells = tableRow[1].split('|').map(parseMarkdownEntry)
  return cells.every((cell) => MARKDOWN_TABLE_SEPARATOR.test(cell)) ? [] : cells
}

const parseMarkdownTableCells = (
  line: string,
): readonly string[] | undefined => {
  const tableRow = MARKDOWN_TABLE_ROW.exec(line)
  return tableRow?.[1].split('|').map((cell) => cell.trim())
}

const extractMutationFileReferences = (
  cells: readonly string[],
): ReadonlySet<string> => {
  const references = new Set<string>()
  for (const cell of cells) {
    for (const match of cell.matchAll(INLINE_CODE_SPAN)) {
      const reference = match[1]
      if (
        reference.includes('/') &&
        PRODUCTION_SOURCE_EXTENSION.test(reference)
      ) {
        references.add(reference)
      }
    }
  }
  return references
}

const parseMarkdownFenceOpening = (line: string): MarkdownFence | undefined => {
  const match = MARKDOWN_FENCE_OPENING.exec(line)
  if (!match) {
    return undefined
  }

  const marker = match[1]
  const character = marker[0]
  if (character !== '`' && character !== '~') {
    return undefined
  }
  if (character === '`' && match[2].includes('`')) {
    return undefined
  }

  return { character, length: marker.length }
}

const isMarkdownFenceClosing = (
  line: string,
  fence: MarkdownFence,
): boolean => {
  const marker = MARKDOWN_FENCE_CLOSING.exec(line)?.[1]
  return marker?.[0] === fence.character && marker.length >= fence.length
}

const addInventoryEntry = ({
  entry,
  inventory,
  section,
}: {
  readonly entry: string
  readonly inventory: {
    readonly mutationFiles: Set<string>
    readonly storageKeys: Set<string>
    readonly writerCategories: Set<string>
  }
  readonly section: InventorySection
}): void => {
  if (
    section === 'storageKeys' &&
    REQUIRED_STORAGE_KEYS.some((storageKey) => storageKey === entry)
  ) {
    inventory.storageKeys.add(entry)
    return
  }

  const normalizedEntry = entry.toLowerCase()
  if (
    section === 'writerCategories' &&
    REQUIRED_WRITER_CATEGORIES.some((category) => category === normalizedEntry)
  ) {
    inventory.writerCategories.add(normalizedEntry)
    return
  }

  if (
    section === 'mutationFiles' &&
    entry.includes('/') &&
    PRODUCTION_SOURCE_EXTENSION.test(entry)
  ) {
    inventory.mutationFiles.add(entry)
  }
}

type MutableStorageWriterInventory = {
  readonly mutationFiles: Set<string>
  readonly storageKeys: Set<string>
  readonly writerCategories: Set<string>
  readonly writerTable: {
    readonly columns: string[]
    found: boolean
    readonly rows: ParsedStorageWriterRow[]
  }
}

const createEmptyInventory = (): MutableStorageWriterInventory => ({
  mutationFiles: new Set<string>(),
  storageKeys: new Set<string>(),
  writerCategories: new Set<string>(),
  writerTable: {
    columns: [],
    found: false,
    rows: [],
  },
})

const getVisibleMarkdownLines = (markdown: string): readonly string[] => {
  const lines: string[] = []
  let fence: MarkdownFence | undefined

  for (const line of markdown.split('\n')) {
    if (fence) {
      if (isMarkdownFenceClosing(line, fence)) {
        fence = undefined
      }
      continue
    }
    fence = parseMarkdownFenceOpening(line)
    if (!fence && !MARKDOWN_INDENTED_CODE.test(line)) {
      lines.push(line)
    }
  }
  return lines
}

const addWriterTableLine = (
  line: string,
  writerTable: MutableStorageWriterInventory['writerTable'],
): void => {
  const cells = parseMarkdownTableCells(line)
  if (!cells || cells.every((cell) => MARKDOWN_TABLE_SEPARATOR.test(cell))) {
    return
  }
  if (writerTable.columns.length === 0) {
    writerTable.columns.push(...cells)
    return
  }
  writerTable.rows.push({
    cells,
    fileReferences: extractMutationFileReferences(cells),
    id: cells[0]?.trim() ?? '',
    rowNumber: writerTable.rows.length + 1,
  })
}

export const parseStorageWriterInventory = (
  markdown: string,
): ParsedStorageWriterInventory => {
  const inventory = createEmptyInventory()
  let section: InventorySection | undefined

  for (const line of getVisibleMarkdownLines(markdown)) {
    const heading = MARKDOWN_HEADING.exec(line)
    if (heading) {
      section = INVENTORY_SECTION_BY_HEADING[heading[1].trim().toLowerCase()]
      if (section === 'writerTable') {
        inventory.writerTable.found = true
      }
      continue
    }
    if (!section) {
      continue
    }
    if (section === 'writerTable') {
      addWriterTableLine(line, inventory.writerTable)
      continue
    }
    for (const entry of parseMarkdownEntries(line)) {
      addInventoryEntry({ entry, inventory, section })
    }
  }

  return inventory
}

const STORAGE_MUTATION_METHODS = new Set(['clear', 'remove', 'set'])

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
  /(?:^|\/)chrome-storage\/Chrome[^/]*Repository\.[cm]?[jt]sx?$/.test(
    normalizeRepoPath(relativePath),
  )

type StorageLexicalScope = {
  readonly bindings: Map<string, boolean>
  readonly parent: StorageLexicalScope | null
  readonly type: 'block' | 'function' | 'source'
}

const collectBindingNames = (name: ts.BindingName): readonly string[] => {
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
  initializer.expression.text === 'getChromeStorageLocal'

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

const collectStorageLexicalScopes = (
  sourceFile: ts.SourceFile,
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
          scope.bindings.set(name, false)
        }
      }
    }
    if (ts.isVariableDeclaration(node)) {
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
        isChromeStorageLocalInitializer(node.initializer)
      for (const name of collectBindingNames(node.name)) {
        const existing = declarationScope.bindings.get(name)
        declarationScope.bindings.set(
          name,
          (existing ?? true) && isChromeStorageLocal,
        )
      }
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
): boolean => {
  let scope: StorageLexicalScope | null = scopes.get(identifier) ?? null
  while (scope !== null) {
    if (scope.bindings.has(identifier.text)) {
      return scope.bindings.get(identifier.text) === true
    }
    scope = scope.parent
  }
  return false
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
  const accessPath = getPropertyAccessPath(callExpression.expression)
  const method = accessPath.at(-1)
  if (!method || !STORAGE_MUTATION_METHODS.has(method)) {
    return false
  }

  const receiverPath = accessPath.slice(0, -1)
  if (receiverPath.join('.') === 'chrome.storage.local') {
    return true
  }
  if (receiverPath.length === 1 && receiverPath[0] === 'storageLocal') {
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

  const receiver = receiverPath.at(-1)
  return (
    isChromeStorageRepository &&
    (receiver === 'port' || receiver === 'storagePort')
  )
}

export const containsStorageMutationBoundary = (
  sourceCode: string,
  relativePath: string,
): boolean => {
  const sourceFile = ts.createSourceFile(
    relativePath,
    sourceCode,
    ts.ScriptTarget.Latest,
    true,
    relativePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const isChromeStorageRepository = isChromeStorageRepositoryPath(relativePath)
  const storageLexicalScopes = collectStorageLexicalScopes(sourceFile)
  let containsMutation = false

  const visit = (node: ts.Node): void => {
    if (containsMutation) {
      return
    }
    if (
      ts.isCallExpression(node) &&
      isStorageMutationCall({
        callExpression: node,
        isChromeStorageRepository,
        storageLexicalScopes,
      })
    ) {
      containsMutation = true
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)

  return containsMutation
}

const isProductionSourceFile = (fileName: string): boolean =>
  PRODUCTION_SOURCE_EXTENSION.test(fileName) &&
  !EXCLUDED_FILE_NAME.test(fileName)

const collectStorageMutationFiles = ({
  directory,
  repoRoot,
}: {
  readonly directory: string
  readonly repoRoot: string
}): string[] => {
  const mutationFiles: string[] = []

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRECTORY_NAMES.has(entry.name)) {
        mutationFiles.push(
          ...collectStorageMutationFiles({
            directory: path.join(directory, entry.name),
            repoRoot,
          }),
        )
      }
      continue
    }

    if (!entry.isFile() || !isProductionSourceFile(entry.name)) {
      continue
    }

    const absolutePath = path.join(directory, entry.name)
    const relativePath = normalizeRepoPath(
      path.relative(repoRoot, absolutePath),
    )
    if (
      containsStorageMutationBoundary(
        readFileSync(absolutePath, 'utf8'),
        relativePath,
      )
    ) {
      mutationFiles.push(relativePath)
    }
  }

  return mutationFiles
}

const collectRequiredInventoryErrors = (
  inventory: ParsedStorageWriterInventory,
): readonly string[] => {
  const errors: string[] = []
  for (const storageKey of REQUIRED_STORAGE_KEYS) {
    if (!inventory.storageKeys.has(storageKey)) {
      errors.push(`Missing required storage key: ${storageKey}`)
    }
  }
  for (const writerCategory of REQUIRED_WRITER_CATEGORIES) {
    if (!inventory.writerCategories.has(writerCategory)) {
      errors.push(`Missing required writer category: ${writerCategory}`)
    }
  }
  return errors
}

const writerRowLabel = (row: ParsedStorageWriterRow): string | number =>
  row.id === '' ? row.rowNumber : row.id

const collectWriterRowErrors = (
  row: ParsedStorageWriterRow,
): readonly string[] => {
  const errors: string[] = []
  if (row.id === '') {
    errors.push(`Writer row ${row.rowNumber} has an empty ID`)
  }
  if (row.cells.length !== REQUIRED_WRITER_COLUMNS.length) {
    errors.push(
      `Writer row ${writerRowLabel(row)} has ${row.cells.length} cells; expected ${REQUIRED_WRITER_COLUMNS.length}`,
    )
  }
  for (const [index, column] of REQUIRED_WRITER_COLUMNS.entries()) {
    if (column !== 'ID' && (row.cells[index]?.trim() ?? '') === '') {
      errors.push(
        `Writer row ${writerRowLabel(row)} has an empty ${column} cell`,
      )
    }
  }
  if (row.fileReferences.size === 0) {
    errors.push(
      `Writer row ${writerRowLabel(row)} has no code-spanned mutation file reference`,
    )
  }
  return errors
}

const collectWriterIdentityErrors = (
  rows: readonly ParsedStorageWriterRow[],
): readonly string[] => {
  const errors: string[] = []
  const seenWriterIds = new Set<string>()
  const duplicateWriterIds = new Set<string>()
  const actualWriterIds = new Set<string>()

  for (const row of rows) {
    if (row.id === '') {
      continue
    }
    actualWriterIds.add(row.id)
    if (seenWriterIds.has(row.id)) {
      duplicateWriterIds.add(row.id)
    }
    seenWriterIds.add(row.id)
  }
  for (const duplicateWriterId of [...duplicateWriterIds].toSorted()) {
    errors.push(`Duplicate writer ID: ${duplicateWriterId}`)
  }
  for (const expectedWriterId of CURRENT_WRITER_IDS) {
    if (!actualWriterIds.has(expectedWriterId)) {
      errors.push(`Missing writer ID from baseline: ${expectedWriterId}`)
    }
  }
  for (const actualWriterId of [...actualWriterIds].toSorted()) {
    if (!CURRENT_WRITER_IDS.some((writerId) => writerId === actualWriterId)) {
      errors.push(`Unexpected writer ID outside baseline: ${actualWriterId}`)
    }
  }
  return errors
}

const hasExactWriterColumns = (columns: readonly string[]): boolean =>
  columns.length === REQUIRED_WRITER_COLUMNS.length &&
  columns.every((column, index) => column === REQUIRED_WRITER_COLUMNS[index])

const collectWriterTableErrors = (
  writerTable: ParsedStorageWriterInventory['writerTable'],
): readonly string[] => {
  const errors: string[] = []
  if (!writerTable.found) {
    errors.push('Missing designated writer table: Current writer inventory')
  }
  if (!hasExactWriterColumns(writerTable.columns)) {
    errors.push(
      `Writer table columns mismatch: expected "${REQUIRED_WRITER_COLUMNS.join(
        ' | ',
      )}", found "${writerTable.columns.join(' | ')}"`,
    )
  }
  if (writerTable.rows.length !== CURRENT_WRITER_IDS.length) {
    errors.push(
      `Writer ID baseline mismatch: expected ${CURRENT_WRITER_IDS.length} rows, found ${writerTable.rows.length}`,
    )
  }
  for (const row of writerTable.rows) {
    errors.push(...collectWriterRowErrors(row))
  }
  errors.push(...collectWriterIdentityErrors(writerTable.rows))
  return errors
}

const collectAppendixErrors = ({
  appendixFiles,
  mutationFiles,
}: {
  readonly appendixFiles: ReadonlySet<string>
  readonly mutationFiles: readonly string[]
}): readonly string[] => {
  const errors: string[] = []
  const mutationFileSet = new Set(mutationFiles)
  for (const mutationFile of mutationFiles) {
    if (!appendixFiles.has(mutationFile)) {
      errors.push(`Unlisted storage mutation file: ${mutationFile}`)
    }
  }
  for (const appendixFile of [...appendixFiles].toSorted()) {
    if (!mutationFileSet.has(appendixFile)) {
      errors.push(`Stale mutation file in appendix: ${appendixFile}`)
    }
  }
  return errors
}

const collectWriterFileMappingErrors = ({
  mutationFiles,
  rows,
}: {
  readonly mutationFiles: readonly string[]
  readonly rows: readonly ParsedStorageWriterRow[]
}): readonly string[] => {
  const errors: string[] = []
  const mutationFileSet = new Set(mutationFiles)
  const writerMappedFiles = new Set<string>()
  for (const row of rows) {
    for (const fileReference of [...row.fileReferences].toSorted()) {
      if (!mutationFileSet.has(fileReference)) {
        errors.push(
          `Writer row ${writerRowLabel(row)} references a non-mutation file: ${fileReference}`,
        )
      } else {
        writerMappedFiles.add(fileReference)
      }
    }
  }
  for (const mutationFile of mutationFiles) {
    if (!writerMappedFiles.has(mutationFile)) {
      errors.push(`Storage mutation file has no writer row: ${mutationFile}`)
    }
  }
  return errors
}

const discoverStorageMutationFiles = ({
  repoRoot,
  sourceRoots,
}: Pick<
  StorageWriterInventoryVerificationOptions,
  'repoRoot' | 'sourceRoots'
>): readonly string[] =>
  sourceRoots
    .flatMap((sourceRoot) =>
      collectStorageMutationFiles({
        directory: resolveFromRepo(repoRoot, sourceRoot),
        repoRoot,
      }),
    )
    .toSorted()

export const verifyStorageWriterInventory = ({
  inventoryPath,
  repoRoot,
  sourceRoots,
}: StorageWriterInventoryVerificationOptions): void => {
  const inventory = parseStorageWriterInventory(
    readFileSync(resolveFromRepo(repoRoot, inventoryPath), 'utf8'),
  )
  const mutationFiles = discoverStorageMutationFiles({ repoRoot, sourceRoots })
  const errors = [
    ...collectRequiredInventoryErrors(inventory),
    ...collectWriterTableErrors(inventory.writerTable),
    ...collectAppendixErrors({
      appendixFiles: inventory.mutationFiles,
      mutationFiles,
    }),
    ...collectWriterFileMappingErrors({
      mutationFiles,
      rows: inventory.writerTable.rows,
    }),
  ]

  if (errors.length > 0) {
    throw new Error(
      [
        'Storage writer inventory verification failed:',
        ...errors.map((error) => `- ${error}`),
      ].join('\n'),
    )
  }
}

if (import.meta.main) {
  try {
    verifyStorageWriterInventory({
      inventoryPath: 'docs/architecture/current-storage-writer-inventory.md',
      repoRoot: process.cwd(),
      sourceRoots: ['src'],
    })
    console.log('Storage writer inventory verification passed.')
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
