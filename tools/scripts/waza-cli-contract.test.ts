import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  writeFileSync,
  rmSync,
  mkdirSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

// Issue #799 Step 1 / 必須テスト: pinned Waza v0.38.3 の実 CLI 引数が実際に受理される
// ことを検証する。waza バイナリが PATH 上にない場合は skip する。

const WAZA_BIN = process.env.WAZA_BIN ?? 'waza'

const isWazaAvailable = (): boolean => {
  try {
    execFileSync(WAZA_BIN, ['--version'], { stdio: 'pipe', timeout: 5000 })
    return true
  } catch {
    return false
  }
}

const wazaVersion = (): string => {
  try {
    return execFileSync(WAZA_BIN, ['--version'], {
      encoding: 'utf8',
      stdio: 'pipe',
    }).trim()
  } catch {
    return ''
  }
}

const wazaHelp = (subcommand: string): string => {
  try {
    return execFileSync(WAZA_BIN, [subcommand, '--help'], {
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 5000,
    })
  } catch {
    return ''
  }
}

const runWaza = (
  args: readonly string[],
  cwd?: string,
): { code: number; stdout: string; stderr: string } => {
  try {
    const stdout = execFileSync(WAZA_BIN, [...args], {
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 10000,
      cwd,
    })
    return { code: 0, stdout, stderr: '' }
  } catch (error) {
    const err = error as { status?: number; stdout?: string; stderr?: string }
    return {
      code: err.status ?? 1,
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? '',
    }
  }
}

const wazaAvailable = isWazaAvailable()
const wazaVer = wazaVersion()

describe.skipIf(!wazaAvailable)(
  'waza CLI contract — v0.38.3 (Issue #799 Step 1)',
  () => {
    it('is pinned to v0.38.3', () => {
      expect(wazaVer).toContain('0.38.3')
    })

    it('waza run does not accept --executor flag', () => {
      const help = wazaHelp('run')
      // --executor should not be a valid flag for waza run
      expect(help).not.toMatch(/^\s*--executor\b/m)
    })

    it('waza run does not accept --on-unsafe-outcome flag', () => {
      const help = wazaHelp('run')
      expect(help).not.toMatch(/^\s*--on-unsafe-outcome\b/m)
    })

    it('waza run accepts --session-log flag', () => {
      const help = wazaHelp('run')
      expect(help).toContain('--session-log')
    })

    it('waza run accepts --session-dir flag', () => {
      const help = wazaHelp('run')
      expect(help).toContain('--session-dir')
    })

    it('waza run accepts --transcript-dir flag', () => {
      const help = wazaHelp('run')
      expect(help).toContain('--transcript-dir')
    })

    it('waza run accepts -o / --output flag', () => {
      const help = wazaHelp('run')
      expect(help).toContain('--output')
    })

    it('waza adversarial accepts --engine flag', () => {
      const help = wazaHelp('adversarial')
      expect(help).toContain('--engine')
    })

    it('waza adversarial accepts --on-unsafe-outcome flag', () => {
      const help = wazaHelp('adversarial')
      expect(help).toContain('--on-unsafe-outcome')
    })

    it('waza adversarial accepts --spec flag', () => {
      const help = wazaHelp('adversarial')
      expect(help).toContain('--spec')
    })

    it('waza adversarial does not accept --executor flag', () => {
      const help = wazaHelp('adversarial')
      expect(help).not.toMatch(/^\s*--executor\b/m)
    })

    it('waza adversarial with --spec reads on_unsafe_outcome from spec (mock engine)', () => {
      const tmp = mkdtempSync(path.join(os.tmpdir(), 'waza-cli-test-'))
      try {
        const specPath = path.join(tmp, 'eval.yaml')
        writeFileSync(
          specPath,
          `name: cli-contract-test
skill: check
schemaVersion: '1.2'
version: '0.1.0'
config:
  executor: mock
  model: gpt-4o
  inject_skill_body: false
  disabled_skills: []
adversarial:
  packs:
    - prompt-injection
  on_unsafe_outcome: fail
tasks: []
`,
        )
        // waza adversarial --spec should accept the spec without error
        const result = runWaza(
          ['adversarial', '--spec', specPath, '--engine', 'mock'],
          tmp,
        )
        // it should not fail with an "unknown flag" error
        expect(result.stderr).not.toContain('unknown flag')
      } finally {
        rmSync(tmp, { recursive: true, force: true })
      }
    })
  },
)

describe.skipIf(!wazaAvailable)(
  'waza CLI smoke — mock run (Issue #799)',
  () => {
    it('waza run with mock executor produces results', () => {
      const projectRoot = path.resolve(import.meta.dirname, '..', '..')
      const evalPath = path.join(projectRoot, 'evals/skills/check/eval.yaml')
      const tmp = mkdtempSync(path.join(os.tmpdir(), 'waza-smoke-'))
      const outDir = path.join(tmp, 'out')
      mkdirSync(outDir, { recursive: true })
      try {
        const result = runWaza(
          [
            'run',
            evalPath,
            '-v',
            '--session-log',
            '--session-dir',
            path.join(tmp, 'sessions'),
            '--transcript-dir',
            path.join(tmp, 'transcripts'),
            '-o',
            path.join(outDir, 'results.json'),
          ],
          projectRoot,
        )
        expect(result.code).toBe(0)
        expect(existsSync(path.join(outDir, 'results.json'))).toBe(true)
      } finally {
        rmSync(tmp, { recursive: true, force: true })
      }
    })
  },
)

describe.skipIf(wazaAvailable)(
  'waza CLI contract — skipped (waza not installed)',
  () => {
    it('skips when waza binary is not available', () => {
      // This test exists to make the skip visible in output
      expect(true).toBe(true)
    })
  },
)
