import { describe, expect, it, vi } from 'vitest' // eslint-disable-line

import type {
  PersistenceDataPlaneOperation,
  PersistenceDataPlaneRouterPort,
  PersistenceRoute,
} from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'
import type { PersistenceLogicalSnapshot } from '@/contexts/saved-tabs/application/ports/PersistenceV2SnapshotReaderPort'

import type { AiConversationHistoryDataPlane } from './aiConversationHistoryDataPlane'
import {
  createIndexedDbAiConversationHistoryDataPlane,
  createLegacyAiConversationHistoryDataPlane,
  createRouteAwareAiConversationHistoryDataPlane,
} from './aiConversationHistoryDataPlane'

const createRouter = (
  route: PersistenceRoute,
): PersistenceDataPlaneRouterPort => ({
  read: async <Result>(operation: PersistenceDataPlaneOperation<Result>) =>
    operation[route](),
  write: async <Result>(operation: PersistenceDataPlaneOperation<Result>) =>
    operation[route](),
})

const createPlane = (label: string) => {
  const read = vi.fn(async () => ({
    activeConversationId: label,
    conversations: [{ id: label }],
  }))
  const replace = vi.fn(async () => {})
  return {
    plane: { read, replace } satisfies AiConversationHistoryDataPlane,
    read,
    replace,
  }
}

const emptySavedTabs = {
  categories: [],
  collections: [],
  groups: [],
  memberships: [],
  urls: [],
}

const createSnapshot = (): PersistenceLogicalSnapshot => ({
  analyticsViews: [],
  conversations: [
    {
      id: 'conversation-1',
      updatedAt: 20,
      value: { createdAt: 10, title: 'Existing' },
    },
  ],
  messages: [
    {
      conversationId: 'conversation-1',
      createdAt: 10,
      id: 'message-1',
      value: { content: 'Hello', id: 'message-1', role: 'user' },
    },
  ],
  revision: 7,
  savedTabs: emptySavedTabs,
})

describe('aiConversationHistoryDataPlane', () => {
  it.each(['indexeddb', 'legacy'] satisfies PersistenceRoute[])(
    '%s routeだけでreadとreplaceを完結する',
    async (route) => {
      const indexeddb = createPlane('indexeddb')
      const legacy = createPlane('legacy')
      const dataPlane = createRouteAwareAiConversationHistoryDataPlane({
        indexeddb: indexeddb.plane,
        legacy: legacy.plane,
        router: createRouter(route),
      })

      await expect(dataPlane.read()).resolves.toMatchObject({
        activeConversationId: route,
      })
      const next = { activeConversationId: 'next', conversations: [] }
      await dataPlane.replace(next)

      const selected = route === 'indexeddb' ? indexeddb : legacy
      const unselected = route === 'indexeddb' ? legacy : indexeddb
      expect(selected.read).toHaveBeenCalledOnce()
      expect(selected.replace).toHaveBeenCalledWith(next)
      expect(unselected.read).not.toHaveBeenCalled()
      expect(unselected.replace).not.toHaveBeenCalled()
    },
  )

  it('IndexedDB recordsとChrome selectionから会話を復元する', async () => {
    const dataPlane = createIndexedDbAiConversationHistoryDataPlane({
      reader: { readConsistentSnapshot: async () => createSnapshot() },
      selectionStorage: {
        get: async () => ({ activeAiChatConversationId: 'conversation-1' }),
        set: async () => {},
      },
      unitOfWork: { commit: vi.fn() },
    })

    await expect(dataPlane.read()).resolves.toEqual({
      activeConversationId: 'conversation-1',
      conversations: [
        {
          createdAt: 10,
          id: 'conversation-1',
          messages: [{ content: 'Hello', id: 'message-1', role: 'user' }],
          title: 'Existing',
          updatedAt: 20,
        },
      ],
    })
  })

  it('IndexedDB会話とmessageを一つのrevision guarded commitで置換する', async () => {
    const commit = vi.fn(async () => ({
      changedScopes: ['conversations'] as const,
      revision: 8,
    }))
    const selectionStorage = {
      get: vi.fn(async () => ({})),
      set: vi.fn(async () => {}),
    }
    const dataPlane = createIndexedDbAiConversationHistoryDataPlane({
      reader: { readConsistentSnapshot: async () => createSnapshot() },
      selectionStorage,
      unitOfWork: { commit },
    })

    await dataPlane.replace({
      activeConversationId: 'conversation-2',
      conversations: [
        {
          createdAt: 30,
          id: 'conversation-2',
          messages: [
            { content: 'First', id: 'message-2', role: 'user' },
            { content: 'Second', id: 'message-3', role: 'assistant' },
          ],
          title: 'Next',
          updatedAt: 40,
        },
      ],
    })

    expect(commit).toHaveBeenCalledWith(
      {
        conversations: {
          delete: ['conversation-1'],
          put: [
            {
              id: 'conversation-2',
              updatedAt: 40,
              value: { createdAt: 30, title: 'Next' },
            },
          ],
        },
        messages: {
          delete: ['message-1'],
          put: [
            {
              conversationId: 'conversation-2',
              createdAt: 30,
              id: 'message-2',
              value: { content: 'First', id: 'message-2', role: 'user' },
            },
            {
              conversationId: 'conversation-2',
              createdAt: 31,
              id: 'message-3',
              value: {
                content: 'Second',
                id: 'message-3',
                role: 'assistant',
              },
            },
          ],
        },
      },
      { expectedRevision: 7 },
    )
    expect(selectionStorage.set).toHaveBeenCalledWith({
      activeAiChatConversationId: 'conversation-2',
    })
  })

  it('Chrome Storageと同様にmessageのoptional undefined fieldを省略する', async () => {
    const commit = vi.fn(async () => ({
      changedScopes: ['conversations'] as const,
      revision: 8,
    }))
    const dataPlane = createIndexedDbAiConversationHistoryDataPlane({
      reader: { readConsistentSnapshot: async () => createSnapshot() },
      selectionStorage: {
        get: vi.fn(async () => ({})),
        set: vi.fn(async () => {}),
      },
      unitOfWork: { commit },
    })

    await dataPlane.replace({
      activeConversationId: 'conversation-2',
      conversations: [
        {
          createdAt: 30,
          id: 'conversation-2',
          messages: [
            {
              content: 'Answer',
              id: 'message-2',
              reasoning: undefined,
              role: 'assistant',
            },
          ],
          title: 'Next',
          updatedAt: 40,
        },
      ],
    })

    expect(commit).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.objectContaining({
          put: [
            expect.objectContaining({
              value: {
                content: 'Answer',
                id: 'message-2',
                role: 'assistant',
              },
            }),
          ],
        }),
      }),
      { expectedRevision: 7 },
    )
  })

  it('不正または重複した会話をcommit前に拒否する', async () => {
    const commit = vi.fn()
    const dataPlane = createIndexedDbAiConversationHistoryDataPlane({
      reader: { readConsistentSnapshot: async () => createSnapshot() },
      selectionStorage: {
        get: async () => ({}),
        set: async () => {},
      },
      unitOfWork: { commit },
    })

    await expect(
      dataPlane.replace({
        activeConversationId: '',
        conversations: [{ id: 'invalid' }],
      }),
    ).rejects.toThrow('not JSON-safe or valid')
    await expect(
      dataPlane.replace({
        activeConversationId: 'duplicate',
        conversations: [
          {
            createdAt: 1,
            id: 'duplicate',
            messages: [],
            title: 'A',
            updatedAt: 1,
          },
          {
            createdAt: 2,
            id: 'duplicate',
            messages: [],
            title: 'B',
            updatedAt: 2,
          },
        ],
      }),
    ).rejects.toThrow('IDs must be unique')
    expect(commit).not.toHaveBeenCalled()
  })

  it('legacy historyを同じ二つのChrome keyでround-tripする', async () => {
    const state: Record<string, unknown> = { aiChatConversations: 'invalid' }
    const storage = {
      get: vi.fn(async (keys: string | readonly string[]) => {
        const selected = typeof keys === 'string' ? [keys] : keys
        return Object.fromEntries(selected.map((key) => [key, state[key]]))
      }),
      set: vi.fn(async (values: Record<string, unknown>) => {
        Object.assign(state, values)
      }),
    }
    const dataPlane = createLegacyAiConversationHistoryDataPlane(() => storage)

    await expect(dataPlane.read()).resolves.toEqual({
      activeConversationId: undefined,
      conversations: [],
    })
    const next = {
      activeConversationId: 'conversation-1',
      conversations: [{ id: 'conversation-1' }],
    }
    await dataPlane.replace(next)
    await expect(dataPlane.read()).resolves.toEqual(next)
  })
})
