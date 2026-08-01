import { readFileSync } from 'node:fs'
import path from 'node:path'

import {
  PERSISTENCE_DATABASE_VERSION,
  PERSISTENCE_GENERATION,
} from '@/contexts/saved-tabs/public-api'

type JsonObject = Record<string, unknown>

export type PersistenceRollbackCompatibility = {
  readonly databaseDowngradeCompatible: boolean
  readonly destructiveSchemaChange: boolean
  readonly queryWriteContractCompatible: boolean
}

export type PersistenceReleaseContract = {
  readonly databaseVersion: number
  readonly minimumCompatibleAppVersion: string
  readonly persistenceGeneration: number
  readonly rollbackCompatibility: PersistenceRollbackCompatibility
}

export type PersistenceReleaseArtifact = PersistenceReleaseContract & {
  readonly appVersion: string
}

const isRecord = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const hasOnlyKeys = (value: JsonObject, keys: readonly string[]): boolean => {
  const expected = new Set(keys)
  return (
    Object.keys(value).length === expected.size &&
    Object.keys(value).every((key) => expected.has(key))
  )
}

const parseAppVersion = (value: unknown): readonly number[] => {
  if (typeof value !== 'string' || !/^\d+(?:\.\d+){0,3}$/.test(value)) {
    throw new TypeError('Persistence release app version is invalid.')
  }
  const parts = value.split('.').map(Number)
  if (parts.some((part) => !Number.isSafeInteger(part) || part > 65_535)) {
    throw new TypeError('Persistence release app version is invalid.')
  }
  return parts
}

const compareAppVersions = (left: string, right: string): number => {
  const leftParts = parseAppVersion(left)
  const rightParts = parseAppVersion(right)
  const length = Math.max(leftParts.length, rightParts.length)
  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0)
    if (difference !== 0) {
      return Math.sign(difference)
    }
  }
  return 0
}

const decodeRollbackCompatibility = (
  value: unknown,
): PersistenceRollbackCompatibility => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'databaseDowngradeCompatible',
      'destructiveSchemaChange',
      'queryWriteContractCompatible',
    ]) ||
    typeof value.databaseDowngradeCompatible !== 'boolean' ||
    typeof value.destructiveSchemaChange !== 'boolean' ||
    typeof value.queryWriteContractCompatible !== 'boolean'
  ) {
    throw new TypeError(
      'Persistence release rollback compatibility metadata is invalid.',
    )
  }
  return {
    databaseDowngradeCompatible: value.databaseDowngradeCompatible,
    destructiveSchemaChange: value.destructiveSchemaChange,
    queryWriteContractCompatible: value.queryWriteContractCompatible,
  }
}

export const decodePersistenceReleaseContract = (
  value: unknown,
): PersistenceReleaseContract => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'databaseVersion',
      'minimumCompatibleAppVersion',
      'persistenceGeneration',
      'rollbackCompatibility',
    ])
  ) {
    throw new TypeError('Persistence release metadata is missing or invalid.')
  }
  if (
    !Number.isSafeInteger(value.databaseVersion) ||
    Number(value.databaseVersion) < 1 ||
    !Number.isSafeInteger(value.persistenceGeneration) ||
    Number(value.persistenceGeneration) < 1
  ) {
    throw new TypeError('Persistence release generation metadata is invalid.')
  }
  parseAppVersion(value.minimumCompatibleAppVersion)
  return {
    databaseVersion: Number(value.databaseVersion),
    minimumCompatibleAppVersion: String(value.minimumCompatibleAppVersion),
    persistenceGeneration: Number(value.persistenceGeneration),
    rollbackCompatibility: decodeRollbackCompatibility(
      value.rollbackCompatibility,
    ),
  }
}

const verifyArtifact = (
  value: PersistenceReleaseArtifact,
): PersistenceReleaseArtifact => {
  parseAppVersion(value.appVersion)
  const contract = decodePersistenceReleaseContract({
    databaseVersion: value.databaseVersion,
    minimumCompatibleAppVersion: value.minimumCompatibleAppVersion,
    persistenceGeneration: value.persistenceGeneration,
    rollbackCompatibility: value.rollbackCompatibility,
  })
  if (
    compareAppVersions(value.appVersion, contract.minimumCompatibleAppVersion) <
    0
  ) {
    throw new Error(
      `Artifact ${value.appVersion} is below its minimum compatible app version ${contract.minimumCompatibleAppVersion}.`,
    )
  }
  return { appVersion: value.appVersion, ...contract }
}

export const verifyPersistenceRollbackCompatibility = ({
  candidate: candidateInput,
  deployed: deployedInput,
}: {
  readonly candidate: PersistenceReleaseArtifact
  readonly deployed: PersistenceReleaseArtifact
}): {
  readonly candidateAppVersion: string
  readonly deployedAppVersion: string
  readonly persistenceGeneration: number
} => {
  const candidate = verifyArtifact(candidateInput)
  const deployed = verifyArtifact(deployedInput)

  if (compareAppVersions(candidate.appVersion, deployed.appVersion) > 0) {
    throw new Error('The candidate is not a rollback artifact.')
  }
  if (candidate.persistenceGeneration !== deployed.persistenceGeneration) {
    throw new Error(
      `Persistence generation mismatch: candidate ${candidate.persistenceGeneration}, deployed ${deployed.persistenceGeneration}.`,
    )
  }
  if (
    compareAppVersions(
      candidate.appVersion,
      deployed.minimumCompatibleAppVersion,
    ) < 0
  ) {
    throw new Error(
      `Candidate ${candidate.appVersion} is below the deployed minimum compatible app version ${deployed.minimumCompatibleAppVersion}.`,
    )
  }
  if (candidate.databaseVersion !== deployed.databaseVersion) {
    throw new Error(
      `IndexedDB database version mismatch: candidate ${candidate.databaseVersion}, deployed ${deployed.databaseVersion}.`,
    )
  }
  if (deployed.rollbackCompatibility.destructiveSchemaChange) {
    throw new Error('Rollback is forbidden after a destructive schema change.')
  }
  if (!deployed.rollbackCompatibility.databaseDowngradeCompatible) {
    throw new Error('IndexedDB database downgrade compatibility is not proven.')
  }
  if (!deployed.rollbackCompatibility.queryWriteContractCompatible) {
    throw new Error(
      'Persistence query/write contract compatibility is not proven.',
    )
  }

  return {
    candidateAppVersion: candidate.appVersion,
    deployedAppVersion: deployed.appVersion,
    persistenceGeneration: candidate.persistenceGeneration,
  }
}

const projectRoot = path.resolve(import.meta.dirname, '..', '..')

const readJsonFile = (filePath: string): unknown =>
  JSON.parse(readFileSync(filePath, 'utf8'))

const readArtifact = (
  artifactDirectory: string,
): PersistenceReleaseArtifact => {
  const manifest = readJsonFile(path.join(artifactDirectory, 'manifest.json'))
  if (!isRecord(manifest) || typeof manifest.version !== 'string') {
    throw new TypeError(`${artifactDirectory}/manifest.json has no version.`)
  }
  const contract = decodePersistenceReleaseContract(
    readJsonFile(path.join(artifactDirectory, 'persistence-release.json')),
  )
  return verifyArtifact({ appVersion: manifest.version, ...contract })
}

const readSourceContract = (): PersistenceReleaseContract =>
  decodePersistenceReleaseContract(
    readJsonFile(
      path.join(projectRoot, 'src', 'public', 'persistence-release.json'),
    ),
  )

const verifyCurrentBuildArtifacts = (): void => {
  const packageJson = readJsonFile(path.join(projectRoot, 'package.json'))
  if (!isRecord(packageJson) || typeof packageJson.version !== 'string') {
    throw new TypeError('package.json has no version.')
  }
  const sourceContract = readSourceContract()
  const sourceArtifact = verifyArtifact({
    appVersion: packageJson.version,
    ...sourceContract,
  })
  if (sourceArtifact.databaseVersion !== PERSISTENCE_DATABASE_VERSION) {
    throw new Error(
      `Persistence release metadata database version ${sourceArtifact.databaseVersion} does not match runtime ${PERSISTENCE_DATABASE_VERSION}.`,
    )
  }
  if (sourceArtifact.persistenceGeneration !== PERSISTENCE_GENERATION) {
    throw new Error(
      `Persistence release metadata generation ${sourceArtifact.persistenceGeneration} does not match runtime ${PERSISTENCE_GENERATION}.`,
    )
  }

  for (const directory of ['chrome-mv3', 'firefox-mv2']) {
    const artifact = readArtifact(path.join(projectRoot, '.output', directory))
    if (JSON.stringify(artifact) !== JSON.stringify(sourceArtifact)) {
      throw new Error(
        `${directory} persistence release metadata does not match the source contract.`,
      )
    }
  }
  console.log(
    `persistence release metadata verified: generation ${sourceArtifact.persistenceGeneration}, app ${sourceArtifact.appVersion}, database ${sourceArtifact.databaseVersion}`,
  )
}

const readFlag = (
  args: readonly string[],
  flag: string,
): string | undefined => {
  const index = args.indexOf(flag)
  return index === -1 ? undefined : args[index + 1]
}

const runVerification = (args: readonly string[]): void => {
  if (args.length === 0) {
    verifyCurrentBuildArtifacts()
    return
  }
  const deployedDirectory = readFlag(args, '--deployed-dir')
  const candidateDirectory = readFlag(args, '--candidate-dir')
  if (
    args.length !== 4 ||
    deployedDirectory === undefined ||
    candidateDirectory === undefined
  ) {
    throw new TypeError(
      'Usage: verify-persistence-release-compatibility --deployed-dir <dir> --candidate-dir <dir>',
    )
  }
  const result = verifyPersistenceRollbackCompatibility({
    candidate: readArtifact(path.resolve(candidateDirectory)),
    deployed: readArtifact(path.resolve(deployedDirectory)),
  })
  console.log(
    `persistence rollback compatible: ${result.deployedAppVersion} -> ${result.candidateAppVersion} (generation ${result.persistenceGeneration})`,
  )
}

if (import.meta.main) {
  runVerification(process.argv.slice(2))
}
