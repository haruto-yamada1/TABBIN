import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

type JsonObject = Record<string, unknown>

const isRecord = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null

const readJsonFile = (filePath: string): JsonObject => {
  const content = readFileSync(filePath, 'utf8')
  const parsed: unknown = JSON.parse(content)
  if (!isRecord(parsed)) {
    throw new TypeError(`${filePath} is not a JSON object`)
  }
  return parsed
}

const writeJsonFile = (filePath: string, data: JsonObject): void => {
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`)
}

type SyncInputs = {
  projectRoot: string
  nodeVersionFile: string
  bunVersionFile: string
  packageJson?: JsonObject
}

type SyncResult = {
  bunVersion: string
  nodeMajor: number
  updated: string[]
}

export const syncToolchainVersions = ({
  projectRoot,
  nodeVersionFile,
  bunVersionFile,
  packageJson: packageJsonOverride,
}: SyncInputs): SyncResult => {
  const packageJsonPath = path.join(projectRoot, 'package.json')
  const packageJson = packageJsonOverride ?? readJsonFile(packageJsonPath)

  const engines: unknown = packageJson.engines
  if (!isRecord(engines)) {
    throw new TypeError('package.json engines is not an object')
  }

  const nodeMajor = nodeVersionFile.split('.')[0]
  if (!/^\d+$/.test(nodeMajor)) {
    throw new TypeError(
      `Unable to extract Node major from .node-version: ${nodeVersionFile}`,
    )
  }

  const nodeMajorNumber = Math.trunc(Number(nodeMajor))

  const updated: string[] = []

  const expectedNode = `${nodeMajor}.x`
  const currentNode = engines.node
  if (typeof currentNode !== 'string') {
    throw new TypeError('package.json engines.node is not a string')
  }
  if (currentNode !== expectedNode) {
    engines.node = expectedNode
    updated.push(`engines.node: ${expectedNode}`)
  }

  const currentBun = engines.bun
  if (typeof currentBun !== 'string') {
    throw new TypeError('package.json engines.bun is not a string')
  }
  if (currentBun !== bunVersionFile) {
    engines.bun = bunVersionFile
    updated.push(`engines.bun: ${bunVersionFile}`)
  }

  const packageManager = packageJson.packageManager
  if (typeof packageManager !== 'string') {
    throw new TypeError('package.json packageManager is not a string')
  }
  const expectedPackageManager = `bun@${bunVersionFile}`
  if (packageManager !== expectedPackageManager) {
    packageJson.packageManager = expectedPackageManager
    updated.push(`packageManager: ${expectedPackageManager}`)
  }

  if (packageJsonOverride === undefined && updated.length > 0) {
    writeJsonFile(packageJsonPath, packageJson)
  }

  return {
    bunVersion: bunVersionFile,
    nodeMajor: nodeMajorNumber,
    updated,
  }
}

const readTextFile = (filePath: string): string =>
  readFileSync(filePath, 'utf8').trim()

const main = (): void => {
  const projectRoot = path.resolve(import.meta.dirname, '..', '..')
  const nodeVersionFile = readTextFile(path.join(projectRoot, '.node-version'))
  const bunVersionFile = readTextFile(path.join(projectRoot, '.bun-version'))

  const { nodeMajor, bunVersion, updated } = syncToolchainVersions({
    projectRoot,
    nodeVersionFile,
    bunVersionFile,
  })

  if (updated.length > 0) {
    console.log(`Synced toolchain versions:\n${updated.join('\n')}`)
  }

  console.log(
    `Toolchain versions synced from canonical sources: Node ${nodeVersionFile} (major ${nodeMajor}), Bun ${bunVersion}`,
  )
}

if (import.meta.main) {
  main()
}
