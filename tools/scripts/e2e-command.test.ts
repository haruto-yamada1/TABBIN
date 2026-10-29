import { spawnSync } from 'node:child_process'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../..')
const listTests = (file: string) =>
  spawnSync('bun', ['run', 'e2e', file, '--project=extension', '--list'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 10_000,
  })

describe('E2E package command selection', () => {
  it('lists only the requested test file instead of OR-matching the whole directory', () => {
    const result = listTests('e2e/storage-policy.extension.spec.ts')
    expect(result.error).toBeUndefined()
    expect(result.status).toBe(0)
    const cases = result.stdout
      .split('\n')
      .filter((line) => line.includes('[extension] ›'))
    expect(cases).toHaveLength(1)
    expect(cases[0]).toContain('storage-policy.extension.spec.ts')
  })

  it('rejects an unmatched file instead of silently selecting all tests', () => {
    const result = listTests('e2e/no-such-harness-regression.spec.ts')
    expect(result.error).toBeUndefined()
    expect(result.status).not.toBe(0)
    expect(result.stdout).not.toContain('[extension] ›')
    expect(result.stdout + result.stderr).toContain('No tests found')
  })
})
