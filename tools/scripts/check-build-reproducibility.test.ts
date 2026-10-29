import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import {
  checkBuildReproducibility,
  createBuildCheckout,
} from './check-build-reproducibility'

it('creates independent object databases and checkouts from the exact commit, excluding local files', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'repro-checkout-'))
  const git = (cwd: string, args: string[]) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim()
  try {
    git(root, ['init', '--quiet'])
    writeFileSync(path.join(root, 'input.txt'), 'committed')
    git(root, ['add', 'input.txt'])
    git(root, [
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.com',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '--quiet',
      '-m',
      'fixture',
    ])
    const revision = git(root, ['rev-parse', 'HEAD'])
    writeFileSync(path.join(root, 'input.txt'), 'dirty')
    writeFileSync(path.join(root, 'local-profile.txt'), 'private')
    for (const label of ['a', 'b']) {
      const destination = path.join(root, label)
      createBuildCheckout(root, revision, destination)
      expect(readFileSync(path.join(destination, 'input.txt'), 'utf8')).toBe(
        'committed',
      )
      expect(existsSync(path.join(destination, 'local-profile.txt'))).toBe(
        false,
      )
      expect(
        existsSync(path.join(destination, '.git/objects/info/alternates')),
      ).toBe(false)
      expect(git(destination, ['rev-parse', 'HEAD'])).toBe(revision)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('independent checkout safety', () => {
  it('rejects an existing destination without overwriting files', () => {
    expect(() => createBuildCheckout('.', 'invalid', '.')).toThrow(/EEXIST/u)
  })
})

describe('reproducibility toolchain selection', () => {
  it.each([
    ['24', 'v24.22.1', '1.3.14', true],
    ['24.22.1', 'v24.22.1', '1.3.14', true],
    ['24.22.1', 'v24.17.0', '1.3.14', false],
    ['24.22.1', 'v24.22.2', '1.3.14', false],
    ['24.22.1', 'v26.12.1', '1.3.14', false],
    ['24', 'v26.12.1', '1.3.14', false],
    ['24.22.1', 'v24.22.1', '1.3.13', false],
  ])(
    'checks committed Node %s against %s / Bun %s before building',
    (configuredNode, node, bun, accepted) => {
      const root = mkdtempSync(path.join(tmpdir(), 'repro-toolchain-'))
      const bin = path.join(root, 'bin')
      const output = path.join(root, 'output')
      const git = (args: string[]) =>
        execFileSync('git', args, { cwd: root, stdio: 'pipe' })
      try {
        git(['init', '--quiet'])
        writeFileSync(path.join(root, '.node-version'), configuredNode)
        writeFileSync(path.join(root, '.bun-version'), '1.3.14')
        git(['add', '.node-version', '.bun-version'])
        git([
          '-c',
          'user.name=Test',
          '-c',
          'user.email=test@example.com',
          '-c',
          'commit.gpgsign=false',
          'commit',
          '--quiet',
          '-m',
          'toolchain fixture',
        ])
        mkdirSync(bin)
        writeFileSync(path.join(bin, 'node'), `#!/bin/sh\necho ${node}\n`, {
          mode: 0o700,
        })
        writeFileSync(
          path.join(bin, 'bun'),
          `#!/bin/sh\nif [ "$1" = "--version" ]; then echo ${bun}; else echo fixture-install; exit 1; fi\n`,
          { mode: 0o700 },
        )
        vi.stubEnv('PATH', `${bin}${path.delimiter}${process.env.PATH ?? ''}`)

        expect(() => checkBuildReproducibility(root, 'HEAD', output)).toThrow(
          accepted ? /Independent build a failed/u : /Toolchain mismatch/u,
        )
        expect(existsSync(output)).toBe(accepted)
        let installLog: string | undefined
        if (accepted) {
          // The matching runtime reaches the isolated install boundary.
          const [workspace = ''] = readdirSync(output)
          installLog = readFileSync(
            path.join(output, workspace, 'a.log'),
            'utf8',
          )
        }
        expect(installLog).toBe(accepted ? 'fixture-install\n' : undefined)
      } finally {
        vi.unstubAllEnvs()
        rmSync(root, { recursive: true, force: true })
      }
    },
  )
})
