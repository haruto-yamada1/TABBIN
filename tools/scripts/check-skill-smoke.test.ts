import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

const projectRoot = path.resolve(import.meta.dirname, '..', '..')
const scriptPath = path.join(
  projectRoot,
  '.apm/skills/check/scripts/run_quality.sh',
)
const packageJsonPath = path.join(projectRoot, 'package.json')

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

const readPackageJson = (): Record<string, unknown> =>
  JSON.parse(readFileSync(packageJsonPath, 'utf8'))

const runScript = (
  cwd: string,
  env?: Record<string, string | undefined>,
): { output: string; status: number } => {
  try {
    const output = execFileSync('bash', [scriptPath], {
      cwd,
      env: { ...process.env, ...env },
      encoding: 'utf8',
      timeout: 30_000,
    })
    return { output, status: 0 }
  } catch (error) {
    const err = error as { stdout?: string; status?: number }
    return {
      output: err.stdout ?? '',
      status: err.status ?? 1,
    }
  }
}

describe('check skill script — static contract', () => {
  it('exists at the expected path', () => {
    expect(existsSync(scriptPath)).toBe(true)
  })

  it('has a bash shebang', () => {
    const content = readFileSync(scriptPath, 'utf8')
    expect(content.startsWith('#!/usr/bin/env bash')).toBe(true)
  })

  it('references bun run quality:check, not npm run quality', () => {
    const content = readFileSync(scriptPath, 'utf8')
    expect(content).toContain('bun run quality:check')
    expect(content).not.toContain('npm run quality')
  })

  it('references a package script that exists in package.json', () => {
    const pkg = readPackageJson()
    const scripts = pkg.scripts as Record<string, string>
    expect(scripts['quality:check']).toBeDefined()
  })

  it('package.json has agent:check pointing to the script', () => {
    const pkg = readPackageJson()
    const scripts = pkg.scripts as Record<string, string>
    expect(scripts['agent:check']).toBeDefined()
    expect(scripts['agent:check']).toContain('run_quality.sh')
  })
})

describe('check skill script — runtime contract', () => {
  it('returns CHECK_RESULT status=OK on success', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'check-skill-ok-'))
    temporaryDirectories.push(dir)
    writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({
        scripts: { 'quality:check': 'echo "all good"' },
      }),
    )

    const { output, status } = runScript(dir, { PATH: process.env.PATH })

    expect(status).toBe(0)
    expect(output).toContain('CHECK_RESULT status=OK')
  })

  it('returns CHECK_LOG and CHECK_RESULT status=ERROR on failure', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'check-skill-fail-'))
    temporaryDirectories.push(dir)
    writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({
        scripts: { 'quality:check': 'echo "error TS2322: bad type" && exit 1' },
      }),
    )

    const { output, status } = runScript(dir, { PATH: process.env.PATH })

    expect(status).not.toBe(0)
    expect(output).toContain('CHECK_LOG')
    expect(output).toContain('CHECK_RESULT status=ERROR')
  })
})
