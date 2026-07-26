import { readFileSync } from 'node:fs'
import path from 'node:path'

const projectRoot = path.resolve(import.meta.dirname, '..', '..')

const readJsonFile = (filePath: string): unknown => {
  const content = readFileSync(filePath, 'utf8')
  return JSON.parse(content)
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const readStringProperty = (parsed: unknown, key: string): string => {
  if (!isRecord(parsed)) {
    throw new TypeError(`${key} source is not an object`)
  }
  const value: unknown = parsed[key]
  if (typeof value !== 'string') {
    throw new TypeError(`${key} is missing or not a string`)
  }
  return value
}

const packageJsonPath = path.join(projectRoot, 'package.json')
const expectedVersion = readStringProperty(
  readJsonFile(packageJsonPath),
  'version',
)

const manifestPaths = [
  path.join(projectRoot, '.output', 'chrome-mv3', 'manifest.json'),
  path.join(projectRoot, '.output', 'firefox-mv2', 'manifest.json'),
]

const mismatches: string[] = []
for (const manifestPath of manifestPaths) {
  const manifestVersion = readStringProperty(
    readJsonFile(manifestPath),
    'version',
  )
  if (manifestVersion !== expectedVersion) {
    mismatches.push(
      `${manifestPath} has ${manifestVersion}, expected ${expectedVersion}`,
    )
  } else {
    console.log(`verified: ${manifestPath} version ${manifestVersion}`)
  }
}

if (mismatches.length > 0) {
  throw new TypeError(`version mismatch:\n${mismatches.join('\n')}`)
}
