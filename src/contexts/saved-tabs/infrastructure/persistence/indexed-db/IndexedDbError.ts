import { PersistenceUnavailableError } from '@/contexts/saved-tabs/application/errors/PersistenceUnavailableError'

const unavailableStorageErrorNames = new Set([
  'QuotaExceededError',
  'UnknownError',
  'SecurityError',
  'InvalidStateError',
  'NotReadableError',
])

export const toIndexedDbError = (
  value: unknown,
  fallbackMessage: string,
): Error => {
  if (
    value instanceof DOMException &&
    unavailableStorageErrorNames.has(value.name)
  ) {
    return new PersistenceUnavailableError('PERSISTENCE_RECOVERY_REQUIRED', {
      cause: value,
    })
  }
  return value instanceof Error
    ? value
    : new Error(fallbackMessage, {
        cause: value,
      })
}
