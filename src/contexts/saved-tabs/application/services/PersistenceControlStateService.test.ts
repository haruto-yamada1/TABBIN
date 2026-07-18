import { describe, expect, it } from 'vitest'

import { PersistenceUnavailableError } from '@/contexts/saved-tabs/application/errors/PersistenceUnavailableError'
import type {
  PersistenceControlState,
  PersistenceControlStateTransition,
} from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'

import {
  decodePersistenceControlState,
  transitionPersistenceControlState,
} from './PersistenceControlStateService'

const expectInvalidControlState = (operation: () => unknown): void => {
  try {
    operation()
  } catch (error) {
    expect(error).toBeInstanceOf(PersistenceUnavailableError)
    expect((error as PersistenceUnavailableError).code).toBe(
      'PERSISTENCE_CONTROL_STATE_INVALID',
    )
    return
  }
  throw new Error('Expected persistence control state decoding to fail.')
}

const expectInvalidTransition = (operation: () => unknown): void => {
  try {
    operation()
  } catch (error) {
    expect(error).toBeInstanceOf(PersistenceUnavailableError)
    expect((error as PersistenceUnavailableError).code).toBe(
      'PERSISTENCE_INVALID_TRANSITION',
    )
    return
  }
  throw new Error('Expected persistence control state transition to fail.')
}

describe('PersistenceControlStateService', () => {
  it.each([
    undefined,
    { status: 'legacy' },
    { status: 'migrating', migrationId: 'migration-1' },
    { status: 'verifying', migrationId: 'migration-1' },
    { status: 'cutover-pending', migrationId: 'migration-1' },
    {
      status: 'indexeddb',
      migrationId: 'migration-1',
      persistenceGeneration: 2,
    },
    {
      status: 'failed',
      migrationId: 'migration-1',
      errorCode: 'PERSISTENCE_MIGRATION_FAILED',
    },
    {
      status: 'failed',
      errorCode: 'PERSISTENCE_RECOVERY_REQUIRED',
    },
    {
      status: 'read-only-emergency',
      readSource: 'indexeddb',
      migrationId: 'migration-1',
    },
    {
      status: 'read-only-emergency',
      readSource: 'legacy',
    },
  ])('decodes valid authoritative state %#', (value) => {
    expect(decodePersistenceControlState(value)).toEqual(
      value ?? { status: 'legacy' },
    )
  })

  it.each([
    null,
    [],
    {},
    { status: 'ready' },
    { status: 'legacy', migrationId: 'unexpected' },
    { status: 'migrating', migrationId: '' },
    {
      status: 'indexeddb',
      migrationId: 'migration-1',
      persistenceGeneration: 1,
    },
    {
      status: 'failed',
      errorCode: 'UNKNOWN_ERROR',
    },
    {
      status: 'read-only-emergency',
      readSource: 'unknown',
    },
  ])('rejects invalid authoritative state %#', (value) => {
    expect.hasAssertions()
    expectInvalidControlState(() => decodePersistenceControlState(value))
  })

  it.each<{
    current: PersistenceControlState
    transition: PersistenceControlStateTransition
    expected: PersistenceControlState
  }>([
    {
      current: { status: 'legacy' },
      transition: { type: 'begin-migration', migrationId: 'migration-1' },
      expected: { status: 'migrating', migrationId: 'migration-1' },
    },
    {
      current: {
        status: 'failed',
        migrationId: 'migration-1',
        errorCode: 'PERSISTENCE_MIGRATION_FAILED',
      },
      transition: { type: 'begin-migration', migrationId: 'migration-2' },
      expected: { status: 'migrating', migrationId: 'migration-2' },
    },
    {
      current: { status: 'migrating', migrationId: 'migration-1' },
      transition: {
        type: 'begin-verification',
        migrationId: 'migration-1',
      },
      expected: { status: 'verifying', migrationId: 'migration-1' },
    },
    {
      current: { status: 'verifying', migrationId: 'migration-1' },
      transition: {
        type: 'mark-cutover-pending',
        migrationId: 'migration-1',
      },
      expected: { status: 'cutover-pending', migrationId: 'migration-1' },
    },
    {
      current: { status: 'cutover-pending', migrationId: 'migration-1' },
      transition: {
        type: 'complete-cutover',
        migrationId: 'migration-1',
      },
      expected: {
        status: 'indexeddb',
        migrationId: 'migration-1',
        persistenceGeneration: 2,
      },
    },
    {
      current: { status: 'legacy' },
      transition: {
        type: 'enter-read-only-emergency',
        readSource: 'legacy',
      },
      expected: {
        status: 'read-only-emergency',
        readSource: 'legacy',
      },
    },
    {
      current: {
        status: 'failed',
        migrationId: 'migration-1',
        errorCode: 'PERSISTENCE_VERIFICATION_FAILED',
      },
      transition: {
        type: 'enter-read-only-emergency',
        readSource: 'legacy',
      },
      expected: {
        status: 'read-only-emergency',
        readSource: 'legacy',
        migrationId: 'migration-1',
      },
    },
    {
      current: { status: 'verifying', migrationId: 'migration-1' },
      transition: {
        type: 'fail',
        migrationId: 'migration-1',
        errorCode: 'PERSISTENCE_VERIFICATION_FAILED',
      },
      expected: {
        status: 'failed',
        migrationId: 'migration-1',
        errorCode: 'PERSISTENCE_VERIFICATION_FAILED',
      },
    },
    {
      current: {
        status: 'indexeddb',
        migrationId: 'migration-1',
        persistenceGeneration: 2,
      },
      transition: {
        type: 'enter-read-only-emergency',
        readSource: 'indexeddb',
        migrationId: 'migration-1',
      },
      expected: {
        status: 'read-only-emergency',
        readSource: 'indexeddb',
        migrationId: 'migration-1',
      },
    },
  ])('applies allowed transition %#', ({ current, transition, expected }) => {
    expect(transitionPersistenceControlState(current, transition)).toEqual(
      expected,
    )
  })

  it.each<{
    current: PersistenceControlState
    transition: PersistenceControlStateTransition
  }>([
    {
      current: { status: 'legacy' },
      transition: {
        type: 'begin-verification',
        migrationId: 'migration-1',
      },
    },
    {
      current: { status: 'migrating', migrationId: 'migration-1' },
      transition: {
        type: 'begin-verification',
        migrationId: 'migration-2',
      },
    },
    {
      current: {
        status: 'indexeddb',
        migrationId: 'migration-1',
        persistenceGeneration: 2,
      },
      transition: {
        type: 'enter-read-only-emergency',
        readSource: 'legacy',
      },
    },
    {
      current: {
        status: 'indexeddb',
        migrationId: 'migration-1',
        persistenceGeneration: 2,
      },
      transition: {
        type: 'enter-read-only-emergency',
        readSource: 'indexeddb',
        migrationId: 'migration-2',
      },
    },
    {
      current: { status: 'verifying', migrationId: 'migration-1' },
      transition: {
        type: 'complete-cutover',
        migrationId: 'migration-1',
      },
    },
    {
      current: { status: 'migrating', migrationId: 'migration-1' },
      transition: {
        type: 'enter-read-only-emergency',
        readSource: 'legacy',
      },
    },
  ])('rejects invalid transition %#', ({ current, transition }) => {
    expect.hasAssertions()
    expectInvalidTransition(() =>
      transitionPersistenceControlState(current, transition),
    )
  })
})
