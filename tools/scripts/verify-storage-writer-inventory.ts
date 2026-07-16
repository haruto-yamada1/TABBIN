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

type InventorySection = keyof ParsedStorageWriterInventory
type MarkdownFence = {
  readonly character: '`' | '~'
  readonly length: number
}

const INVENTORY_SECTION_BY_HEADING: Readonly<Record<string, InventorySection>> =
  {
    'mutation files': 'mutationFiles',
    'storage keys': 'storageKeys',
    'writer categories': 'writerCategories',
  }

const MARKDOWN_HEADING = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/
const MARKDOWN_LIST_ENTRY = /^\s*[-+*]\s+(.+?)\s*$/
const MARKDOWN_TABLE_ROW = /^\s*\|(.+)\|\s*$/
const MARKDOWN_TABLE_SEPARATOR = /^:?-{3,}:?$/
const INLINE_CODE_ENTRY = /^`([^`\n]+)`$/
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

export const parseStorageWriterInventory = (
  markdown: string,
): ParsedStorageWriterInventory => {
  const inventory = {
    mutationFiles: new Set<string>(),
    storageKeys: new Set<string>(),
    writerCategories: new Set<string>(),
  }
  let section: InventorySection | undefined
  let fence: MarkdownFence | undefined

  for (const line of markdown.split('\n')) {
    if (fence) {
      if (isMarkdownFenceClosing(line, fence)) {
        fence = undefined
      }
      continue
    }

    const openingFence = parseMarkdownFenceOpening(line)
    if (openingFence) {
      fence = openingFence
      continue
    }
    if (MARKDOWN_INDENTED_CODE.test(line)) {
      continue
    }

    const heading = MARKDOWN_HEADING.exec(line)
    if (heading) {
      section = INVENTORY_SECTION_BY_HEADING[heading[1].trim().toLowerCase()]
      continue
    }
    if (!section) {
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

const isStorageMutationCall = ({
  callExpression,
  isChromeStorageRepository,
}: {
  readonly callExpression: ts.CallExpression
  readonly isChromeStorageRepository: boolean
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
    false,
    relativePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const isChromeStorageRepository = isChromeStorageRepositoryPath(relativePath)
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

export const verifyStorageWriterInventory = ({
  inventoryPath,
  repoRoot,
  sourceRoots,
}: StorageWriterInventoryVerificationOptions): void => {
  const inventory = parseStorageWriterInventory(
    readFileSync(resolveFromRepo(repoRoot, inventoryPath), 'utf8'),
  )
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

  const mutationFiles = sourceRoots
    .flatMap((sourceRoot) =>
      collectStorageMutationFiles({
        directory: resolveFromRepo(repoRoot, sourceRoot),
        repoRoot,
      }),
    )
    .toSorted()
  for (const mutationFile of mutationFiles) {
    if (!inventory.mutationFiles.has(mutationFile)) {
      errors.push(`Unlisted storage mutation file: ${mutationFile}`)
    }
  }

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
