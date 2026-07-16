import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, test } from 'vitest'

import {
  containsStorageMutationBoundary,
  verifyStorageWriterInventory,
} from './verify-storage-writer-inventory'

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

const expectMissingScheduledMaintenance = (inventory: string): void => {
  const repoRoot = createFixture()
  const inventoryPath = 'docs/storage-writer-inventory.md'
  writeFixtureFile(repoRoot, inventoryPath, inventory)
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
      '- Missing required writer category: scheduled maintenance',
    ].join('\n'),
  )
}

afterEach(() => {
  for (const fixtureRoot of fixtureRoots.splice(0)) {
    rmSync(fixtureRoot, { force: true, recursive: true })
  }
})

describe('verifyStorageWriterInventory', () => {
  test('accepts the authoritative inventory for the real repository', () => {
    expect(() =>
      verifyStorageWriterInventory({
        inventoryPath: 'docs/architecture/current-storage-writer-inventory.md',
        repoRoot: process.cwd(),
        sourceRoots: ['src'],
      }),
    ).not.toThrow()
  })

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

  test('does not accept required items mentioned outside designated sections', () => {
    const repoRoot = createFixture()
    const inventoryPath = 'docs/storage-writer-inventory.md'
    const mutationFile = 'src/lib/storage/unlisted.ts'
    writeFixtureFile(
      repoRoot,
      inventoryPath,
      `${createInventory({
        storageKeys: REQUIRED_STORAGE_KEYS.filter(
          (key) => key !== 'savedAnalyticsViews',
        ),
        writerCategories: REQUIRED_WRITER_CATEGORIES.filter(
          (category) => category !== 'scheduled maintenance',
        ),
      })}
## Notes

- \`savedAnalyticsViews\`
- scheduled maintenance
- \`${mutationFile}\`
`,
    )
    writeFixtureFile(
      repoRoot,
      mutationFile,
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
        '- Missing required storage key: savedAnalyticsViews',
        '- Missing required writer category: scheduled maintenance',
        `- Unlisted storage mutation file: ${mutationFile}`,
      ].join('\n'),
    )
  })

  test('requires exact list entries inside designated sections', () => {
    const repoRoot = createFixture()
    const inventoryPath = 'docs/storage-writer-inventory.md'
    const mutationFile = 'src/lib/storage/unlisted.ts'
    const inventory = createInventory({
      storageKeys: REQUIRED_STORAGE_KEYS.filter(
        (key) => key !== 'savedAnalyticsViews',
      ),
      writerCategories: REQUIRED_WRITER_CATEGORIES.filter(
        (category) => category !== 'scheduled maintenance',
      ),
    })
      .replace(
        '## Writer categories',
        '- `savedAnalyticsViews` is pending\n\n## Writer categories',
      )
      .replace(
        '## Mutation files',
        '- scheduled maintenance is planned\n\n## Mutation files',
      )
      .concat(`- see \`${mutationFile}\` for details\n`)
    writeFixtureFile(repoRoot, inventoryPath, inventory)
    writeFixtureFile(
      repoRoot,
      mutationFile,
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
        '- Missing required storage key: savedAnalyticsViews',
        '- Missing required writer category: scheduled maintenance',
        `- Unlisted storage mutation file: ${mutationFile}`,
      ].join('\n'),
    )
  })

  test.each([
    {
      fencedContent: ['```markdown', '- scheduled maintenance', '```'].join(
        '\n',
      ),
      name: 'backtick-fenced list',
    },
    {
      fencedContent: [
        '~~~markdown',
        '| Entry |',
        '| --- |',
        '| scheduled maintenance |',
        '~~~',
      ].join('\n'),
      name: 'tilde-fenced table',
    },
  ])('ignores a $name inside a designated section', ({ fencedContent }) => {
    expect.hasAssertions()
    const inventory = createInventory({
      writerCategories: REQUIRED_WRITER_CATEGORIES.filter(
        (category) => category !== 'scheduled maintenance',
      ),
    }).replace('## Mutation files', `${fencedContent}\n\n## Mutation files`)

    expectMissingScheduledMaintenance(inventory)
  })

  test('does not activate a designated section from a fenced heading', () => {
    expect.hasAssertions()
    const inventory = createInventory({
      writerCategories: REQUIRED_WRITER_CATEGORIES.filter(
        (category) => category !== 'scheduled maintenance',
      ),
    }).replace(
      '## Mutation files',
      [
        '## Notes',
        '',
        '```markdown',
        '## Writer categories',
        '- scheduled maintenance',
        '```',
        '',
        '## Mutation files',
      ].join('\n'),
    )

    expectMissingScheduledMaintenance(inventory)
  })

  test.each([
    { indentedLine: '    - scheduled maintenance', name: 'four spaces' },
    {
      indentedLine: '  \t- scheduled maintenance',
      name: 'spaces followed by a tab',
    },
  ])('ignores CommonMark code indented with $name', ({ indentedLine }) => {
    expect.hasAssertions()
    const inventory = createInventory({
      writerCategories: REQUIRED_WRITER_CATEGORIES.filter(
        (category) => category !== 'scheduled maintenance',
      ),
    }).replace('## Mutation files', `${indentedLine}\n\n## Mutation files`)

    expectMissingScheduledMaintenance(inventory)
  })

  test('accepts exact entries in structured Markdown tables', () => {
    const repoRoot = createFixture()
    const inventoryPath = 'docs/storage-writer-inventory.md'
    const table = (values: readonly string[]): string =>
      ['| Entry |', '| --- |', ...values.map((value) => `| ${value} |`)].join(
        '\n',
      )
    writeFixtureFile(
      repoRoot,
      inventoryPath,
      `# Current storage writer inventory

## Storage keys

${table(REQUIRED_STORAGE_KEYS.map((key) => `\`${key}\``))}

## Writer categories

${table(REQUIRED_WRITER_CATEGORIES)}

## Mutation files

${table([])}
`,
    )
    writeFixtureFile(repoRoot, 'src/empty.ts', 'export {}\n')

    expect(() =>
      verifyStorageWriterInventory({
        inventoryPath,
        repoRoot,
        sourceRoots: ['src'],
      }),
    ).not.toThrow()
  })

  test.each([
    {
      name: 'direct chrome storage call',
      relativePath: 'src/lib/storage/direct.ts',
      sourceCode: 'await chrome.storage.local.set({ urls: [] })',
    },
    {
      name: 'optional chained chrome storage call',
      relativePath: 'src/lib/storage/direct.ts',
      sourceCode: 'await chrome?.storage?.local?.remove?.(`urls`)',
    },
    {
      name: 'resolved storageLocal call',
      relativePath: 'src/lib/storage/resolved.ts',
      sourceCode: 'await storageLocal.set({ urls: [] })',
    },
    {
      name: 'optional chained resolved storageLocal call',
      relativePath: 'src/lib/storage/resolved.ts',
      sourceCode: 'await storageLocal?.remove?.(`urls`)',
    },
    {
      name: 'Chrome storage repository port set',
      relativePath:
        'src/contexts/example/infrastructure/persistence/chrome-storage/ChromeExampleRepository.ts',
      sourceCode: 'await port.set({ urls: [] })',
    },
    {
      name: 'Chrome storage repository port remove',
      relativePath:
        'src/contexts/example/infrastructure/persistence/chrome-storage/ChromeExampleRepository.ts',
      sourceCode: 'await port.remove(`urls`)',
    },
    {
      name: 'mutation inside a template expression',
      relativePath: 'src/lib/storage/template.ts',
      sourceCode: `const result = \`\${chrome.storage.local.set({ urls: [] })}\``,
    },
    {
      name: 'real mutation after a regex literal containing an apostrophe',
      relativePath: 'src/lib/storage/regex-before-mutation.ts',
      sourceCode:
        "const pattern = /'/\nawait chrome.storage.local.remove('urls')",
    },
  ])('recognizes $name', ({ relativePath, sourceCode }) => {
    expect(containsStorageMutationBoundary(sourceCode, relativePath)).toBe(true)
  })

  test.each([
    {
      name: 'regex literal',
      sourceCode: 'const pattern = /chrome.storage.local.set()/',
    },
    {
      name: 'line comment',
      sourceCode: '// chrome.storage.local.set({ urls: [] })',
    },
    {
      name: 'string literal',
      sourceCode: "const example = 'chrome.storage.local.remove()'",
    },
    {
      name: 'method reference',
      sourceCode: 'const mutationMethod = chrome.storage.local.set',
    },
    {
      name: 'unrelated state setters',
      sourceCode: 'state.set({ urls: [] })\nsetState({ urls: [] })',
    },
  ])('does not match a $name', ({ sourceCode }) => {
    expect(
      containsStorageMutationBoundary(
        sourceCode,
        'src/features/example/useState.ts',
      ),
    ).toBe(false)
  })

  test('excludes non-production mutation fixtures from the inventory scan', () => {
    const repoRoot = createFixture()
    const inventoryPath = 'docs/storage-writer-inventory.md'
    writeFixtureFile(repoRoot, inventoryPath, createInventory())
    writeFixtureFile(
      repoRoot,
      'src/lib/storage/non-mutation.ts',
      [
        'const pattern = /chrome.storage.local.set()/',
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
