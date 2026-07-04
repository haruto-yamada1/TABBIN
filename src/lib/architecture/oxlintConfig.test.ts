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

const createFixture = (source: string) => {
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'tabbin-oxlint-'))
  fixtureDirectories.push(fixtureRoot)

  const sourcePath = path.join(fixtureRoot, 'src/index.ts')
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

const runOxlint = (source: string): CommandResult => {
  const fixture = createFixture(source)

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
})
