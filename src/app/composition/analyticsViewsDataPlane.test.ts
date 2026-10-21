import { describe, expect, it, vi } from 'vitest' // eslint-disable-line

import type { PersistenceLogicalSnapshot } from '@/contexts/saved-tabs/application/ports/PersistenceV2SnapshotReaderPort'

import { createIndexedDbAnalyticsViewsDataPlane } from './analyticsViewsDataPlane'

describe('analyticsViewsDataPlane', () => {
  it('reads values and atomically replaces changed IndexedDB records', async () => {
    const keep = { id: 'keep', name: 'Keep', updatedAt: 1 }
    const remove = { id: 'remove', name: 'Remove', updatedAt: 2 }
    const snapshot: PersistenceLogicalSnapshot = {
      analyticsViews: [
        { id: keep.id, updatedAt: keep.updatedAt, value: keep },
        { id: remove.id, updatedAt: remove.updatedAt, value: remove },
      ],
      conversations: [],
      messages: [],
      revision: 7,
      savedTabs: {
        categories: [],
        collections: [],
        groups: [],
        memberships: [],
        urls: [],
      },
    }
    const readConsistentSnapshot = vi.fn(async () => snapshot)
    const commit = vi.fn(async () => ({
      changedScopes: ['analyticsViews'] as const,
      revision: 8,
    }))
    const dataPlane = createIndexedDbAnalyticsViewsDataPlane({
      reader: { readConsistentSnapshot },
      unitOfWork: { commit },
    })

    await expect(dataPlane.readValues()).resolves.toEqual([keep, remove])
    const add = { id: 'add', name: 'Add', updatedAt: 3 }
    await dataPlane.replaceValues([keep, add])

    expect(commit).toHaveBeenCalledWith(
      {
        analyticsViews: {
          delete: ['remove'],
          put: [{ id: 'add', updatedAt: 3, value: add }],
        },
      },
      { expectedRevision: 7 },
    )
  })

  it('skips an unchanged IndexedDB replacement', async () => {
    const value = { id: 'view-1', name: 'View', updatedAt: 1 }
    const readConsistentSnapshot = vi.fn(async () => ({
      analyticsViews: [{ id: value.id, updatedAt: value.updatedAt, value }],
      conversations: [],
      messages: [],
      revision: 1,
      savedTabs: {
        categories: [],
        collections: [],
        groups: [],
        memberships: [],
        urls: [],
      },
    }))
    const commit = vi.fn()
    const dataPlane = createIndexedDbAnalyticsViewsDataPlane({
      reader: { readConsistentSnapshot },
      unitOfWork: { commit },
    })

    await dataPlane.replaceValues([value])

    expect(commit).not.toHaveBeenCalled()
  })

  it('rejects invalid or duplicate IndexedDB values before commit', async () => {
    const readConsistentSnapshot = vi.fn(async () => ({
      analyticsViews: [],
      conversations: [],
      messages: [],
      revision: 1,
      savedTabs: {
        categories: [],
        collections: [],
        groups: [],
        memberships: [],
        urls: [],
      },
    }))
    const commit = vi.fn()
    const dataPlane = createIndexedDbAnalyticsViewsDataPlane({
      reader: { readConsistentSnapshot },
      unitOfWork: { commit },
    })

    await expect(dataPlane.replaceValues([{ id: 'invalid' }])).rejects.toThrow(
      'not a valid persistence record',
    )
    await expect(
      dataPlane.replaceValues([
        { id: 'duplicate', updatedAt: 1 },
        { id: 'duplicate', updatedAt: 2 },
      ]),
    ).rejects.toThrow('IDs must be unique')
    expect(commit).not.toHaveBeenCalled()
  })
})
