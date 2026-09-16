import { lstatSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

type Asset = { path: string; bytes: number }

const collectFiles = (directory: string, relative = ''): Asset[] =>
  readdirSync(path.join(directory, relative)).flatMap((name) => {
    const file = path.posix.join(relative, name)
    const stat = lstatSync(path.join(directory, file))
    if (stat.isSymbolicLink()) {
      throw new Error(`Symlink in artifact: ${file}`)
    }
    if (stat.isDirectory()) {
      return collectFiles(directory, file)
    }
    if (!stat.isFile()) {
      throw new Error(`Not a regular artifact file: ${file}`)
    }
    return [{ path: file, bytes: stat.size }]
  })

const collectEntries = (directory: string, assets: Map<string, number>) => {
  const entries = new Map<string, number>()
  const backgroundBytes = assets.get('background.js')
  if (backgroundBytes === undefined) {
    throw new Error('Missing background.js')
  }
  entries.set('background', backgroundBytes)
  for (const file of assets.keys()) {
    if (!file.endsWith('.html')) {
      continue
    }
    const html = readFileSync(path.join(directory, file), 'utf8')
    const scripts = [
      ...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gu),
    ]
    if (scripts.length === 0) {
      throw new Error(`Missing entry script: ${file}`)
    }
    const entryPaths = new Set(
      scripts.map((match) => {
        const source = match[1]
        const resolved = source.startsWith('/')
          ? source.slice(1)
          : path.posix.join(path.posix.dirname(file), source)
        if (!assets.has(resolved)) {
          throw new Error(`Missing entry asset: ${file} -> ${source}`)
        }
        return resolved
      }),
    )
    entries.set(
      file.replace(/\.html$/u, ''),
      [...entryPaths].reduce((sum, entry) => sum + (assets.get(entry) ?? 0), 0),
    )
  }
  for (const required of ['saved-tabs', 'options']) {
    if (!entries.has(required)) {
      throw new Error(`Missing required entry: ${required}`)
    }
  }
  return Object.fromEntries(entries)
}

export const collectArtifactSize = (directory: string, zip: string) => {
  const zipStat = lstatSync(zip)
  if (!zipStat.isFile() || zipStat.size === 0) {
    throw new Error(`Not a nonempty regular ZIP: ${zip}`)
  }
  const files = collectFiles(directory).toSorted((left, right) =>
    left.path.localeCompare(right.path, 'en'),
  )
  const assets = new Map(files.map((file) => [file.path, file.bytes]))
  if (!assets.has('manifest.json')) {
    throw new Error('Missing manifest.json')
  }
  const chunks = new Map<string, number>()
  for (const file of files.filter((asset) => asset.path.endsWith('.js'))) {
    const name = file.path.replace(/-[\w-]{8}(?=\.js$)/u, '')
    chunks.set(name, (chunks.get(name) ?? 0) + file.bytes)
  }
  return {
    zipBytes: zipStat.size,
    unpackedBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    javascriptBytes: [...chunks.values()].reduce((sum, size) => sum + size, 0),
    assetCount: files.length,
    entries: collectEntries(directory, assets),
    chunks: Object.fromEntries(chunks),
    largestAssets: files
      .toSorted(
        (left, right) =>
          right.bytes - left.bytes || left.path.localeCompare(right.path, 'en'),
      )
      .slice(0, 10),
  }
}
