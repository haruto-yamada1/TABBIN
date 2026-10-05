import { spawnSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const repositoryRoot = process.cwd()
const cli = path.join(repositoryRoot, 'tools/legacy-tooling/arch-check.mjs')

const checkFixture = (source: string) => {
  const directory = mkdtempSync(path.join(tmpdir(), 'tabbin-architecture-'))
  try {
    mkdirSync(path.join(directory, 'src'))
    mkdirSync(path.join(directory, 'node_modules'))
    symlinkSync(
      path.join(repositoryRoot, 'node_modules/typescript'),
      path.join(directory, 'node_modules/typescript'),
      'dir',
    )
    writeFileSync(path.join(directory, 'package.json'), '{"type":"module"}')
    writeFileSync(
      path.join(directory, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          baseUrl: '.',
          paths: { '@/*': ['./src/*'] },
        },
        include: ['src/**/*.ts'],
      }),
    )
    writeFileSync(
      path.join(directory, 'src/value.ts'),
      'export const value = 1; export type Value = number',
    )
    writeFileSync(path.join(directory, 'src/entry.ts'), source)
    writeFileSync(
      path.join(directory, '.dependency-cruiser.cjs'),
      `module.exports = {
        forbidden: [
          { name: 'unresolved', severity: 'error', from: {}, to: { couldNotResolve: true } },
          { name: 'forbidden-type-only', severity: 'error', from: {}, to: { dependencyTypes: ['type-only'] } }
        ],
        options: {
          parser: 'swc', tsPreCompilationDeps: true,
          tsConfig: { fileName: 'tsconfig.json' },
          enhancedResolveOptions: { extensions: ['.ts', '.js'] }
        }
      }`,
    )
    return spawnSync(
      process.execPath,
      [
        cli,
        '--config',
        '.dependency-cruiser.cjs',
        'src',
        '--output-type',
        'err',
      ],
      { cwd: directory, encoding: 'utf8', timeout: 15000 },
    )
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

describe('architecture tooling with canonical TypeScript 7', () => {
  it('resolves tsconfig aliases using the supported legacy compiler without warnings', () => {
    const result = checkFixture(
      'import { value } from "@/value"; console.log(value)',
    )
    expect(result.error).toBeUndefined()
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('no dependency violations found')
    expect(result.stderr).not.toContain('missing-typescript-transpiler')
    expect(result.stderr).not.toContain('missing-swc-transpiler')
  })

  it('detects type-only dependencies and returns the upstream failure status', () => {
    const result = checkFixture(
      'import type { Value } from "@/value"; export type Entry = Value',
    )
    expect(result.error).toBeUndefined()
    expect(result.status).toBe(1)
    expect(result.stdout).toContain('forbidden-type-only')
    expect(result.stderr).not.toContain('missing-typescript-transpiler')
    expect(result.stderr).not.toContain('missing-swc-transpiler')
  })
})
