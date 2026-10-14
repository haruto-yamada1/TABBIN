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

import { describe, expect, it } from 'vitest'

import { createBuildCheckout } from './check-build-reproducibility'

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
