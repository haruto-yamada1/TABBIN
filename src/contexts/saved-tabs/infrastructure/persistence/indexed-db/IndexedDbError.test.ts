import { describe, expect, it } from 'vitest'

import { PersistenceUnavailableError } from '@/contexts/saved-tabs/application/errors/PersistenceUnavailableError'

import { toIndexedDbError } from './IndexedDbError'

describe('toIndexedDbError', () => {
  it.each([
    'QuotaExceededError',
    'UnknownError',
    'SecurityError',
    'InvalidStateError',
    'NotReadableError',
  ])('reports native %s through the existing recovery boundary', (name) => {
    const cause = new DOMException('private URL and saved notes', name)

    const error = toIndexedDbError(cause, 'IndexedDB operation failed.')

    expect(error).toBeInstanceOf(PersistenceUnavailableError)
    expect(error).toMatchObject({ code: 'PERSISTENCE_RECOVERY_REQUIRED' })
    expect(error.cause).toBe(cause)
    expect(String(error)).not.toContain(cause.message)
    expect(JSON.stringify(error)).not.toContain(cause.message)
  })

  it.each([
    new DOMException('unique URL conflict', 'ConstraintError'),
    new DOMException('transaction aborted', 'AbortError'),
    new Error('revision conflict'),
    new TypeError('invalid write plan'),
    Object.assign(new Error('application error'), { name: 'UnknownError' }),
    new PersistenceUnavailableError('PERSISTENCE_RECOVERY_REQUIRED'),
  ])('preserves unrelated and already typed errors: $name', (error) => {
    expect(toIndexedDbError(error, 'IndexedDB operation failed.')).toBe(error)
  })

  it('keeps a non-Error failure as the cause of a fixed fallback', () => {
    const cause = { privateData: 'saved URL' }

    const error = toIndexedDbError(cause, 'IndexedDB operation failed.')

    expect(error.message).toBe('IndexedDB operation failed.')
    expect(error.cause).toBe(cause)
    expect(JSON.stringify(error)).not.toContain('saved URL')
  })
})
