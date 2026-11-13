import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const repositoryRoot = path.resolve(import.meta.dirname, '../..')
const command = 'tools/scripts/production-artifact-upgrade.ts'

const runCli = (args: readonly string[]) =>
  spawnSync('bun', [command, ...args], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    timeout: 15_000,
  })

const validPin = {
  schemaVersion: 1,
  chrome: {
    status: 'published',
    version: '2.0.19',
    extensionId: 'dljblklbpmoocinnlcejeokopmfoldaj',
    prodversion: '140.0',
    sha256: 'a'.repeat(64),
  },
  firefox: {
    status: 'excluded',
    reason: 'The Firefox add-on is not published on AMO.',
  },
}

describe('production artifact upgrade CLI', () => {
  it('fails closed before downloading when the current build is missing', () => {
    const temporaryRoot = mkdtempSync(
      path.join(os.tmpdir(), 'tabbin-artifact-upgrade-cli-'),
    )
    try {
      const pinPath = path.join(temporaryRoot, 'pin.json')
      writeFileSync(pinPath, JSON.stringify(validPin))
      const result = runCli([
        '--pin',
        pinPath,
        '--current-dir',
        path.join(temporaryRoot, 'missing-current'),
        '--download-dir',
        path.join(temporaryRoot, 'downloads'),
      ])

      expect(result.status).toBe(1)
      expect(result.stderr).toContain('Current Chrome artifact is missing')
      expect(result.stderr).not.toContain('download failed')
    } finally {
      rmSync(temporaryRoot, { force: true, recursive: true })
    }
  })

  it('fails closed when the pinned artifact metadata is missing', () => {
    const temporaryRoot = mkdtempSync(
      path.join(os.tmpdir(), 'tabbin-artifact-upgrade-cli-'),
    )
    try {
      const currentDirectory = path.join(temporaryRoot, 'current')
      mkdirSync(currentDirectory)
      writeFileSync(
        path.join(currentDirectory, 'manifest.json'),
        JSON.stringify({ version: '2.0.19' }),
      )
      const result = runCli([
        '--pin',
        path.join(temporaryRoot, 'missing-pin.json'),
        '--current-dir',
        currentDirectory,
      ])

      expect(result.status).toBe(1)
      expect(result.stderr).toContain('Published artifact pin is missing')
    } finally {
      rmSync(temporaryRoot, { force: true, recursive: true })
    }
  })

  it('shows usage without requiring artifacts', () => {
    const result = runCli(['--help'])

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('production-artifact-upgrade.ts')
    expect(result.stdout).toContain('--current-dir')
  })
})
