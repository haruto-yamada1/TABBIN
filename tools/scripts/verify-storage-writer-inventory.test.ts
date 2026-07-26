import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, test } from 'vitest'

import {
  containsStorageMutationBoundary,
  parseStorageWriterInventory,
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
  'PERSISTENCE-CONTROL-STATE',
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

const DEFAULT_MUTATION_FILE = 'src/lib/storage/listed.ts'

const createWriterTable = ({
  columns = REQUIRED_WRITER_COLUMNS,
  ids = CURRENT_WRITER_IDS,
  mutationFileById = () => 'src/lib/storage/listed.ts',
  valueByCell,
}: {
  readonly columns?: readonly string[]
  readonly ids?: readonly string[]
  readonly mutationFileById?: (id: string, index: number) => string
  readonly valueByCell?: (
    column: string,
    id: string,
    rowIndex: number,
  ) => string | undefined
} = {}): string => {
  const rows = ids.map((id, rowIndex) => {
    const cells = columns.map((column) => {
      const override = valueByCell?.(column, id, rowIndex)
      if (override !== undefined) {
        return override
      }
      if (column === 'ID') {
        return id
      }
      if (column === 'Mutation boundary') {
        return `\`${mutationFileById(id, rowIndex)}\`: mutation`
      }
      return `${column} value`
    })
    return `| ${cells.join(' | ')} |`
  })

  return [
    `| ${columns.join(' | ')} |`,
    `| ${columns.map(() => '---').join(' | ')} |`,
    ...rows,
  ].join('\n')
}

const fixtureRoots: string[] = []

const createFixture = (): string => {
  const repoRoot = mkdtempSync(
    path.join(tmpdir(), 'tabbin-storage-writer-inventory-'),
  )
  fixtureRoots.push(repoRoot)
  const defaultMutationPath = path.join(repoRoot, DEFAULT_MUTATION_FILE)
  mkdirSync(path.dirname(defaultMutationPath), { recursive: true })
  writeFileSync(
    defaultMutationPath,
    'await chrome.storage.local.set({ urls: [] })\n',
  )
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
  mutationFiles = [DEFAULT_MUTATION_FILE],
  writerTable = createWriterTable(),
}: {
  readonly storageKeys?: readonly string[]
  readonly writerCategories?: readonly string[]
  readonly mutationFiles?: readonly string[]
  readonly writerTable?: string
} = {}): string => `# Current storage writer inventory

## Storage keys

${storageKeys.map((key) => `- \`${key}\``).join('\n')}

## Writer categories

${writerCategories.map((category) => `- ${category}`).join('\n')}

## Current writer inventory

${writerTable}

## Mutation files

${mutationFiles.map((file) => `- \`${file}\``).join('\n')}
`

const createContractInventory = ({
  mutationFiles,
  writerTable = createWriterTable(),
}: {
  readonly mutationFiles: readonly string[]
  readonly writerTable?: string
}): string => createInventory({ mutationFiles, writerTable })

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

  test.each([
    'src/contexts/saved-tabs/infrastructure/composition/createSavedTabsUseCasesDeps.ts',
  ])(
    'discovers and maps the real repository alias writer %s',
    (relativePath) => {
      const sourceCode = readFileSync(
        path.join(process.cwd(), relativePath),
        'utf8',
      )
      const inventory = parseStorageWriterInventory(
        readFileSync(
          path.join(
            process.cwd(),
            'docs/architecture/current-storage-writer-inventory.md',
          ),
          'utf8',
        ),
      )

      expect(containsStorageMutationBoundary(sourceCode, relativePath)).toBe(
        true,
      )
      expect(
        inventory.writerTable.rows.some((row) =>
          row.fileReferences.has(relativePath),
        ),
      ).toBe(true)
      expect(inventory.mutationFiles.has(relativePath)).toBe(true)
    },
  )

  test('does not classify the app repository composition as a writer after settings-port separation', () => {
    const relativePath = 'src/app/composition/createSavedTabsRepositories.ts'
    const sourceCode = readFileSync(
      path.join(process.cwd(), relativePath),
      'utf8',
    )
    const inventory = parseStorageWriterInventory(
      readFileSync(
        path.join(
          process.cwd(),
          'docs/architecture/current-storage-writer-inventory.md',
        ),
        'utf8',
      ),
    )

    expect(containsStorageMutationBoundary(sourceCode, relativePath)).toBe(
      false,
    )
    expect(
      inventory.writerTable.rows.some((row) =>
        row.fileReferences.has(relativePath),
      ),
    ).toBe(false)
    expect(inventory.mutationFiles.has(relativePath)).toBe(false)
  })

  test('rejects deletion of a writer row from the current baseline', () => {
    const repoRoot = createFixture()
    const inventoryPath = 'docs/storage-writer-inventory.md'
    const mutationFile = 'src/lib/storage/listed.ts'
    writeFixtureFile(
      repoRoot,
      inventoryPath,
      createContractInventory({
        mutationFiles: [mutationFile],
        writerTable: createWriterTable({
          ids: CURRENT_WRITER_IDS.slice(0, -1),
        }),
      }),
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
    ).toThrow('Writer ID baseline mismatch: expected 39 rows, found 38')
  })

  test.each([
    {
      columns: REQUIRED_WRITER_COLUMNS.slice(0, -1),
      name: 'missing required column',
    },
    {
      columns: [...REQUIRED_WRITER_COLUMNS, 'Unexpected'],
      name: 'malformed extra column',
    },
  ])('rejects a writer table with a $name', ({ columns }) => {
    const repoRoot = createFixture()
    const inventoryPath = 'docs/storage-writer-inventory.md'
    const mutationFile = 'src/lib/storage/listed.ts'
    writeFixtureFile(
      repoRoot,
      inventoryPath,
      createContractInventory({
        mutationFiles: [mutationFile],
        writerTable: createWriterTable({ columns }),
      }),
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
    ).toThrow('Writer table columns mismatch')
  })

  test.each([
    {
      expected: 'Duplicate writer ID: UI-THEME',
      ids: CURRENT_WRITER_IDS.map((id, index) =>
        index === 1 ? 'UI-THEME' : id,
      ),
      name: 'duplicate ID',
    },
    {
      expected: 'Writer row 1 has an empty ID',
      ids: CURRENT_WRITER_IDS.map((id, index) => (index === 0 ? '' : id)),
      name: 'empty ID',
    },
  ])('rejects a writer row with a $name', ({ expected, ids }) => {
    const repoRoot = createFixture()
    const inventoryPath = 'docs/storage-writer-inventory.md'
    const mutationFile = 'src/lib/storage/listed.ts'
    writeFixtureFile(
      repoRoot,
      inventoryPath,
      createContractInventory({
        mutationFiles: [mutationFile],
        writerTable: createWriterTable({ ids }),
      }),
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
    ).toThrow(expected)
  })

  test('rejects an empty non-ID writer cell', () => {
    const repoRoot = createFixture()
    const inventoryPath = 'docs/storage-writer-inventory.md'
    const mutationFile = 'src/lib/storage/listed.ts'
    writeFixtureFile(
      repoRoot,
      inventoryPath,
      createContractInventory({
        mutationFiles: [mutationFile],
        writerTable: createWriterTable({
          valueByCell: (column, _id, rowIndex) =>
            column === 'Context' && rowIndex === 0 ? '' : undefined,
        }),
      }),
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
    ).toThrow('Writer row UI-THEME has an empty Context cell')
  })

  test('rejects a stale mutation file in the appendix', () => {
    const repoRoot = createFixture()
    const inventoryPath = 'docs/storage-writer-inventory.md'
    const mutationFile = 'src/lib/storage/listed.ts'
    const staleFile = 'src/lib/storage/stale.ts'
    writeFixtureFile(
      repoRoot,
      inventoryPath,
      createContractInventory({ mutationFiles: [mutationFile, staleFile] }),
    )
    writeFixtureFile(
      repoRoot,
      mutationFile,
      'await chrome.storage.local.set({ urls: [] })\n',
    )
    writeFixtureFile(repoRoot, staleFile, 'export {}\n')

    expect(() =>
      verifyStorageWriterInventory({
        inventoryPath,
        repoRoot,
        sourceRoots: ['src'],
      }),
    ).toThrow(`Stale mutation file in appendix: ${staleFile}`)
  })

  test('rejects a discovered mutation file without a writer row', () => {
    const repoRoot = createFixture()
    const inventoryPath = 'docs/storage-writer-inventory.md'
    const listedFile = 'src/lib/storage/listed.ts'
    const unmappedFile = 'src/lib/storage/unmapped.ts'
    writeFixtureFile(
      repoRoot,
      inventoryPath,
      createContractInventory({
        mutationFiles: [listedFile, unmappedFile],
      }),
    )
    for (const mutationFile of [listedFile, unmappedFile]) {
      writeFixtureFile(
        repoRoot,
        mutationFile,
        'await chrome.storage.local.set({ urls: [] })\n',
      )
    }

    expect(() =>
      verifyStorageWriterInventory({
        inventoryPath,
        repoRoot,
        sourceRoots: ['src'],
      }),
    ).toThrow(`Storage mutation file has no writer row: ${unmappedFile}`)
  })

  test('rejects a writer row reference that is not a current mutation file', () => {
    const repoRoot = createFixture()
    const inventoryPath = 'docs/storage-writer-inventory.md'
    const mutationFile = 'src/lib/storage/listed.ts'
    const staleFile = 'src/lib/storage/stale.ts'
    writeFixtureFile(
      repoRoot,
      inventoryPath,
      createContractInventory({
        mutationFiles: [mutationFile],
        writerTable: createWriterTable({
          mutationFileById: (_id, index) =>
            index === 0 ? staleFile : mutationFile,
        }),
      }),
    )
    writeFixtureFile(
      repoRoot,
      mutationFile,
      'await chrome.storage.local.set({ urls: [] })\n',
    )
    writeFixtureFile(repoRoot, staleFile, 'export {}\n')

    expect(() =>
      verifyStorageWriterInventory({
        inventoryPath,
        repoRoot,
        sourceRoots: ['src'],
      }),
    ).toThrow(
      `Writer row UI-THEME references a non-mutation file: ${staleFile}`,
    )
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

## Current writer inventory

${createWriterTable()}

## Mutation files

${table([`\`${DEFAULT_MUTATION_FILE}\``])}
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
      name: 'storageLocal bound to the remove-only storage adapter',
      relativePath: 'src/features/navigation/app/AppRouter.tsx',
      sourceCode: [
        'const storageLocal = getStorageLocalRemove()',
        "await storageLocal.remove('viewMode')",
      ].join('\n'),
    },
    {
      name: 'getChromeStorageLocal local alias set',
      relativePath: 'src/lib/storage/resolved.ts',
      sourceCode:
        'const local = getChromeStorageLocal()\nawait local?.set({ urls: [] })',
    },
    {
      name: 'getChromeStorageLocal arbitrary alias remove',
      relativePath: 'src/lib/storage/resolved.ts',
      sourceCode:
        "const browserStore = getChromeStorageLocal()\nawait browserStore?.remove('urls')",
    },
    {
      name: 'getChromeStorageLocal arbitrary alias clear',
      relativePath: 'src/lib/storage/resolved.ts',
      sourceCode:
        'const persistedState = getChromeStorageLocal()\nawait persistedState?.clear()',
    },
    {
      name: 'getChromeStorageLocal arbitrary alias from a nested closure',
      relativePath: 'src/lib/storage/resolved.ts',
      sourceCode: [
        'const chromeLocalStore = getChromeStorageLocal()',
        'const removeStoredUrls = async () => {',
        "  await chromeLocalStore?.remove('urls')",
        '}',
      ].join('\n'),
    },
    {
      name: 'gated persistence storage local alias set',
      relativePath: 'src/lib/storage/resolved.ts',
      sourceCode:
        'const storage = getPersistenceStorageLocal()\nawait storage?.set({ urls: [] })',
    },
    {
      name: 'required gated persistence storage direct remove',
      relativePath: 'src/lib/storage/resolved.ts',
      sourceCode: "await getRequiredPersistenceStorageLocal().remove('urls')",
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
      name: 'persistence control-state repository storage set',
      relativePath:
        'src/contexts/saved-tabs/infrastructure/persistence/control-plane/ChromePersistenceControlStateRepository.ts',
      sourceCode: 'await storage.set({ controlState: next })',
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
    {
      name: 'unrelated local alias setter',
      sourceCode: 'const local = otherFactory()\nawait local.set({ urls: [] })',
    },
    {
      name: 'storageLocal parameter shadowing the resolved storage binding',
      sourceCode: [
        'const updateMap = (storageLocal: Map<string, unknown>) => {',
        "  storageLocal.set('urls', [])",
        '}',
      ].join('\n'),
    },
    {
      name: 'local Map named storageLocal',
      sourceCode: [
        'const storageLocal = new Map<string, unknown>()',
        "storageLocal.set('urls', [])",
      ].join('\n'),
    },
    {
      name: 'function parameter shadowing a storage alias',
      sourceCode: [
        'const chromeLocalStore = getChromeStorageLocal()',
        'const updateMap = (chromeLocalStore: Map<string, unknown>) => {',
        "  chromeLocalStore.set('urls', [])",
        '}',
      ].join('\n'),
    },
    {
      name: 'block variable shadowing a storage alias',
      sourceCode: [
        'const browserStorage = getChromeStorageLocal()',
        '{',
        '  const browserStorage = new Map<string, unknown>()',
        '  browserStorage.clear()',
        '}',
      ].join('\n'),
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
