import { describe, expect, it } from 'vitest'

import type { PersistenceEmergencyBackup } from '@/contexts/saved-tabs/application/ports/PersistenceMigrationRecoveryPort'
import { MIGRATION_SOURCE_KEYS } from '@/contexts/saved-tabs/application/ports/RawLegacyStorageReaderPort'
import type { RawLegacyStorageSnapshot } from '@/contexts/saved-tabs/application/ports/RawLegacyStorageReaderPort'

import {
  deserializePersistenceEmergencyBackup,
  serializePersistenceEmergencyBackup,
} from './PersistenceEmergencyBackupCodecService'

const createBackup = (): PersistenceEmergencyBackup => {
  const rawLegacyStorage = Object.fromEntries(
    MIGRATION_SOURCE_KEYS.map((key) => [key, { status: 'missing' }]),
  ) as RawLegacyStorageSnapshot

  return {
    createdAt: 123,
    format: 'tabbin-legacy-emergency-backup',
    rawLegacyStorage: {
      ...rawLegacyStorage,
      savedTabs: {
        status: 'present',
        value: {
          collisionLikeUserValue: {
            $type: 'undefined',
            ['__proto__']: 'private user value',
          },
          nested: [undefined, { value: undefined }],
        },
      },
      urls: { status: 'present', value: undefined },
    },
    version: 1,
    warning: 'contains-private-user-data',
  }
}

describe('PersistenceEmergencyBackupCodec', () => {
  it('round-trips present undefined values without colliding with user objects', () => {
    const backup = createBackup()

    const restored = deserializePersistenceEmergencyBackup(
      serializePersistenceEmergencyBackup(backup),
    )

    expect(restored).toStrictEqual(backup)
    expect(Object.hasOwn(restored.rawLegacyStorage.urls, 'value')).toBe(true)
    const savedTabs = restored.rawLegacyStorage.savedTabs
    const collisionLikeUserValue =
      savedTabs.status === 'present' &&
      typeof savedTabs.value === 'object' &&
      savedTabs.value !== null
        ? Reflect.get(savedTabs.value, 'collisionLikeUserValue')
        : undefined
    expect(collisionLikeUserValue).toBeTypeOf('object')
    if (
      typeof collisionLikeUserValue !== 'object' ||
      collisionLikeUserValue === null
    ) {
      throw new TypeError('Expected decoded collision-like user object.')
    }
    expect(Object.hasOwn(collisionLikeUserValue, '__proto__')).toBe(true)
  })
})
