import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import * as CDX from '@cyclonedx/cyclonedx-library'
import JSON5 from 'json5'

type JsonObject = Record<string, unknown>

type BunLockPackage = [
  resolvedReference: string,
  registryOrPath: string,
  metadata: JsonObject,
  integrity?: string,
]

type PackageInfo = {
  name: string
  version: string
  integrity?: string
  metadata: JsonObject
  isProduction: boolean
}

type ArtifactInfo = {
  browser: 'chrome' | 'firefox'
  fileName: string
  sha256: string
}

type BuildMetadata = {
  appName: string
  appVersion: string
  gitSha: string
  nodeVersion: string
  bunVersion: string
  buildTimestamp: string
  bunLockSha256: string
  artifacts: ArtifactInfo[]
  sbom: {
    fileName: string
    format: string
    specVersion: string
  }
}

const isBunLockPackage = (value: unknown): value is BunLockPackage =>
  Array.isArray(value) &&
  value.length >= 2 &&
  typeof value[0] === 'string' &&
  typeof value[1] === 'string' &&
  isRecord(value[2])

const isRecord = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const readTextFile = (filePath: string): string =>
  readFileSync(filePath, 'utf8').trim()

const parseJsonWithTrailingCommas = (content: string): unknown =>
  JSON5.parse<unknown>(content)

const readJsonFile = (filePath: string): JsonObject => {
  const content = readFileSync(filePath, 'utf8')
  const parsed: unknown = parseJsonWithTrailingCommas(content)
  if (!isRecord(parsed)) {
    throw new TypeError(`${filePath} is not a JSON object`)
  }
  return parsed
}

const computeSha256 = (filePath: string): string => {
  const hash = createHash('sha256')
  hash.update(readFileSync(filePath))
  return hash.digest('hex')
}

const encodeNpmPurl = (name: string, version: string): string => {
  const encodedName = name.replace(/^@/, '%40').replace(/\//g, '%2F')
  return `pkg:npm/${encodedName}@${version}`
}

const base64ToHex = (base64: string): string =>
  Buffer.from(base64, 'base64').toString('hex')

export const extractNameAndVersion = (
  resolvedReference: string,
): { name: string; version: string } => {
  const match = /^(?:@([^/]+)\/)?([^@]+)@(.+)$/.exec(resolvedReference)
  if (!match) {
    throw new TypeError(
      `Unable to parse package reference: ${resolvedReference}`,
    )
  }
  const [, scope, name, version] = match
  const fullName = scope ? `@${scope}/${name}` : name
  return { name: fullName, version }
}

export const extractLicense = (packageJson: JsonObject): CDX.Models.License => {
  const license = packageJson.license
  const licenses = packageJson.licenses
  if (typeof license === 'string') {
    if (CDX.SPDX.isSupportedSpdxId(license)) {
      return new CDX.Models.SpdxLicense(license)
    }
    return new CDX.Models.NamedLicense(license)
  }
  if (Array.isArray(license)) {
    const expressions = license
      .filter(isRecord)
      .map((entry) => entry.type)
      .filter((type): type is string => typeof type === 'string')
    if (expressions.length > 0) {
      return new CDX.Models.LicenseExpression(expressions.join(' OR '))
    }
  }
  if (Array.isArray(licenses)) {
    const expressions = licenses
      .filter(isRecord)
      .map((entry) => entry.type)
      .filter((type): type is string => typeof type === 'string')
    if (expressions.length > 0) {
      return new CDX.Models.LicenseExpression(expressions.join(' OR '))
    }
  }
  return new CDX.Models.LicenseExpression('NOASSERTION')
}

const readPackageJson = (
  projectRoot: string,
  packageName: string,
): JsonObject | undefined => {
  const packageDir = path.join(projectRoot, 'node_modules', packageName)
  const packageJsonPath = path.join(packageDir, 'package.json')
  if (!existsSync(packageJsonPath)) {
    return undefined
  }
  try {
    return readJsonFile(packageJsonPath)
  } catch {
    return undefined
  }
}

export const parseBunLockPackages = (
  bunLock: unknown,
  productionNames: Set<string>,
): PackageInfo[] => {
  if (!isRecord(bunLock)) {
    throw new TypeError('bun.lock is not an object')
  }
  const packages = bunLock.packages
  if (!isRecord(packages)) {
    throw new TypeError('bun.lock packages is not an object')
  }

  const seen = new Set<string>()
  const result: PackageInfo[] = []

  for (const rawEntry of Object.values(packages)) {
    if (!isBunLockPackage(rawEntry)) {
      continue
    }
    const entry: BunLockPackage = rawEntry
    const resolvedReference = entry[0]
    const { name, version } = extractNameAndVersion(resolvedReference)
    const packageId = `${name}@${version}`
    if (seen.has(packageId)) {
      continue
    }
    seen.add(packageId)

    const metadata: JsonObject = entry[2]
    const integrity = typeof entry[3] === 'string' ? entry[3] : undefined

    result.push({
      name,
      version,
      integrity,
      metadata,
      isProduction: productionNames.has(name),
    })
  }

  return result
}

const addPackageComponent = (
  bom: CDX.Models.Bom,
  packageInfo: PackageInfo,
  projectRoot: string,
): void => {
  const component = new CDX.Models.Component(
    CDX.Enums.ComponentType.Library,
    packageInfo.name,
    {
      version: packageInfo.version,
      purl: encodeNpmPurl(packageInfo.name, packageInfo.version),
      scope: packageInfo.isProduction
        ? CDX.Enums.ComponentScope.Required
        : CDX.Enums.ComponentScope.Excluded,
    },
  )

  if (packageInfo.integrity?.startsWith('sha512-')) {
    const hexHash = base64ToHex(packageInfo.integrity.slice('sha512-'.length))
    if (hexHash.length === 128) {
      component.hashes.set(CDX.Enums.HashAlgorithm['SHA-512'], hexHash)
    }
  }

  const packageJson = readPackageJson(projectRoot, packageInfo.name)
  if (packageJson !== undefined) {
    component.licenses.add(extractLicense(packageJson))
    if (typeof packageJson.description === 'string') {
      component.description = packageJson.description
    }
  }

  bom.components.add(component)
}

export const generateSbom = (options: {
  appName: string
  appVersion: string
  packages: PackageInfo[]
  projectRoot: string
  gitSha: string
  buildTimestamp: string
}): CDX.Models.Bom => {
  const { appName, appVersion, packages, projectRoot, gitSha, buildTimestamp } =
    options

  const bom = new CDX.Models.Bom()
  bom.serialNumber = `urn:uuid:${randomUUID()}`

  const appComponent = new CDX.Models.Component(
    CDX.Enums.ComponentType.Application,
    appName,
    {
      version: appVersion,
      purl: encodeNpmPurl(appName, appVersion),
    },
  )
  appComponent.properties.add(new CDX.Models.Property('gitSha', gitSha))

  const toolRepository = new CDX.Models.ToolRepository()
  toolRepository.add(
    new CDX.Models.Tool({
      name: 'tabbin-release-provenance',
      version: appVersion,
    }),
  )

  bom.metadata = new CDX.Models.Metadata({
    timestamp: new Date(buildTimestamp),
    component: appComponent,
    tools: new CDX.Models.Tools({ tools: toolRepository }),
  })

  for (const packageInfo of packages) {
    addPackageComponent(bom, packageInfo, projectRoot)
  }

  return bom
}

const findZipArtifacts = (
  outputDir: string,
  appVersion: string,
): ArtifactInfo[] => {
  const expectedArtifacts: {
    browser: 'chrome' | 'firefox'
    fileName: string
  }[] = [
    { browser: 'chrome', fileName: `tabbin-${appVersion}-chrome.zip` },
    { browser: 'firefox', fileName: `tabbin-${appVersion}-firefox.zip` },
  ]

  return expectedArtifacts
    .map((expected) => {
      const filePath = path.join(outputDir, expected.fileName)
      if (!existsSync(filePath)) {
        return undefined
      }
      return {
        browser: expected.browser,
        fileName: expected.fileName,
        sha256: computeSha256(filePath),
      }
    })
    .filter((artifact): artifact is ArtifactInfo => artifact !== undefined)
}

export const generateBuildMetadata = (options: {
  appName: string
  appVersion: string
  gitSha: string
  nodeVersion: string
  bunVersion: string
  buildTimestamp: string
  bunLockSha256: string
  outputDir: string
}): BuildMetadata => {
  const {
    appName,
    appVersion,
    gitSha,
    nodeVersion,
    bunVersion,
    buildTimestamp,
    bunLockSha256,
    outputDir,
  } = options

  const artifacts = findZipArtifacts(outputDir, appVersion)
  const sbomFileName = `${appName}-${appVersion}-sbom.cdx.json`

  return {
    appName,
    appVersion,
    gitSha,
    nodeVersion,
    bunVersion,
    buildTimestamp,
    bunLockSha256,
    artifacts,
    sbom: {
      fileName: sbomFileName,
      format: 'CycloneDX',
      specVersion: '1.6',
    },
  }
}

const getGitSha = (projectRoot: string): string => {
  try {
    const porcelainStatus = execFileSync('git', ['status', '--porcelain'], {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim()
    if (porcelainStatus !== '') {
      throw new TypeError(
        'Git worktree is not clean; commit or stash changes before generating release provenance',
      )
    }

    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim()
  } catch (error) {
    if (error instanceof TypeError) {
      throw error
    }
    throw new TypeError(
      'Unable to determine git commit SHA; ensure the project is in a git repository',
      { cause: error },
    )
  }
}

type ProvenanceInputs = {
  projectRoot: string
  outputDir: string
  buildTimestamp?: string
  gitSha?: string
}

export const generateReleaseProvenance = (
  inputs: ProvenanceInputs,
): { metadata: BuildMetadata; sbomJson: string } => {
  const {
    projectRoot,
    outputDir,
    buildTimestamp = new Date().toISOString(),
    gitSha = getGitSha(projectRoot),
  } = inputs

  const packageJson = readJsonFile(path.join(projectRoot, 'package.json'))
  const appVersion = packageJson.version
  if (typeof appVersion !== 'string' || appVersion === '') {
    throw new TypeError('package.json version is missing or not a string')
  }
  const appName = packageJson.name
  if (typeof appName !== 'string' || appName === '') {
    throw new TypeError('package.json name is missing or not a string')
  }

  const nodeVersion = readTextFile(path.join(projectRoot, '.node-version'))
  const bunVersion = readTextFile(path.join(projectRoot, '.bun-version'))
  const productionNames = isRecord(packageJson.dependencies)
    ? new Set(Object.keys(packageJson.dependencies))
    : new Set<string>()

  const bunLockSha256 = computeSha256(path.join(projectRoot, 'bun.lock'))
  const bunLock = readJsonFile(path.join(projectRoot, 'bun.lock'))
  const packages = parseBunLockPackages(bunLock, productionNames)

  const sbom = generateSbom({
    appName,
    appVersion,
    packages,
    projectRoot,
    gitSha,
    buildTimestamp,
  })

  const serializer = new CDX.Serialize.JsonSerializer(
    new CDX.Serialize.JSON.Normalize.Factory(CDX.Spec.Spec1dot6),
  )
  const sbomJson = serializer.serialize(sbom, { space: 2 })

  const metadata = generateBuildMetadata({
    appName,
    appVersion,
    gitSha,
    nodeVersion,
    bunVersion,
    buildTimestamp,
    bunLockSha256,
    outputDir,
  })

  return { metadata, sbomJson }
}

export const writeReleaseProvenance = (inputs: ProvenanceInputs): void => {
  const { outputDir } = inputs
  const { metadata, sbomJson } = generateReleaseProvenance(inputs)

  const artifactBrowsers = new Set(
    metadata.artifacts.map((artifact) => artifact.browser),
  )
  if (!artifactBrowsers.has('chrome') || !artifactBrowsers.has('firefox')) {
    throw new TypeError(
      'Both Chrome and Firefox ZIP artifacts must exist before writing release provenance',
    )
  }

  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true })
  }

  const metadataFileName = `${metadata.appName}-${metadata.appVersion}-build-metadata.json`
  writeFileSync(
    path.join(outputDir, metadataFileName),
    `${JSON.stringify(metadata, null, 2)}\n`,
  )

  const sbomFileName = metadata.sbom.fileName
  writeFileSync(path.join(outputDir, sbomFileName), `${sbomJson}\n`)

  console.log(`Generated ${metadataFileName}`)
  console.log(`Generated ${sbomFileName}`)
  for (const artifact of metadata.artifacts) {
    console.log(`Recorded ${artifact.browser} artifact: ${artifact.fileName}`)
  }
}

const projectRoot = path.resolve(import.meta.dirname, '..', '..')
const outputDir = path.join(projectRoot, '.output')

if (import.meta.main) {
  writeReleaseProvenance({ projectRoot, outputDir })
}
