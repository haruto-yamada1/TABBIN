import { describe, expect, it, vi } from 'vitest'

import { PersistenceUnavailableError } from '@/contexts/saved-tabs/application/errors/PersistenceUnavailableError'

import { PersistenceOperationGateService } from './PersistenceOperationGateService'

describe('PersistenceOperationGateService', () => {
  it.each(['runIndexedDbRead', 'runIndexedDbWrite'] as const)(
    'coordinates %s after readiness',
    async (method) => {
      const events: string[] = []
      const gate = new PersistenceOperationGateService({
        bootstrap: {
          ready: async () => {
            events.push('ready')
          },
        },
        coordination: {
          runExclusive: async (operation) => operation(),
          runShared: async (operation) => {
            events.push('lock')
            const value = await operation()
            events.push('unlock')
            return value
          },
        },
        recovery: { reportUnavailable: vi.fn() },
      })
      await expect(
        gate[method](async () => {
          events.push('operation')
          return 42
        }),
      ).resolves.toBe(42)
      expect(events).toEqual(['ready', 'lock', 'operation', 'unlock'])
    },
  )

  it('blocks operations and reports failed readiness', async () => {
    const error = new PersistenceUnavailableError(
      'PERSISTENCE_RECOVERY_REQUIRED',
    )
    const operation = vi.fn(async () => 42)
    const reportUnavailable = vi.fn()
    const gate = new PersistenceOperationGateService({
      bootstrap: {
        ready: async () => {
          throw error
        },
      },
      coordination: {
        runExclusive: async (op) => op(),
        runShared: async (op) => op(),
      },
      recovery: { reportUnavailable },
    })
    await expect(gate.runIndexedDbWrite(operation)).rejects.toBe(error)
    expect(operation).not.toHaveBeenCalled()
    expect(reportUnavailable).toHaveBeenCalledExactlyOnceWith(error.code)
  })

  it('preserves repository errors without hiding or retrying them', async () => {
    const error = new Error('repository failed')
    const reportUnavailable = vi.fn()
    const gate = new PersistenceOperationGateService({
      bootstrap: { ready: async () => undefined },
      coordination: {
        runExclusive: async (op) => op(),
        runShared: async (op) => op(),
      },
      recovery: { reportUnavailable },
    })
    await expect(
      gate.runIndexedDbRead(async () => {
        throw error
      }),
    ).rejects.toBe(error)
    expect(reportUnavailable).not.toHaveBeenCalled()
  })
})
