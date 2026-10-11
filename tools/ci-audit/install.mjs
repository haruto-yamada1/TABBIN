// eslint-disable no-await-in-loop -- Verification, extraction, and execution phases intentionally run in order.
import { Buffer } from 'node:buffer'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'

const execute = promisify(execFile)
const root = resolve(import.meta.dirname, '../..')
const cache = join(root, '.cache/ci-audit')
const bin = join(cache, 'bin')
const platform = `${process.platform}-${process.arch}`
const supported = ['darwin-x64', 'darwin-arm64', 'linux-x64', 'linux-arm64']
const MIN_NODE_VERSION = 24
const DOWNLOAD_TIMEOUT = 120_000
const EXECUTABLE_MODE = 0o755

/** @typedef {{name: string, sha256: string}} Asset */
/**
 * @typedef {{repo: string, version: string, binary: string,
 * versionArgs: string[]}} Tool
 */

/**
 * @param {Uint8Array} bytes
 * @param {Asset} asset
 */
export function verifyArchive(bytes, asset) {
  const actual = createHash('sha256').update(bytes).digest('hex')
  if (actual !== asset.sha256) {
    throw new Error(
      `SHA-256 mismatch for ${asset.name}: expected ${asset.sha256}, got ${actual}`,
    )
  }
}

/**
 * @param {Tool} tool
 * @param {Asset} asset
 * @param {string} staging
 */
async function archiveFor(tool, asset, staging) {
  const archive = join(cache, asset.name)
  /** @type {Buffer | undefined} */
  let bytes
  let downloaded = false
  try {
    bytes = await readFile(archive)
  } catch (error) {
    if (
      !(error instanceof Error && 'code' in error && error.code === 'ENOENT')
    ) {
      throw error
    }
  }
  if (bytes === undefined) {
    const url = `https://github.com/${tool.repo}/releases/download/v${tool.version}/${asset.name}`
    console.log(`Downloading ${asset.name}`)
    const response = await fetch(url, {
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT),
    })
    if (!response.ok) {
      throw new Error(
        `Download failed for ${asset.name}: HTTP ${response.status}`,
      )
    }
    bytes = Buffer.from(await response.arrayBuffer())
    downloaded = true
  }
  // Cached archives are untrusted until this run verifies their pinned digest.
  verifyArchive(bytes, asset)
  const verified = join(staging, asset.name)
  await writeFile(verified, bytes, { flag: 'wx' })
  if (downloaded) {
    const temporary = join(staging, `.cache-${asset.name}`)
    await writeFile(temporary, bytes, { flag: 'wx' })
    await rename(temporary, archive)
  }
  return verified
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * @param {unknown} value
 * @returns {value is string[]}
 */
function isStrings(value) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

/**
 * @param {unknown} value
 * @param {RegExp} pattern
 * @returns {value is string}
 */
function matches(value, pattern) {
  return typeof value === 'string' && pattern.test(value)
}

async function install() {
  if (Number(process.versions.node.split('.')[0]) < MIN_NODE_VERSION) {
    throw new Error('Node.js 24 or newer is required')
  }
  if (!supported.includes(platform)) {
    throw new Error(
      `Unsupported platform ${platform}; supported: ${supported.join(', ')}`,
    )
  }
  /** @type {unknown} */
  const manifest = JSON.parse(
    await readFile(new URL('tools.json', import.meta.url), 'utf8'),
  )
  if (!isRecord(manifest)) {
    throw new Error('Invalid tool manifest')
  }
  const tools = Object.entries(manifest).map(([name, value]) => {
    if (!isRecord(value) || !isRecord(value.assets)) {
      throw new Error(`Invalid tool manifest for ${name} on ${platform}`)
    }
    const asset = value.assets[platform]
    const { repo, version, binary, versionArgs } = value
    if (
      !/^[a-z][a-z0-9-]*$/.test(name) ||
      !matches(repo, /^[\w.-]+\/[\w.-]+$/) ||
      !matches(version, /^\d+\.\d+\.\d+$/) ||
      !isRecord(asset) ||
      !matches(asset.name, /^[\w.-]+\.tar\.gz$/) ||
      !matches(asset.sha256, /^[a-f0-9]{64}$/) ||
      !matches(binary, /^[\w.-]+(?:\/[\w.-]+)*$/) ||
      binary.split('/').some((part) => part === '.' || part === '..') ||
      !isStrings(versionArgs)
    ) {
      throw new Error(`Invalid tool manifest for ${name} on ${platform}`)
    }
    return {
      name,
      tool: { repo, version, binary, versionArgs },
      asset: { name: asset.name, sha256: asset.sha256 },
      archive: '',
    }
  })
  await mkdir(bin, { recursive: true })
  const staging = await mkdtemp(join(cache, '.stage-'))
  try {
    // Verify every archive before extracting or executing any tool.
    for (const entry of tools) {
      entry.archive = await archiveFor(entry.tool, entry.asset, staging)
    }
    const tarEnv = { ...process.env }
    delete tarEnv.TAR_OPTIONS
    for (const { name, tool, archive } of tools) {
      const directory = join(staging, name)
      await mkdir(directory)
      await execute(
        'tar',
        ['-xzf', archive, '-C', directory, '--', tool.binary],
        { env: tarEnv },
      )
      const binary = join(directory, tool.binary)
      if (!(await lstat(binary)).isFile()) {
        throw new Error(`Extracted ${name} must be a regular file`)
      }
      await chmod(binary, EXECUTABLE_MODE)
      await rename(binary, join(bin, name))
    }
    for (const { name, tool } of tools) {
      const { stdout } = await execute(join(bin, name), tool.versionArgs)
      process.stdout.write(stdout)
    }
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}

if (
  process.argv[1] &&
  import.meta.filename === (await realpath(process.argv[1]))
) {
  try {
    await install()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`ci-audit install: ${message}`)
    process.exitCode = 1
  }
}
