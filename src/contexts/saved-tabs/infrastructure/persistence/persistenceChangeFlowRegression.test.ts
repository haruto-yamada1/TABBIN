import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it, vi } from 'vitest'

import { createPersistenceInvalidationCoordinator } from '@/contexts/saved-tabs/application/services/PersistenceInvalidationCoordinatorService'
import { createPersistenceMutationCoordinator } from '@/contexts/saved-tabs/application/services/PersistenceMutationCoordinatorService'
import type {
  BroadcastChannelFactory,
  BroadcastChannelMessageEventLike,
} from '@/contexts/saved-tabs/infrastructure/browser/BroadcastChannelPersistenceChangeAdapter'
import { createBroadcastChannelPersistenceChangeAdapter } from '@/contexts/saved-tabs/infrastructure/browser/BroadcastChannelPersistenceChangeAdapter'

import { IndexedDbConnectionManager } from './indexed-db/IndexedDbConnectionManager'
import { IndexedDbPersistenceSnapshotReader } from './indexed-db/IndexedDbPersistenceSnapshotReader'
import { IndexedDbPersistenceUnitOfWork } from './indexed-db/IndexedDbPersistenceUnitOfWork'
import { IndexedDbSavedTabsQueryAdapter } from './indexed-db/IndexedDbSavedTabsQueryAdapter'

type MessageListener = (event: BroadcastChannelMessageEventLike) => void

type InMemoryChannel = {
  readonly listeners: Set<MessageListener>
  readonly name: string
}

class InMemoryBroadcastChannelBus {
  private readonly channels = new Set<InMemoryChannel>()
  private dropNextMessage = false
  readonly postedMessages: unknown[] = []

  readonly factory: BroadcastChannelFactory = (name) => {
    const channel: InMemoryChannel = { listeners: new Set(), name }
    this.channels.add(channel)

    return {
      addEventListener: (_type, listener) => channel.listeners.add(listener),
      close: () => {
        channel.listeners.clear()
        this.channels.delete(channel)
      },
      postMessage: (message) => {
        this.postedMessages.push(structuredClone(message))
        if (this.dropNextMessage) {
          this.dropNextMessage = false
          return
        }

        for (const target of this.channels) {
          if (target === channel || target.name !== name) {
            continue
          }
          const deliveredMessage = structuredClone(message)
          setTimeout(() => {
            for (const listener of target.listeners) {
              listener({ data: deliveredMessage })
            }
          }, 0)
        }
      },
      removeEventListener: (_type, listener) =>
        channel.listeners.delete(listener),
    }
  }

  dropNextPublication(): void {
    this.dropNextMessage = true
  }
}

const url = {
  firstSavedAt: 1,
  id: 'url-1',
  lastSavedAt: 1,
  normalizedUrl: 'https://private.example.com/path',
  title: 'Private title',
  updatedAt: 1,
  url: 'https://private.example.com/path',
}

const collection = {
  createdAt: 1,
  definition: { domain: 'private.example.com', type: 'domain' as const },
  id: 'collection-1',
  name: 'Private collection',
  sortOrder: 1024,
  updatedAt: 1,
}

const membership = {
  addedAt: 1,
  collectionId: collection.id,
  sortOrder: 1024,
  updatedAt: 1,
  urlId: url.id,
}

const group = {
  createdAt: 2,
  id: 'group-1',
  name: 'Restarted writer group',
  sortOrder: 1024,
  updatedAt: 2,
}

const createWritePlan = () => ({
  collections: { put: [collection] },
  memberships: { put: [membership] },
  urls: { put: [url] },
})

describe('persistence change flow regression', () => {
  it('background commit後にopen Saved Tabsがcurrent projectionを再取得する', async () => {
    const indexedDb = new IDBFactory()
    const pageManager = new IndexedDbConnectionManager({
      databaseName: 'persistence-change-flow',
      indexedDb,
    })
    const writerManager = new IndexedDbConnectionManager({
      databaseName: 'persistence-change-flow',
      indexedDb,
    })
    const pageUnitOfWork = new IndexedDbPersistenceUnitOfWork(pageManager)
    const writerUnitOfWork = new IndexedDbPersistenceUnitOfWork(writerManager)
    const query = new IndexedDbSavedTabsQueryAdapter(
      new IndexedDbPersistenceSnapshotReader(pageManager),
    )
    const bus = new InMemoryBroadcastChannelBus()
    const pageChanges = createBroadcastChannelPersistenceChangeAdapter({
      channelFactory: bus.factory,
    })
    const backgroundChanges = createBroadcastChannelPersistenceChangeAdapter({
      channelFactory: bus.factory,
    })
    const applied = [] as Awaited<ReturnType<typeof query.readInitialLoad>>[]
    const page = createPersistenceInvalidationCoordinator({
      apply: (projection) => {
        applied.push(projection)
      },
      changePort: pageChanges,
      query: async () => query.readInitialLoad(),
      readCurrentRevision: async () => pageUnitOfWork.readRevision(),
      relevantScopes: new Set([
        'categories',
        'collections',
        'groups',
        'memberships',
        'urls',
      ]),
    })
    const background = createPersistenceMutationCoordinator({
      changePort: backgroundChanges,
      idGenerator: { generate: () => 'change-1' },
      unitOfWork: writerUnitOfWork,
    })

    try {
      await page.start()
      const outcome = await background.commit(createWritePlan())
      await vi.waitFor(() => expect(applied.at(-1)?.revision).toBe(1), {
        timeout: 1_000,
      })

      expect(outcome).toMatchObject({
        commitResult: {
          changedScopes: ['collections', 'memberships', 'urls'],
          revision: 1,
        },
        kind: 'committed_and_published',
      })
      expect(applied).toEqual([
        { collections: [], groups: [], revision: 0 },
        {
          collections: [
            {
              collection,
              items: [{ category: undefined, membership, url }],
            },
          ],
          groups: [],
          revision: 1,
        },
      ])
      expect(bus.postedMessages).toEqual([
        {
          changeId: 'change-1',
          revision: 1,
          scopes: ['collections', 'memberships', 'urls'],
        },
      ])
      expect(Object.keys(bus.postedMessages[0] as object).toSorted()).toEqual([
        'changeId',
        'revision',
        'scopes',
      ])
      const serializedEvent = JSON.stringify(bus.postedMessages[0])
      expect(serializedEvent).not.toContain(url.url)
      expect(serializedEvent).not.toContain(url.title)
      expect(serializedEvent).not.toContain(collection.name)
      expect(serializedEvent).not.toContain('notes')
      expect(serializedEvent).not.toContain('prompt')
      expect(serializedEvent).not.toContain('attachment')
    } finally {
      page.dispose()
      pageManager.close()
      writerManager.close()
    }
  })

  it('transaction abortではeventをpublishせずrevisionも進めない', async () => {
    const manager = new IndexedDbConnectionManager({
      databaseName: 'persistence-change-abort',
      indexedDb: new IDBFactory(),
    })
    const unitOfWork = new IndexedDbPersistenceUnitOfWork(manager)
    const bus = new InMemoryBroadcastChannelBus()
    const background = createPersistenceMutationCoordinator({
      changePort: createBroadcastChannelPersistenceChangeAdapter({
        channelFactory: bus.factory,
      }),
      idGenerator: { generate: () => 'must-not-be-generated' },
      unitOfWork,
    })
    const conflictingCollection = {
      ...collection,
      id: 'collection-2',
      name: 'Conflicting collection',
    }

    try {
      await expect(
        background.commit({
          collections: { put: [collection, conflictingCollection] },
          urls: { put: [url] },
        }),
      ).rejects.toMatchObject({ name: 'ConstraintError' })

      expect(bus.postedMessages).toEqual([])
      await expect(unitOfWork.readRevision()).resolves.toBe(0)
      await expect(
        new IndexedDbPersistenceSnapshotReader(
          manager,
        ).readVerifiedSavedTabsSnapshot(),
      ).resolves.toMatchObject({
        revision: 0,
        savedTabs: { collections: [], urls: [] },
      })
    } finally {
      manager.close()
    }
  })

  it('event欠落とwriter restart後もcurrent revision checkで収束する', async () => {
    const indexedDb = new IDBFactory()
    const pageManager = new IndexedDbConnectionManager({
      databaseName: 'persistence-change-restart',
      indexedDb,
    })
    let writerManager = new IndexedDbConnectionManager({
      databaseName: 'persistence-change-restart',
      indexedDb,
    })
    const pageUnitOfWork = new IndexedDbPersistenceUnitOfWork(pageManager)
    let writerUnitOfWork = new IndexedDbPersistenceUnitOfWork(writerManager)
    const query = new IndexedDbSavedTabsQueryAdapter(
      new IndexedDbPersistenceSnapshotReader(pageManager),
    )
    const bus = new InMemoryBroadcastChannelBus()
    const pageChanges = createBroadcastChannelPersistenceChangeAdapter({
      channelFactory: bus.factory,
    })
    const applied = [] as Awaited<ReturnType<typeof query.readInitialLoad>>[]
    const page = createPersistenceInvalidationCoordinator({
      apply: (projection) => {
        applied.push(projection)
      },
      changePort: pageChanges,
      query: async () => query.readInitialLoad(),
      readCurrentRevision: async () => pageUnitOfWork.readRevision(),
      relevantScopes: new Set([
        'categories',
        'collections',
        'groups',
        'memberships',
        'urls',
      ]),
    })
    const createWriter = (changeId: string) =>
      createPersistenceMutationCoordinator({
        changePort: createBroadcastChannelPersistenceChangeAdapter({
          channelFactory: bus.factory,
        }),
        idGenerator: { generate: () => changeId },
        unitOfWork: writerUnitOfWork,
      })

    try {
      await page.start()
      bus.dropNextPublication()
      const stoppedWriter = createWriter('change-before-restart')
      await stoppedWriter.commit(createWritePlan())

      expect(applied.map(({ revision }) => revision)).toEqual([0])
      expect(bus.postedMessages).toHaveLength(1)

      writerManager.close()
      writerManager = new IndexedDbConnectionManager({
        databaseName: 'persistence-change-restart',
        indexedDb,
      })
      writerUnitOfWork = new IndexedDbPersistenceUnitOfWork(writerManager)
      const restartedWriter = createWriter('change-after-restart')
      await page.checkCurrentRevision()

      expect(applied.map(({ revision }) => revision)).toEqual([0, 1])
      expect(applied.at(-1)?.collections[0]).toEqual({
        collection,
        items: [{ category: undefined, membership, url }],
      })
      expect(bus.postedMessages).toHaveLength(1)

      await restartedWriter.commit({ groups: { put: [group] } })
      await vi.waitFor(() => expect(applied.at(-1)?.revision).toBe(2), {
        timeout: 1_000,
      })

      expect(applied.at(-1)).toMatchObject({ groups: [group], revision: 2 })
      expect(bus.postedMessages).toHaveLength(2)
    } finally {
      page.dispose()
      pageManager.close()
      writerManager.close()
    }
  })
})
