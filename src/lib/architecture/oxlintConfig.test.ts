import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

const projectRoot = path.resolve(import.meta.dirname, '../../..')
const oxlintConfigPath = path.join(projectRoot, '.oxlintrc.json')
const oxlintPath = path.join(projectRoot, 'node_modules/.bin/oxlint')
const fixtureDirectories: string[] = []

type CommandResult = Readonly<{
  output: string
  status: number
}>

const hasCommandOutput = (
  error: unknown,
): error is { stderr?: unknown; stdout?: unknown; status?: unknown } =>
  typeof error === 'object' && error !== null

const createFixture = (files: Record<string, string>) => {
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'tabbin-oxlint-'))
  fixtureDirectories.push(fixtureRoot)

  const configPath = path.join(fixtureRoot, '.oxlintrc.json')
  copyFileSync(oxlintConfigPath, configPath)
  symlinkSync(
    path.join(projectRoot, 'node_modules'),
    path.join(fixtureRoot, 'node_modules'),
    'dir',
  )

  const sourcePaths = Object.entries(files).map(([relativePath, source]) => {
    const sourcePath = path.join(fixtureRoot, relativePath)
    mkdirSync(path.dirname(sourcePath), { recursive: true })
    writeFileSync(sourcePath, source)
    return sourcePath
  })
  writeFileSync(
    path.join(fixtureRoot, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        module: 'ESNext',
        moduleResolution: 'Bundler',
        strict: true,
        target: 'ES2024',
      },
      include: ['src/**/*.ts', 'src/**/*.tsx'],
    }),
  )

  return {
    configPath,
    rootPath: fixtureRoot,
    sourcePaths,
    tsconfigPath: path.join(fixtureRoot, 'tsconfig.json'),
  }
}

const runOxlintOnFiles = (files: Record<string, string>): CommandResult => {
  const fixture = createFixture(files)

  try {
    execFileSync(
      oxlintPath,
      [
        '--config',
        fixture.configPath,
        '--tsconfig',
        fixture.tsconfigPath,
        '--format',
        'json',
        '--threads',
        '1',
        ...fixture.sourcePaths,
      ],
      { cwd: fixture.rootPath, encoding: 'utf8', stdio: 'pipe' },
    )
    return { status: 0, output: '' }
  } catch (error) {
    if (!hasCommandOutput(error)) {
      throw error
    }

    const stdout = typeof error.stdout === 'string' ? error.stdout : ''
    const stderr = typeof error.stderr === 'string' ? error.stderr : ''
    const status = typeof error.status === 'number' ? error.status : 1
    return { status, output: `${stdout}${stderr}` }
  }
}

const runOxlint = (source: string, relativeSourcePath = 'src/index.ts') =>
  runOxlintOnFiles({ [relativeSourcePath]: source })

afterEach(() => {
  for (const fixtureDirectory of fixtureDirectories.splice(0)) {
    rmSync(fixtureDirectory, { recursive: true, force: true })
  }
})

describe('oxlint configuration', () => {
  it('keeps context layer fixture sources outside the production checkout', () => {
    const relativeSourcePath =
      'src/contexts/saved-tabs/domain/services/IsolatedDomainService.ts'
    const fixture = createFixture({
      [relativeSourcePath]: 'export const value = 1\n',
    })
    const sourcePath = path.join(fixture.rootPath, relativeSourcePath)

    expect(path.relative(projectRoot, sourcePath).split(path.sep)[0]).toBe('..')
    expect(fixture.sourcePaths).toEqual([sourcePath])
  })

  it('disallows type assertions except as const', () => {
    const config = JSON.parse(readFileSync(oxlintConfigPath, 'utf8'))

    expect(config.rules['typescript/consistent-type-assertions']).toEqual([
      'error',
      {
        arrayLiteralTypeAssertions: 'never',
        assertionStyle: 'never',
        objectLiteralTypeAssertions: 'never',
      },
    ])
  })

  it('disallows empty object types and empty interfaces', () => {
    const config = JSON.parse(readFileSync(oxlintConfigPath, 'utf8'))

    expect(config.rules['typescript/no-empty-object-type']).toEqual([
      'error',
      {
        allowInterfaces: 'never',
        allowObjectTypes: 'never',
      },
    ])
  })

  it('enforces type over interface for object type definitions', () => {
    const config = JSON.parse(readFileSync(oxlintConfigPath, 'utf8'))

    expect(config.rules['typescript/consistent-type-definitions']).toEqual([
      'error',
      'type',
    ])
  })

  it('reports interface declarations as consistent-type-definitions errors', () => {
    const result = runOxlint(`
interface SavedTab {
  title: string
}

export const tab: SavedTab = { title: 'test' }
`)

    expect(result.status).not.toBe(0)
    expect(result.output).toContain('typescript/consistent-type-definitions')
  })

  it('accepts type alias declarations for object types', () => {
    const result = runOxlint(`
type SavedTab = {
  title: string
}

export const tab: SavedTab = { title: 'test' }
`)

    expect(result).toEqual({ status: 0, output: '' })
  })

  it('disables consistent-type-definitions for .d.ts files', () => {
    const config = JSON.parse(readFileSync(oxlintConfigPath, 'utf8'))

    expect(config.overrides).toContainEqual({
      files: ['src/**/*.d.ts'],
      rules: {
        'typescript/consistent-type-definitions': 'off',
      },
    })
  })

  it('disallows parameter reassignment in contexts domain and application layers', () => {
    const config = JSON.parse(readFileSync(oxlintConfigPath, 'utf8'))

    expect(config.overrides).toContainEqual({
      files: [
        'src/contexts/*/domain/**/*.{ts,tsx}',
        'src/contexts/*/application/**/*.{ts,tsx}',
      ],
      rules: expect.objectContaining({
        'eslint/no-param-reassign': [
          'error',
          {
            props: true,
          },
        ],
      }),
    })
  })

  it('allows const assertions for literal values', () => {
    const result = runOxlint(`
const statuses = ['saved', 'archived'] as const

export const firstStatus = statuses[0]
`)

    expect(result).toEqual({ status: 0, output: '' })
  })

  it('reports non-const type assertions as errors', () => {
    const result = runOxlint(`
type User = {
  id: string
}

const rawUser: unknown = {
  id: '1',
}

export const user = rawUser as User
`)

    expect(result.status).not.toBe(0)
    expect(result.output).toContain('typescript/consistent-type-assertions')
  })

  it('reports empty type literals and empty interfaces as errors', () => {
    const result = runOxlint(`
type Props = {}

type Options = {}

export const props: Props = {}
export const options: Options = {}
`)

    expect(result.status).not.toBe(0)
    expect(result.output).toContain('typescript/no-empty-object-type')
  })

  it('reports parameter property mutation in contexts domain files', () => {
    const result = runOxlint(
      `
type SavedTab = {
  title: string
}

export const renameTab = (tab: SavedTab): SavedTab => {
  tab.title = 'new title'

  return tab
}
`,
      'src/contexts/saved-tabs/domain/services/MutatingDomainService.ts',
    )

    expect(result.status).not.toBe(0)
    expect(result.output).toContain('eslint/no-param-reassign')
  })

  it('does not apply parameter reassignment restrictions to presentation files', () => {
    const result = runOxlint(
      `
type SavedTab = {
  title: string
}

export const renameTab = (tab: SavedTab): SavedTab => {
  tab.title = 'new title'

  return tab
}
`,
      'src/contexts/saved-tabs/presentation/services/MutatingPresentationService.ts',
    )

    expect(result).toEqual({ status: 0, output: '' })
  })

  it('reports synchronous browser dialog globals in production src', () => {
    const result = runOxlint(
      `
export const showUnsafeDialogs = (): void => {
  alert('saved')
  window.confirm('delete')
  globalThis.prompt('name')
}
`,
      'src/contexts/saved-tabs/infrastructure/browser/UnsafeDialogAdapter.ts',
    )

    expect(result.status).not.toBe(0)
    expect(result.output).toContain('eslint/no-restricted-globals')
    expect(result.output).toContain('eslint/no-restricted-properties')
  })

  it('does not apply browser dialog global restrictions to test files', () => {
    const result = runOxlint(
      `
export const showUnsafeDialogsInTest = (): void => {
  alert('test')
  window.confirm('test')
  globalThis.prompt('test')
}
`,
      'src/contexts/saved-tabs/infrastructure/browser/UnsafeDialogAdapter.test.ts',
    )

    expect(result).toEqual({ status: 0, output: '' })
  })

  it('does not report browser dialog global restrictions in story files', () => {
    const result = runOxlint(
      `
import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  title: 'Fixture/UnsafeDialogAdapter',
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

export const UnsafeDialogStory = {
  render: (): null => {
    alert('story')
    window.confirm('story')
    globalThis.prompt('story')

    return null
  },
} satisfies Story
`,
      'src/contexts/saved-tabs/infrastructure/browser/UnsafeDialogAdapter.stories.ts',
    )

    expect(result.output).not.toContain('eslint/no-alert')
    expect(result.output).not.toContain('eslint/no-restricted-globals')
    expect(result.output).not.toContain('eslint/no-restricted-properties')
  })
})

type Diagnostic = {
  code?: string
  filename: string
  labels: { span: { line: number } }[]
  message: string
  severity: string
}

const sharedRestrictions = [
  ['alert("message")', 'globals'],
  ['confirm("message")', 'globals'],
  ['prompt("message")', 'globals'],
  ['new DOMParser()', 'globals'],
  ['window.alert("message")', 'properties'],
  ['window.confirm("message")', 'properties'],
  ['window.prompt("message")', 'properties'],
  ['globalThis.alert("message")', 'properties'],
  ['globalThis.confirm("message")', 'properties'],
  ['globalThis.prompt("message")', 'properties'],
  ['document.body.innerHTML', 'properties'],
  ['document.body.outerHTML', 'properties'],
  ['document.body.insertAdjacentHTML', 'properties'],
  ['document.write', 'properties'],
] as const
const storageRestrictions = [
  ['chrome', 'globals'],
  ['chrome.tabs', 'properties'],
  ['localStorage', 'globals'],
  ['window.indexedDB', 'properties'],
] as const
const coreRestrictions = [
  ['fetch("/example")', 'globals'],
  ['Date.now()', 'properties'],
] as const
const restrictions = [
  ...sharedRestrictions,
  ...storageRestrictions,
  ...coreRestrictions,
]
const restrictedSource = restrictions
  .map(([expression]) => expression)
  .join('\n')

const lintFixtures = (files: Record<string, string>) => {
  const { output, status } = runOxlintOnFiles(files)
  const diagnostics = output
    ? (JSON.parse(output) as { diagnostics: Diagnostic[] }).diagnostics
    : []
  return { diagnostics, status }
}

describe('Oxlint production API restrictions', () => {
  const layers = [
    [
      'src/contexts/fixture/domain/rules.ts',
      [...storageRestrictions, ...coreRestrictions],
    ],
    [
      'src/contexts/fixture/application/use-case.ts',
      [...storageRestrictions, ...coreRestrictions],
    ],
    ['src/contexts/fixture/presentation/view.tsx', storageRestrictions],
    ['src/features/fixture/model.ts', storageRestrictions],
    ['src/components/fixture/View.tsx', storageRestrictions],
    ['src/contexts/fixture/infrastructure/adapter.ts', []],
    ['src/lib/fixture/adapter.ts', []],
    ['src/entrypoints/fixture.ts', []],
  ] as const

  it('applies shared and layer-specific restrictions while allowing storage adapters', () => {
    const files = Object.fromEntries(
      layers.map(([file]) => [file, restrictedSource]),
    )
    const { status, diagnostics } = lintFixtures(files)
    expect(status).toBe(1)

    for (const [file, layerRestrictions] of layers) {
      const expected = new Set([...sharedRestrictions, ...layerRestrictions])
      for (const [index, restriction] of restrictions.entries()) {
        const [expression, rule] = restriction
        const detected = diagnostics.some(
          ({ code, filename, labels }) =>
            (filename === file || filename.endsWith(`/${file}`)) &&
            code === `eslint(no-restricted-${rule})` &&
            labels[0]?.span.line === index + 1,
        )
        expect({ detected, file, expression }).toEqual({
          detected: expected.has(restriction),
          file,
          expression,
        })
      }
    }
  })

  it('preserves the browser API exceptions for tests and stories', () => {
    const { diagnostics } = lintFixtures({
      'src/features/fixture/model.test.ts': restrictedSource,
      'src/features/fixture/View.stories.tsx': restrictedSource,
    })
    expect(
      diagnostics.filter(({ code }) => code?.includes('no-restricted-')),
    ).toEqual([])
  })

  it('errors on unused directives and accepts a directive suppressing a violation', () => {
    const { diagnostics, status } = lintFixtures({
      'src/lib/fixture/adapter.ts': [
        '// oxlint-disable-next-line eslint/no-restricted-globals -- No restricted API below.',
        'export const value = true',
        '// oxlint-disable-next-line eslint/no-restricted-globals -- Intentional fixture exception.',
        'alert("message")',
      ].join('\n'),
    })
    expect(status).toBe(1)
    expect(diagnostics).toEqual([
      expect.objectContaining({
        message: expect.stringMatching(
          /unused (?:oxlint-)?disable directive/iu,
        ),
        severity: 'error',
      }),
    ])
    expect(diagnostics[0]?.labels[0]?.span.line).toBe(1)
  })
})

it('reports an unawaited Vitest poll and accepts an awaited poll', () => {
  const { diagnostics, status } = lintFixtures({
    'src/utils/poll.test.ts': [
      'import { expect, it } from "vitest"',
      'it("checks both forms", async () => {',
      '  expect.poll(() => true).toBe(true)',
      '  await expect.poll(() => true).toBe(true)',
      '})',
    ].join('\n'),
  })
  expect(status).toBe(1)
  const pollDiagnostics = diagnostics.filter(
    ({ code }) => code === 'vitest(require-awaited-expect-poll)',
  )
  expect(pollDiagnostics.map(({ labels }) => labels[0]?.span.line)).toEqual([3])
})
