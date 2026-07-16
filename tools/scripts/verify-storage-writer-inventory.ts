import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

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

const normalizeMarkdownText = (markdown: string): string =>
  markdown.toLowerCase().replace(/\s+/g, ' ')

const normalizeRepoPath = (filePath: string): string =>
  filePath.split(path.sep).join('/')

const resolveFromRepo = (repoRoot: string, filePath: string): string =>
  path.isAbsolute(filePath) ? filePath : path.join(repoRoot, filePath)

export const parseStorageWriterInventory = (
  markdown: string,
): ParsedStorageWriterInventory => {
  const codeSpans = Array.from(markdown.matchAll(/`([^`\n]+)`/g), (match) =>
    match[1].trim(),
  )
  const normalizedText = normalizeMarkdownText(markdown)

  return {
    mutationFiles: new Set(
      codeSpans.filter(
        (value) =>
          value.includes('/') && PRODUCTION_SOURCE_EXTENSION.test(value),
      ),
    ),
    storageKeys: new Set(
      REQUIRED_STORAGE_KEYS.filter((key) => codeSpans.includes(key)),
    ),
    writerCategories: new Set(
      REQUIRED_WRITER_CATEGORIES.filter((category) =>
        normalizedText.includes(category),
      ),
    ),
  }
}

const NON_CODE_SEGMENT =
  /'(?:\\[\s\S]|[^'\\])*'|"(?:\\[\s\S]|[^"\\])*"|`(?:\\[\s\S]|[^`\\])*`|\/\/[^\n]*|\/\*[\s\S]*?\*\//g

const stripCommentsAndStrings = (sourceCode: string): string =>
  sourceCode.replace(NON_CODE_SEGMENT, (segment) =>
    segment.replace(/[^\n]/g, ' '),
  )

export const containsStorageMutationBoundary = (
  sourceCode: string,
  relativePath: string,
): boolean => {
  const code = stripCommentsAndStrings(sourceCode)
  const directChromeStorageMutation =
    /\bchrome\s*\.\s*storage\s*\.\s*local\s*\.\s*(?:clear|remove|set)\s*\(/
  const resolvedStorageLocalMutation =
    /\bstorageLocal\s*\.\s*(?:clear|remove|set)\s*\(/
  const chromeStorageRepositoryPortMutation =
    /\b(?:port|storagePort)\s*\.\s*(?:clear|remove|set)\s*\(/
  const isChromeStorageRepository =
    /(?:^|\/)chrome-storage\/Chrome[^/]*Repository\.[cm]?[jt]sx?$/.test(
      normalizeRepoPath(relativePath),
    )

  return (
    directChromeStorageMutation.test(code) ||
    resolvedStorageLocalMutation.test(code) ||
    (isChromeStorageRepository &&
      chromeStorageRepositoryPortMutation.test(code))
  )
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
