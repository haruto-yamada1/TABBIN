import { PersistenceUnavailableError } from '@/contexts/saved-tabs/application/errors/PersistenceUnavailableError'
import type {
  PersistenceBootstrapErrorCode,
  PersistenceControlState,
  PersistenceControlStateTransition,
} from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'
import { PERSISTENCE_BOOTSTRAP_ERROR_CODES } from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'
import type {
  PersistenceV2MigrationDiagnostic,
  PersistenceV2MigrationStage,
} from '@/contexts/saved-tabs/application/ports/PersistenceRecoveryPort'
import { PERSISTENCE_V2_MIGRATION_ERROR_CODES } from '@/contexts/saved-tabs/application/ports/PersistenceRecoveryPort'
import { PERSISTENCE_GENERATION } from '@/contexts/saved-tabs/application/services/PersistenceReleasePolicyService'
import { PERSISTENCE_SOURCE_ENTITY_KINDS } from '@/lib/persistence/capacity'

const persistenceBootstrapErrorCodes = new Set<string>(
  PERSISTENCE_BOOTSTRAP_ERROR_CODES,
)
const persistenceV2MigrationErrorCodes = new Set<string>(
  PERSISTENCE_V2_MIGRATION_ERROR_CODES,
)
const persistenceV2MigrationStages = new Set<string>([
  'preflight',
  'source-map',
  'target-read',
  'target-write',
  'verification',
] satisfies readonly PersistenceV2MigrationStage[])
const persistenceSourceEntityKinds = new Set<string>(
  PERSISTENCE_SOURCE_ENTITY_KINDS,
)
const SAFE_ISSUE_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_:-]{0,127}$/u

const persistenceControlStatuses = new Set<string>([
  'cutover-pending',
  'failed',
  'indexeddb',
  'legacy',
  'migrating',
  'read-only-emergency',
  'verifying',
] satisfies readonly PersistenceControlState['status'][])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const hasOnlyKeys = (
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean => {
  const expected = new Set(keys)
  return (
    Object.keys(value).length === expected.size &&
    Object.keys(value).every((key) => expected.has(key))
  )
}

const isMigrationId = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0

const isSafeCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

const isPersistenceV2MigrationErrorCode = (
  value: unknown,
): value is PersistenceV2MigrationDiagnostic['errorCode'] =>
  typeof value === 'string' && persistenceV2MigrationErrorCodes.has(value)

const isPersistenceV2MigrationStage = (
  value: unknown,
): value is PersistenceV2MigrationStage =>
  typeof value === 'string' && persistenceV2MigrationStages.has(value)

const decodeMigrationDiagnostic = (
  value: unknown,
): PersistenceV2MigrationDiagnostic => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'errorCode',
      'issueCodes',
      'migrationId',
      'sourceBytes',
      'sourceEntityCounts',
      'stage',
    ]) ||
    !isPersistenceV2MigrationErrorCode(value.errorCode) ||
    !Array.isArray(value.issueCodes) ||
    !value.issueCodes.every(
      (code): code is string =>
        typeof code === 'string' && SAFE_ISSUE_CODE_PATTERN.test(code),
    ) ||
    !isMigrationId(value.migrationId) ||
    !isSafeCount(value.sourceBytes) ||
    !isRecord(value.sourceEntityCounts) ||
    !Object.entries(value.sourceEntityCounts).every(
      ([kind, count]) =>
        persistenceSourceEntityKinds.has(kind) && isSafeCount(count),
    ) ||
    !isPersistenceV2MigrationStage(value.stage)
  ) {
    return invalidControlState()
  }
  return {
    errorCode: value.errorCode,
    issueCodes: [...value.issueCodes],
    migrationId: value.migrationId,
    sourceBytes: value.sourceBytes,
    sourceEntityCounts: { ...value.sourceEntityCounts },
    stage: value.stage,
  }
}

const isPersistenceBootstrapErrorCode = (
  value: unknown,
): value is PersistenceBootstrapErrorCode =>
  typeof value === 'string' && persistenceBootstrapErrorCodes.has(value)

const isPersistenceControlStatus = (
  value: string,
): value is PersistenceControlState['status'] =>
  persistenceControlStatuses.has(value)

const invalidControlState = (): never => {
  throw new PersistenceUnavailableError('PERSISTENCE_CONTROL_STATE_INVALID')
}

const invalidTransition = (): never => {
  throw new PersistenceUnavailableError('PERSISTENCE_INVALID_TRANSITION')
}

const decodeLegacyState = (
  value: Record<string, unknown>,
): PersistenceControlState => {
  if (!hasOnlyKeys(value, ['status'])) {
    return invalidControlState()
  }
  return { status: 'legacy' }
}

const decodeMigrationState = (
  value: Record<string, unknown>,
  status: 'cutover-pending' | 'migrating' | 'verifying',
): PersistenceControlState => {
  if (
    !hasOnlyKeys(value, ['status', 'migrationId']) ||
    !isMigrationId(value.migrationId)
  ) {
    return invalidControlState()
  }
  return { status, migrationId: value.migrationId }
}

const decodeIndexedDbState = (
  value: Record<string, unknown>,
): PersistenceControlState => {
  if (
    !hasOnlyKeys(value, ['status', 'migrationId', 'persistenceGeneration']) ||
    !isMigrationId(value.migrationId) ||
    value.persistenceGeneration !== PERSISTENCE_GENERATION
  ) {
    return invalidControlState()
  }
  return {
    status: 'indexeddb',
    migrationId: value.migrationId,
    persistenceGeneration: PERSISTENCE_GENERATION,
  }
}

const decodeFailedState = (
  value: Record<string, unknown>,
): PersistenceControlState => {
  const hasMigrationId = Object.hasOwn(value, 'migrationId')
  const hasDiagnostic = Object.hasOwn(value, 'diagnostic')
  const keys = [
    'status',
    ...(hasMigrationId ? ['migrationId'] : []),
    'errorCode',
    ...(hasDiagnostic ? ['diagnostic'] : []),
  ]
  if (
    !hasOnlyKeys(value, keys) ||
    !isPersistenceBootstrapErrorCode(value.errorCode) ||
    (hasDiagnostic && !hasMigrationId)
  ) {
    return invalidControlState()
  }
  if (!hasMigrationId) {
    return { status: 'failed', errorCode: value.errorCode }
  }
  if (!isMigrationId(value.migrationId)) {
    return invalidControlState()
  }
  const diagnostic = hasDiagnostic
    ? decodeMigrationDiagnostic(value.diagnostic)
    : undefined
  if (diagnostic && diagnostic.migrationId !== value.migrationId) {
    return invalidControlState()
  }
  return {
    status: 'failed',
    migrationId: value.migrationId,
    errorCode: value.errorCode,
    ...(diagnostic ? { diagnostic } : {}),
  }
}

const decodeReadOnlyEmergencyState = (
  value: Record<string, unknown>,
): PersistenceControlState => {
  const hasMigrationId = Object.hasOwn(value, 'migrationId')
  let keys = ['status', 'readSource']
  if (value.readSource === 'indexeddb') {
    keys = ['status', 'readSource', 'migrationId', 'persistenceGeneration']
  } else if (hasMigrationId) {
    keys = ['status', 'readSource', 'migrationId']
  }
  if (
    !hasOnlyKeys(value, keys) ||
    (value.readSource !== 'legacy' && value.readSource !== 'indexeddb')
  ) {
    return invalidControlState()
  }
  if (value.readSource === 'indexeddb') {
    if (
      !hasMigrationId ||
      !isMigrationId(value.migrationId) ||
      value.persistenceGeneration !== PERSISTENCE_GENERATION
    ) {
      return invalidControlState()
    }
    return {
      status: 'read-only-emergency',
      readSource: 'indexeddb',
      migrationId: value.migrationId,
      persistenceGeneration: PERSISTENCE_GENERATION,
    }
  }
  if (!hasMigrationId) {
    return {
      status: 'read-only-emergency',
      readSource: 'legacy',
    }
  }
  if (!isMigrationId(value.migrationId)) {
    return invalidControlState()
  }
  return {
    status: 'read-only-emergency',
    readSource: 'legacy',
    migrationId: value.migrationId,
  }
}

const stateDecoders: Record<
  PersistenceControlState['status'],
  (value: Record<string, unknown>) => PersistenceControlState
> = {
  'cutover-pending': (value) => decodeMigrationState(value, 'cutover-pending'),
  failed: decodeFailedState,
  indexeddb: decodeIndexedDbState,
  legacy: decodeLegacyState,
  migrating: (value) => decodeMigrationState(value, 'migrating'),
  'read-only-emergency': decodeReadOnlyEmergencyState,
  verifying: (value) => decodeMigrationState(value, 'verifying'),
}

export const decodePersistenceControlState = (
  value: unknown,
): PersistenceControlState => {
  if (value === undefined) {
    return { status: 'legacy' }
  }
  if (
    !isRecord(value) ||
    typeof value.status !== 'string' ||
    !isPersistenceControlStatus(value.status)
  ) {
    return invalidControlState()
  }
  return stateDecoders[value.status](value)
}

const requireMatchingMigrationId = (
  current: Extract<PersistenceControlState, { readonly migrationId: string }>,
  migrationId: string,
): string => {
  if (!isMigrationId(migrationId) || current.migrationId !== migrationId) {
    return invalidTransition()
  }
  return migrationId
}

type TransitionOf<Type extends PersistenceControlStateTransition['type']> =
  Extract<PersistenceControlStateTransition, { readonly type: Type }>

const beginMigration = (
  current: PersistenceControlState,
  transition: TransitionOf<'begin-migration'>,
): PersistenceControlState => {
  if (
    (current.status !== 'legacy' && current.status !== 'failed') ||
    !isMigrationId(transition.migrationId)
  ) {
    return invalidTransition()
  }
  return { status: 'migrating', migrationId: transition.migrationId }
}

const beginVerification = (
  current: PersistenceControlState,
  transition: TransitionOf<'begin-verification'>,
): PersistenceControlState => {
  if (current.status !== 'migrating') {
    return invalidTransition()
  }
  return {
    status: 'verifying',
    migrationId: requireMatchingMigrationId(current, transition.migrationId),
  }
}

const markCutoverPending = (
  current: PersistenceControlState,
  transition: TransitionOf<'mark-cutover-pending'>,
): PersistenceControlState => {
  if (current.status !== 'verifying') {
    return invalidTransition()
  }
  return {
    status: 'cutover-pending',
    migrationId: requireMatchingMigrationId(current, transition.migrationId),
  }
}

const completeCutover = (
  current: PersistenceControlState,
  transition: TransitionOf<'complete-cutover'>,
): PersistenceControlState => {
  if (current.status !== 'cutover-pending') {
    return invalidTransition()
  }
  return {
    status: 'indexeddb',
    migrationId: requireMatchingMigrationId(current, transition.migrationId),
    persistenceGeneration: PERSISTENCE_GENERATION,
  }
}

const failMigration = (
  current: PersistenceControlState,
  transition: TransitionOf<'fail'>,
): PersistenceControlState => {
  if (
    current.status !== 'migrating' &&
    current.status !== 'verifying' &&
    current.status !== 'cutover-pending'
  ) {
    return invalidTransition()
  }
  if (
    transition.migrationId !== undefined &&
    transition.migrationId !== current.migrationId
  ) {
    return invalidTransition()
  }
  if (
    transition.diagnostic !== undefined &&
    transition.diagnostic.migrationId !== current.migrationId
  ) {
    return invalidTransition()
  }
  return {
    status: 'failed',
    migrationId: current.migrationId,
    errorCode: transition.errorCode,
    ...(transition.diagnostic === undefined
      ? {}
      : { diagnostic: transition.diagnostic }),
  }
}

const enterReadOnlyEmergency = (
  current: PersistenceControlState,
  transition: TransitionOf<'enter-read-only-emergency'>,
): PersistenceControlState => {
  if (
    current.status !== 'legacy' &&
    current.status !== 'indexeddb' &&
    current.status !== 'failed'
  ) {
    return invalidTransition()
  }
  if (current.status === 'indexeddb') {
    if (
      transition.readSource !== 'indexeddb' ||
      transition.migrationId !== current.migrationId
    ) {
      return invalidTransition()
    }
    return {
      status: 'read-only-emergency',
      readSource: 'indexeddb',
      migrationId: current.migrationId,
      persistenceGeneration: current.persistenceGeneration,
    }
  }

  const migrationId =
    current.status === 'failed' ? current.migrationId : undefined
  if (
    transition.readSource !== 'legacy' ||
    (transition.migrationId !== undefined &&
      transition.migrationId !== migrationId)
  ) {
    return invalidTransition()
  }
  return migrationId === undefined
    ? { status: 'read-only-emergency', readSource: 'legacy' }
    : {
        status: 'read-only-emergency',
        readSource: 'legacy',
        migrationId,
      }
}

const exitReadOnlyEmergency = (
  current: PersistenceControlState,
  transition: TransitionOf<'exit-read-only-emergency'>,
): PersistenceControlState => {
  if (
    current.status !== 'read-only-emergency' ||
    current.readSource !== 'indexeddb' ||
    transition.migrationId !== current.migrationId
  ) {
    return invalidTransition()
  }
  return {
    status: 'indexeddb',
    migrationId: current.migrationId,
    persistenceGeneration: current.persistenceGeneration,
  }
}

export const transitionPersistenceControlState = (
  current: PersistenceControlState,
  transition: PersistenceControlStateTransition,
): PersistenceControlState => {
  switch (transition.type) {
    case 'begin-migration': {
      return beginMigration(current, transition)
    }
    case 'begin-verification': {
      return beginVerification(current, transition)
    }
    case 'mark-cutover-pending': {
      return markCutoverPending(current, transition)
    }
    case 'complete-cutover': {
      return completeCutover(current, transition)
    }
    case 'fail': {
      return failMigration(current, transition)
    }
    case 'enter-read-only-emergency': {
      return enterReadOnlyEmergency(current, transition)
    }
    case 'exit-read-only-emergency': {
      return exitReadOnlyEmergency(current, transition)
    }
    default: {
      return invalidTransition()
    }
  }
}
