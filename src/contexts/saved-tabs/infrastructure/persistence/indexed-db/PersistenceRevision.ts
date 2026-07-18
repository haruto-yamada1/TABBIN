type PersistenceRevisionRecord = {
  readonly key: 'revision'
  readonly value: number
}

const isPersistenceRevisionRecord = (
  value: unknown,
): value is PersistenceRevisionRecord =>
  typeof value === 'object' &&
  value !== null &&
  'key' in value &&
  value.key === 'revision' &&
  'value' in value &&
  typeof value.value === 'number' &&
  Number.isSafeInteger(value.value) &&
  value.value >= 0

export const decodePersistenceRevision = (value: unknown): number => {
  if (value === undefined) {
    return 0
  }
  if (isPersistenceRevisionRecord(value)) {
    return value.value
  }

  throw new TypeError('IndexedDB contains an invalid persistence revision.')
}
