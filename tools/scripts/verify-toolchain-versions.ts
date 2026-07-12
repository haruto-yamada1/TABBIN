import { readFileSync } from 'node:fs'
import path from 'node:path'

type JsonObject = Record<string, unknown>

const isRecord = (value: unknown): value is JsonObject =>
  !Array.isArray(value) && typeof value === 'object' && value !== null

const readStringProperty = (parsed: JsonObject, key: string): string => {
  const value: unknown = parsed[key]
  if (typeof value !== 'string') {
    throw new TypeError(`${key} is missing or not a string`)
  }
  return value
}

const readNestedStringProperty = (
  parsed: JsonObject,
  sectionKey: string,
  key: string,
): string => {
  const section: unknown = parsed[sectionKey]
  if (!isRecord(section)) {
    throw new TypeError(`${sectionKey} is not an object`)
  }
  return readStringProperty(section, key)
}

const extractMajor = (versionRange: string): number => {
  const match = /^[\^~\u003E=\u003C]*(\d+)(?:\.|$)/.exec(versionRange)
  if (!match) {
    throw new TypeError(`Unable to extract major version from: ${versionRange}`)
  }
  return Math.trunc(Number(match[1]))
}

const extractPackageManagerVersion = (packageManager: string): string => {
  const match = /^bun@(.+)$/.exec(packageManager)
  if (!match) {
    throw new TypeError(
      `packageManager does not use bun@ prefix: ${packageManager}`,
    )
  }
  return match[1]
}

type ToolchainVersionInputs = {
  nodeVersionFile: string
  bunVersionFile: string
  packageJson: JsonObject
  ciWorkflow: string
}

type VerifiedResult = {
  nodeMajor: number
  bunVersion: string
}

const collectConfigLines = (lines: string[], startIndex: number): string[] => {
  const collected: string[] = []
  for (let index = startIndex + 1; index < lines.length; index++) {
    const candidate = lines[index]
    if (
      candidate.includes('node-version:') ||
      candidate.includes('bun-version:') ||
      candidate.includes('node-version-file:') ||
      candidate.includes('bun-version-file:')
    ) {
      collected.push(candidate.trim())
    }
    if (/^\s*- uses:/.test(candidate)) {
      break
    }
  }
  return collected
}

const findStepConfigLines = (ciWorkflow: string, marker: string): string[] => {
  const sections: string[] = []
  const lines = ciWorkflow.split('\n')

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    if (!line.includes(marker)) {
      continue
    }
    const collected = collectConfigLines(lines, index)
    // Keep empty sections so steps without a version config are still validated.
    sections.push(collected.join(' '))
  }

  return sections
}

const validateSetupNodeSteps = (ciWorkflow: string): string[] => {
  const configLines = findStepConfigLines(
    ciWorkflow,
    'uses: actions/setup-node',
  )
  const mismatches: string[] = []

  if (configLines.length === 0) {
    mismatches.push(
      'No actions/setup-node step found referencing .node-version',
    )
  }

  for (const configLine of configLines) {
    if (configLine.includes("node-version-file: '.node-version'")) {
      continue
    }
    if (configLine.includes('node-version:')) {
      mismatches.push(
        'Found actions/setup-node step using hardcoded node-version instead of node-version-file',
      )
    } else {
      mismatches.push(
        'Found actions/setup-node step without node-version-file referencing .node-version',
      )
    }
  }

  return mismatches
}

const validateSetupBunSteps = (ciWorkflow: string): string[] => {
  const configLines = findStepConfigLines(ciWorkflow, 'uses: oven-sh/setup-bun')
  const mismatches: string[] = []

  if (configLines.length === 0) {
    mismatches.push('No oven-sh/setup-bun step found referencing .bun-version')
  }

  for (const configLine of configLines) {
    if (configLine.includes("bun-version-file: '.bun-version'")) {
      continue
    }
    if (configLine.includes('bun-version:')) {
      mismatches.push(
        'Found oven-sh/setup-bun step using hardcoded bun-version instead of bun-version-file',
      )
    } else {
      mismatches.push(
        'Found oven-sh/setup-bun step without bun-version-file referencing .bun-version',
      )
    }
  }

  return mismatches
}

export const verifyToolchainVersions = ({
  nodeVersionFile,
  bunVersionFile,
  packageJson,
  ciWorkflow,
}: ToolchainVersionInputs): VerifiedResult => {
  const enginesNode = readNestedStringProperty(packageJson, 'engines', 'node')
  const enginesBun = readNestedStringProperty(packageJson, 'engines', 'bun')
  const packageManager = readStringProperty(packageJson, 'packageManager')

  const devDependencies: unknown = packageJson.devDependencies
  if (!isRecord(devDependencies)) {
    throw new TypeError('devDependencies is not an object')
  }
  const typesNode = readStringProperty(devDependencies, '@types/node')

  const mismatches: string[] = []

  const nodeVersionFileMajor = extractMajor(nodeVersionFile)
  const enginesNodeMajor = extractMajor(enginesNode)
  const typesNodeMajor = extractMajor(typesNode)

  if (nodeVersionFileMajor !== enginesNodeMajor) {
    mismatches.push(
      `Node major mismatch\n- .node-version: ${nodeVersionFile} (major ${nodeVersionFileMajor})\n- engines.node: ${enginesNode} (major ${enginesNodeMajor})`,
    )
  }

  if (nodeVersionFileMajor !== typesNodeMajor) {
    mismatches.push(
      `Node major mismatch\n- .node-version: ${nodeVersionFile} (major ${nodeVersionFileMajor})\n- @types/node: ${typesNode} (major ${typesNodeMajor})`,
    )
  }

  const packageManagerBunVersion = extractPackageManagerVersion(packageManager)

  if (bunVersionFile !== enginesBun) {
    mismatches.push(
      `Bun version mismatch\n- .bun-version: ${bunVersionFile}\n- engines.bun: ${enginesBun}`,
    )
  }

  if (bunVersionFile !== packageManagerBunVersion) {
    mismatches.push(
      `Bun version mismatch\n- .bun-version: ${bunVersionFile}\n- packageManager: ${packageManager}`,
    )
  }

  mismatches.push(...validateSetupNodeSteps(ciWorkflow))
  mismatches.push(...validateSetupBunSteps(ciWorkflow))

  if (mismatches.length > 0) {
    throw new TypeError(
      `toolchain version mismatch:\n${mismatches.join('\n\n')}`,
    )
  }

  return {
    nodeMajor: nodeVersionFileMajor,
    bunVersion: bunVersionFile,
  }
}

const projectRoot = path.resolve(import.meta.dirname, '..', '..')

const readTextFile = (filePath: string): string => {
  const content = readFileSync(path.join(projectRoot, filePath), 'utf8')
  return content.trim()
}

const readJsonFile = (filePath: string): JsonObject => {
  const content = readFileSync(path.join(projectRoot, filePath), 'utf8')
  const parsed: unknown = JSON.parse(content)
  if (!isRecord(parsed)) {
    throw new TypeError(`${filePath} is not a JSON object`)
  }
  return parsed
}

const runVerification = (): void => {
  const nodeVersionFile = readTextFile('.node-version')
  const bunVersionFile = readTextFile('.bun-version')
  const packageJson = readJsonFile('package.json')
  const ciWorkflow = readTextFile('.github/workflows/ci.yml')

  const { nodeMajor, bunVersion } = verifyToolchainVersions({
    nodeVersionFile,
    bunVersionFile,
    packageJson,
    ciWorkflow,
  })

  console.log(
    `toolchain versions verified: Node ${nodeVersionFile} (major ${nodeMajor}), Bun ${bunVersion}`,
  )
}

if (import.meta.main) {
  runVerification()
}
