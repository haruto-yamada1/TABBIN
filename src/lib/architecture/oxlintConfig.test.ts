import { execFileSync } from 'node:child_process'
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
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

const createFixture = (source: string, relativeSourcePath = 'src/index.ts') => {
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'tabbin-oxlint-'))
  fixtureDirectories.push(fixtureRoot)

  const isContextLayerFixture = relativeSourcePath.startsWith('src/contexts/')
  const sourcePath = isContextLayerFixture
    ? createContextLayerFixturePath(relativeSourcePath)
    : path.join(fixtureRoot, relativeSourcePath)
  mkdirSync(path.dirname(sourcePath), { recursive: true })
  writeFileSync(sourcePath, source)
  writeFileSync(
    path.join(fixtureRoot, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        module: 'ESNext',
        moduleResolution: 'Bundler',
        strict: true,
        target: 'ES2024',
      },
      include: ['src/**/*.ts'],
    }),
  )

  return {
    sourcePath,
    tsconfigPath: path.join(fixtureRoot, 'tsconfig.json'),
  }
}

const createContextLayerFixturePath = (relativeSourcePath: string): string => {
  const contextFixtureRoot = mkdtempSync(
    path.join(projectRoot, 'src/contexts/__oxlint-fixture-'),
  )
  fixtureDirectories.push(contextFixtureRoot)

  return path.join(
    contextFixtureRoot,
    relativeSourcePath.replace(/^src\/contexts\/[^/]+\//, ''),
  )
}

const runOxlint = (
  source: string,
  relativeSourcePath?: string,
): CommandResult => {
  const fixture = createFixture(source, relativeSourcePath)

  try {
    execFileSync(
      oxlintPath,
      [
        '--config',
        oxlintConfigPath,
        '--tsconfig',
        fixture.tsconfigPath,
        '--format',
        'json',
        fixture.sourcePath,
      ],
      { encoding: 'utf8', stdio: 'pipe' },
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

afterEach(() => {
  for (const fixtureDirectory of fixtureDirectories.splice(0)) {
    rmSync(fixtureDirectory, { recursive: true, force: true })
  }
})

describe('oxlint configuration', () => {
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

  it('disallows parameter reassignment in contexts domain and application layers', () => {
    const config = JSON.parse(readFileSync(oxlintConfigPath, 'utf8'))

    expect(config.overrides).toContainEqual({
      files: [
        'src/contexts/*/domain/**/*.{ts,tsx}',
        'src/contexts/*/application/**/*.{ts,tsx}',
      ],
      rules: {
        'eslint/no-param-reassign': [
          'error',
          {
            props: true,
          },
        ],
      },
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
interface User {
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

interface Options {}

export const props: Props = {}
export const options: Options = {}
`)

    expect(result.status).not.toBe(0)
    expect(result.output).toContain('typescript/no-empty-object-type')
  })

  it('reports parameter property mutation in contexts domain files', () => {
    const result = runOxlint(
      `
interface SavedTab {
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
interface SavedTab {
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
