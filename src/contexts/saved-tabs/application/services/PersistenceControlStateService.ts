import { PersistenceUnavailableError } from '@/contexts/saved-tabs/application/errors/PersistenceUnavailableError'
import type {
  PersistenceBootstrapErrorCode,
  PersistenceControlState,
  PersistenceControlStateTransition,
} from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'
import { PERSISTENCE_BOOTSTRAP_ERROR_CODES } from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'

const persistenceBootstrapErrorCodes = new Set<string>(
  PERSISTENCE_BOOTSTRAP_ERROR_CODES,
)

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
    value.persistenceGeneration !== 2
  ) {
    return invalidControlState()
  }
  return {
    status: 'indexeddb',
    migrationId: value.migrationId,
    persistenceGeneration: 2,
  }
}

const decodeFailedState = (
  value: Record<string, unknown>,
): PersistenceControlState => {
  const hasMigrationId = Object.hasOwn(value, 'migrationId')
  const keys = hasMigrationId
    ? ['status', 'migrationId', 'errorCode']
    : ['status', 'errorCode']
  if (
    !hasOnlyKeys(value, keys) ||
    !isPersistenceBootstrapErrorCode(value.errorCode)
  ) {
    return invalidControlState()
  }
  if (!hasMigrationId) {
    return { status: 'failed', errorCode: value.errorCode }
  }
  if (!isMigrationId(value.migrationId)) {
    return invalidControlState()
  }
  return {
    status: 'failed',
    migrationId: value.migrationId,
    errorCode: value.errorCode,
  }
}

const decodeReadOnlyEmergencyState = (
  value: Record<string, unknown>,
): PersistenceControlState => {
  const hasMigrationId = Object.hasOwn(value, 'migrationId')
  const keys = hasMigrationId
    ? ['status', 'readSource', 'migrationId']
    : ['status', 'readSource']
  if (
    !hasOnlyKeys(value, keys) ||
    (value.readSource !== 'legacy' && value.readSource !== 'indexeddb')
  ) {
    return invalidControlState()
  }
  if (value.readSource === 'indexeddb') {
    if (!hasMigrationId || !isMigrationId(value.migrationId)) {
      return invalidControlState()
    }
    return {
      status: 'read-only-emergency',
      readSource: 'indexeddb',
      migrationId: value.migrationId,
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
    persistenceGeneration: 2,
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
  return {
    status: 'failed',
    migrationId: current.migrationId,
    errorCode: transition.errorCode,
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
    default: {
      return invalidTransition()
    }
  }
}
