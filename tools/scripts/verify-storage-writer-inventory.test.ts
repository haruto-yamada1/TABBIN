import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, test } from 'vitest'

import { verifyStorageWriterInventory } from './verify-storage-writer-inventory'

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
  'UI sync',
  'background listener',
  'import/restore',
  'cleanup',
] as const

const fixtureRoots: string[] = []

const createFixture = (): string => {
  const repoRoot = mkdtempSync(
    path.join(tmpdir(), 'tabbin-storage-writer-inventory-'),
  )
  fixtureRoots.push(repoRoot)
  return repoRoot
}

const writeFixtureFile = (
  repoRoot: string,
  relativePath: string,
  content: string,
): void => {
  const filePath = path.join(repoRoot, relativePath)
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, content)
}

const createInventory = ({
  storageKeys = REQUIRED_STORAGE_KEYS,
  writerCategories = REQUIRED_WRITER_CATEGORIES,
  mutationFiles = [],
}: {
  readonly storageKeys?: readonly string[]
  readonly writerCategories?: readonly string[]
  readonly mutationFiles?: readonly string[]
} = {}): string => `# Current storage writer inventory

## Storage keys

${storageKeys.map((key) => `- \`${key}\``).join('\n')}

## Writer categories

${writerCategories.map((category) => `- ${category}`).join('\n')}

## Mutation files

${mutationFiles.map((file) => `- \`${file}\``).join('\n')}
`

afterEach(() => {
  for (const fixtureRoot of fixtureRoots.splice(0)) {
    rmSync(fixtureRoot, { force: true, recursive: true })
  }
})

describe('verifyStorageWriterInventory', () => {
  test('requires every storage key and writer category', () => {
    const repoRoot = createFixture()
    const inventoryPath = 'docs/storage-writer-inventory.md'
    writeFixtureFile(
      repoRoot,
      inventoryPath,
      createInventory({
        storageKeys: REQUIRED_STORAGE_KEYS.filter(
          (key) => key !== 'savedAnalyticsViews',
        ),
        writerCategories: REQUIRED_WRITER_CATEGORIES.filter(
          (category) => category !== 'scheduled maintenance',
        ),
      }),
    )
    writeFixtureFile(repoRoot, 'src/empty.ts', 'export {}\n')

    expect(() =>
      verifyStorageWriterInventory({
        inventoryPath,
        repoRoot,
        sourceRoots: ['src'],
      }),
    ).toThrow(
      [
        'Storage writer inventory verification failed:',
        '- Missing required storage key: savedAnalyticsViews',
        '- Missing required writer category: scheduled maintenance',
      ].join('\n'),
    )
  })

  test('rejects a production storage mutation file absent from the inventory', () => {
    const repoRoot = createFixture()
    const inventoryPath = 'docs/storage-writer-inventory.md'
    writeFixtureFile(repoRoot, inventoryPath, createInventory())
    writeFixtureFile(
      repoRoot,
      'src/lib/storage/unlisted.ts',
      'await chrome.storage.local.set({ urls: [] })\n',
    )

    expect(() =>
      verifyStorageWriterInventory({
        inventoryPath,
        repoRoot,
        sourceRoots: ['src'],
      }),
    ).toThrow(
      [
        'Storage writer inventory verification failed:',
        '- Unlisted storage mutation file: src/lib/storage/unlisted.ts',
      ].join('\n'),
    )
  })

  test('recognizes storage mutation boundaries without matching unrelated setters', () => {
    const repoRoot = createFixture()
    const inventoryPath = 'docs/storage-writer-inventory.md'
    const mutationFiles = [
      'src/lib/storage/direct.ts',
      'src/lib/storage/resolved.ts',
      'src/contexts/example/infrastructure/persistence/chrome-storage/ChromeExampleRepository.ts',
    ]
    writeFixtureFile(
      repoRoot,
      inventoryPath,
      createInventory({ mutationFiles }),
    )
    writeFixtureFile(
      repoRoot,
      mutationFiles[0],
      "await chrome.storage.local.remove('urls')\n",
    )
    writeFixtureFile(
      repoRoot,
      mutationFiles[1],
      'const storageLocal = getChromeStorageLocal()\nawait storageLocal.set({ urls: [] })\n',
    )
    writeFixtureFile(
      repoRoot,
      mutationFiles[2],
      'const port = getChromeStoragePort()\nawait port.set({ urls: [] })\n',
    )
    writeFixtureFile(
      repoRoot,
      'src/features/example/useState.ts',
      'state.set({ urls: [] })\nsetState({ urls: [] })\n',
    )
    writeFixtureFile(
      repoRoot,
      'src/lib/storage/comment-only.ts',
      [
        '// chrome.storage.local.set({ urls: [] })',
        "const example = 'chrome.storage.local.remove()'",
        'const mutationMethod = chrome.storage.local.set',
      ].join('\n'),
    )
    writeFixtureFile(
      repoRoot,
      'src/lib/storage/excluded.test.ts',
      'chrome.storage.local.set({ urls: [] })\n',
    )
    writeFixtureFile(
      repoRoot,
      'src/lib/storage/Example.stories.ts',
      'chrome.storage.local.set({ urls: [] })\n',
    )
    writeFixtureFile(
      repoRoot,
      'src/fixtures/storage-writer.ts',
      'chrome.storage.local.set({ urls: [] })\n',
    )
    writeFixtureFile(
      repoRoot,
      'src/generated/storage-writer.ts',
      'chrome.storage.local.set({ urls: [] })\n',
    )

    expect(() =>
      verifyStorageWriterInventory({
        inventoryPath,
        repoRoot,
        sourceRoots: ['src'],
      }),
    ).not.toThrow()
  })
})
