import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { spawnSync } from 'node:child_process'
import {
  access,
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { test } from 'node:test'

import { verifyArchive } from './install.mjs'

// A real gzip/tar archive containing one harmless fixture-tool executable.
const archive = Buffer.from(
  'H4sIAAAAAAAAE0vLrCgpLUrVLcnPz2GgETAwMDAwNzUF0wYGBui0gQFCDiJuaGBsbMKgYEArByGD0uKSxCIGA7rYNQiBsqJ+UmaefnEGV0FRZl5JmoK6anFMnrqCehpSwlAw1DPQM1DnGmjHjoJRMApGwSigGgAAzhO3ZAAIAAA=',
  'base64',
)
const digest =
  '083bdb5cf3864f259afaeed60e0c328a21160c8874e0628ddf496af44ff20492'
const names = ['first', 'second', 'third']
const platform = `${process.platform}-${process.arch}`

/** @typedef {{root: string, directory: string, cache: string, bin: string}} Fixture */

/** @param {import('node:test').TestContext} t */
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'ci-audit-installer-'))
  t.after(async () => {
    await rm(root, { recursive: true, force: true })
  })
  const directory = join(root, 'tools/ci-audit')
  const cache = join(root, '.cache/ci-audit')
  const bin = join(cache, 'bin')
  await mkdir(directory, { recursive: true })
  await mkdir(bin, { recursive: true })
  await copyFile(
    new URL('install.mjs', import.meta.url),
    join(directory, 'install.mjs'),
  )
  const manifest = Object.fromEntries(
    names.map((name) => [
      name,
      {
        repo: 'rhysd/actionlint',
        version: '1.0.0',
        binary: 'fixture-tool',
        versionArgs: ['--version'],
        assets: {
          [platform]: { name: `${name}.tar.gz`, sha256: digest },
        },
      },
    ]),
  )
  await writeFile(join(directory, 'tools.json'), JSON.stringify(manifest))
  await Promise.all(
    names.map(async (name) => {
      await writeFile(join(cache, `${name}.tar.gz`), archive)
    }),
  )
  return { root, directory, cache, bin }
}

/**
 * @param {Fixture} fixture
 * @param {NodeJS.ProcessEnv} [env]
 */
function runInstaller(fixture, env = process.env) {
  return spawnSync(process.execPath, [join(fixture.directory, 'install.mjs')], {
    cwd: fixture.root,
    encoding: 'utf8',
    timeout: 30_000,
    env,
  })
}

/**
 * @param {string} path
 * @param {string} marker
 */
async function executable(path, marker) {
  await writeFile(path, `#!/bin/sh\nprintf executed > '${marker}'\n`)
  await chmod(path, 0o755)
}

await test('accepts archive bytes matching the pinned SHA-256', () => {
  assert.doesNotThrow(() => {
    verifyArchive(archive, { name: 'fixture.tar.gz', sha256: digest })
  })
})

await test('rejects changed bytes instead of executing a valid cached binary', () => {
  const changed = Buffer.from(archive)
  changed[changed.length - 1] ^= 1
  assert.throws(() => {
    verifyArchive(changed, { name: 'fixture.tar.gz', sha256: digest })
  }, /SHA-256 mismatch for fixture\.tar\.gz/)
})

await test('installs verified archives and replaces modified binaries on each run', async (t) => {
  const context = await fixture(t)
  const first = runInstaller(context)
  assert.equal(first.status, 0, first.stderr)
  assert.equal(first.stdout, 'fixture-tool 1.0.0\n'.repeat(names.length))
  const marker = join(context.root, 'modified-binary-executed')
  await executable(join(context.bin, 'first'), marker)
  const second = runInstaller(context)
  assert.equal(second.status, 0, second.stderr)
  assert.equal(second.stdout, first.stdout)
  assert.equal((await stat(join(context.bin, 'first'))).mode & 0o777, 0o755)
  await assert.rejects(access(marker), { code: 'ENOENT' })
  assert.deepEqual(await readFile(join(context.cache, 'first.tar.gz')), archive)
})

await test('checks every cached archive before any tar or previous binary execution', async (t) => {
  const context = await fixture(t)
  const marker = join(context.root, 'unverified-execution')
  await Promise.all(
    names.map(async (name) => {
      await executable(join(context.bin, name), marker)
    }),
  )
  await executable(join(context.bin, 'tar'), marker)
  await writeFile(
    join(context.cache, 'third.tar.gz'),
    'tampered cached archive',
  )
  const result = runInstaller(context, { ...process.env, PATH: context.bin })
  assert.equal(result.status, 1, result.stderr)
  assert.match(result.stderr, /SHA-256 mismatch for third\.tar\.gz/)
  assert.equal(result.stdout, '')
  await assert.rejects(access(marker), { code: 'ENOENT' })
})

await test('rejects unsupported platforms explicitly before reading the manifest', async (t) => {
  const context = await fixture(t)
  await rm(join(context.directory, 'tools.json'))
  const preload = join(context.root, 'unsupported.mjs')
  await writeFile(
    preload,
    "Object.defineProperty(process, 'platform', { value: 'win32' })\n",
  )
  const result = spawnSync(
    process.execPath,
    ['--import', preload, join(context.directory, 'install.mjs')],
    { cwd: context.root, encoding: 'utf8', timeout: 30_000 },
  )
  assert.equal(result.status, 1, result.stderr)
  assert.match(result.stderr, /Unsupported platform win32-/)
})
