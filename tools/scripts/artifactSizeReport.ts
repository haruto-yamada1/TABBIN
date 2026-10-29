import { createHash } from 'node:crypto'
import { lstatSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

type Asset = { path: string; bytes: number }

// Physical paths are intentional: hash-normalized chunk groups can collide.
const collectInitialLoads = (
  assets: Map<string, number>,
  observed: Record<string, string[]>,
) => {
  if (Object.keys(observed).length === 0) {
    throw new Error('Missing observed feature loads')
  }
  const features = Object.entries(observed).map(([feature, paths]) => {
    if (paths.length === 0) {
      throw new Error(`Empty observed feature: ${feature}`)
    }
    const files = [...new Set(paths)].toSorted().map((file) => {
      const bytes = assets.get(file)
      if (bytes === undefined || !file.endsWith('.js')) {
        throw new Error(`Unknown observed JavaScript: ${feature} -> ${file}`)
      }
      return { path: file, bytes }
    })
    return { feature, files }
  })
  const usage = new Map<string, number>()
  for (const { files } of features) {
    for (const file of files) {
      usage.set(file.path, (usage.get(file.path) ?? 0) + 1)
    }
  }
  const sum = (files: Asset[]) => files.reduce((n, file) => n + file.bytes, 0)
  const shared = (files: Asset[]) =>
    files.filter((file) => (usage.get(file.path) ?? 0) > 1)
  const unique = [
    ...new Map(
      features.flatMap(({ files }) =>
        files.map((file) => [file.path, file] as const),
      ),
    ).values(),
  ].toSorted((a, b) => a.path.localeCompare(b.path, 'en'))
  return {
    features: Object.fromEntries(
      features.map(({ feature, files }) => [
        feature,
        {
          javascriptBytes: sum(files),
          sharedJavascriptBytes: sum(shared(files)),
          files,
        },
      ]),
    ),
    uniqueJavascriptBytes: sum(unique),
    sharedJavascriptBytes: sum(shared(unique)),
  }
}

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
        if (source === undefined) {
          throw new Error(`Missing entry script source: ${file}`)
        }
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

export const fingerprintArtifact = (directory: string): string => {
  const hash = createHash('sha256')
  for (const file of collectFiles(directory).toSorted((a, b) =>
    a.path.localeCompare(b.path, 'en'),
  )) {
    hash.update(`${file.path}\0${file.bytes}\0`)
    hash.update(readFileSync(path.join(directory, file.path)))
  }
  return hash.digest('hex')
}

export const collectArtifactSize = (
  directory: string,
  zip: string,
  observed?: Record<string, string[]>,
) => {
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
    ...(observed
      ? { initialLoads: collectInitialLoads(assets, observed) }
      : {}),
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
