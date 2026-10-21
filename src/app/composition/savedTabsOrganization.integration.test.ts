import { IDBFactory } from 'fake-indexeddb'
import { assert, describe, expect, it, vi } from 'vitest'

import { createPersistenceMutationCoordinator } from '@/contexts/saved-tabs/application/services/PersistenceMutationCoordinatorService'
import { createSavedTabsOrganizationService } from '@/contexts/saved-tabs/application/services/SavedTabsOrganizationService'
import { createReadyPersistenceOperationGateStub } from '@/contexts/saved-tabs/application/testing/PersistenceOperationGateStub'
import type { PersistenceV2Snapshot } from '@/contexts/saved-tabs/domain/entities/PersistenceModelV2'
import { IndexedDbConnectionManager } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbConnectionManager'
import { IndexedDbPersistenceSnapshotReader } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceSnapshotReader'
import { IndexedDbPersistenceUnitOfWork } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceUnitOfWork'

const createFixture = async () => {
  const manager = new IndexedDbConnectionManager({
    indexedDb: new IDBFactory(),
  })
  const gate = createReadyPersistenceOperationGateStub()
  const unitOfWork = new IndexedDbPersistenceUnitOfWork(manager, gate)
  const reader = new IndexedDbPersistenceSnapshotReader(manager, gate)
  const snapshot: PersistenceV2Snapshot = {
    categories: [
      {
        collectionId: 'project-a',
        createdAt: 1,
        id: 'category-a',
        keywords: ['keyword'],
        name: 'Category',
        sortOrder: 1024,
        updatedAt: 1,
      },
    ],
    collections: ['project-a', 'project-b'].map((id, index) => ({
      createdAt: 1,
      definition: {
        projectKeywords: {
          domainKeywords: [],
          titleKeywords: [],
          urlKeywords: [],
        },
        type: 'custom',
      },
      id,
      name: id,
      sortOrder: index * 1024,
      updatedAt: 1,
    })),
    groups: [],
    memberships: ['url-a', 'url-b'].map((urlId, index) => ({
      addedAt: 1,
      addedAtProvenance: 'exact',
      collectionId: 'project-a',
      notes: 'keep notes',
      sortOrder: index * 1024,
      updatedAt: 1,
      urlId,
    })),
    urls: ['url-a', 'url-b'].map((id) => ({
      firstSavedAt: 1,
      firstSavedAtProvenance: 'exact',
      id,
      lastSavedAt: 1,
      lastSavedAtProvenance: 'exact',
      normalizedUrl: `https://${id}.example.com/`,
      title: id,
      updatedAt: 1,
      url: `https://${id}.example.com/`,
    })),
  }
  await unitOfWork.commit({
    categories: { put: snapshot.categories },
    collections: { put: snapshot.collections },
    memberships: { put: snapshot.memberships },
    urls: { put: snapshot.urls },
  })
  let timestamp = 10
  let identifier = 0
  const publish = vi.fn(async () => {})
  const coordinator = createPersistenceMutationCoordinator({
    changePort: { publish, subscribe: () => () => {} },
    idGenerator: { generate: () => '11111111-1111-4111-8111-111111111111' },
    unitOfWork,
  })
  const commit = vi.spyOn(coordinator, 'commit')
  const service = createSavedTabsOrganizationService({
    clock: { now: () => timestamp },
    idGenerator: { generate: () => `new-${++identifier}` },
    mutationCoordinator: coordinator,
    snapshotReader: reader,
  })
  return {
    commit,
    manager,
    publish,
    reader,
    service,
    setTime: (value: number) => {
      timestamp = value
    },
    snapshot,
    unitOfWork,
  }
}

describe('SavedTabsOrganizationService', () => {
  it.each([
    { kind: 'delete_urls', urlIds: [] },
    { kind: 'delete_urls', urlIds: ['url-a', 'url-a'] },
    { kind: 'delete_urls', urlIds: ['missing'] },
    { kind: 'delete_urls', urlIds: ['url-a'], confirmed: true },
    { kind: 'create_project', name: 'project-a' },
    {
      kind: 'set_category',
      projectId: 'project-b',
      categoryId: 'category-a',
      urlIds: ['url-a'],
    },
    {
      kind: 'set_category',
      projectId: 'project-a',
      categoryId: null,
      urlIds: ['url-a'],
    },
    {
      kind: 'move_urls',
      sourceProjectId: 'project-a',
      targetProjectId: 'project-a',
      urlIds: ['url-a'],
    },
    {
      kind: 'move_urls',
      sourceProjectId: 'missing',
      targetProjectId: 'project-b',
      urlIds: ['url-a'],
    },
    {
      kind: 'move_urls',
      sourceProjectId: 'project-b',
      targetProjectId: 'project-a',
      urlIds: ['url-a'],
    },
  ])(
    'rejects invalid, mismatched, or unchanged targets without writing: $kind',
    async (proposal) => {
      const { service, reader, commit, manager } = await createFixture()
      const before = await reader.readVerifiedSavedTabsSnapshot()
      await expect(service.preview(proposal)).rejects.toMatchObject({
        name: 'SavedTabsOrganizationError',
      })
      expect(commit).not.toHaveBeenCalled()
      expect(await reader.readVerifiedSavedTabsSnapshot()).toEqual(before)
      manager.close()
    },
  )

  it('rejects stale approvals and never overwrites the intervening write', async () => {
    const { service, reader, unitOfWork, snapshot, manager } =
      await createFixture()
    const preview = await service.preview({
      kind: 'delete_urls',
      urlIds: ['url-a'],
    })
    assert.isDefined(snapshot.urls[0])
    await unitOfWork.commit({
      urls: { put: [{ ...snapshot.urls[0], title: 'Later save' }] },
    })
    const before = await reader.readVerifiedSavedTabsSnapshot()
    await expect(service.execute(preview.id)).rejects.toMatchObject({
      code: 'STALE_PREVIEW',
    })
    expect(await reader.readVerifiedSavedTabsSnapshot()).toEqual(before)
    manager.close()
  })

  it('guards single-use approval and concurrent Undo', async () => {
    const { service, reader, commit, manager } = await createFixture()
    const preview = await service.preview({
      kind: 'delete_urls',
      urlIds: ['url-a'],
    })
    const [first, second] = await Promise.allSettled([
      service.execute(preview.id),
      service.execute(preview.id),
    ])
    if (first.status !== 'fulfilled') {
      throw new Error('The first approval must commit')
    }
    assert.equal(second.status, 'rejected')
    expect(commit).toHaveBeenCalledOnce()
    const after = await reader.readVerifiedSavedTabsSnapshot()
    const [undo, duplicateUndo] = await Promise.allSettled([
      service.undo(first.value.undoId),
      service.undo(first.value.undoId),
    ])
    expect(undo.status).toBe('fulfilled')
    expect(duplicateUndo.status).toBe('rejected')
    expect((await reader.readVerifiedSavedTabsSnapshot()).revision).toBe(
      after.revision + 1,
    )
    await expect(service.undo(first.value.undoId)).rejects.toMatchObject({
      code: 'UNDO_UNAVAILABLE',
    })
    manager.close()
  })

  it('protects later membership edits and populated projects during Undo', async () => {
    const { service, reader, unitOfWork, snapshot, manager } =
      await createFixture()
    const preview = await service.preview({
      kind: 'create_project',
      name: 'New',
    })
    const { undoId } = await service.execute(preview.id)
    const projectId = preview.targets[0]?.id
    assert.isDefined(projectId)
    assert.isDefined(snapshot.memberships[0])
    await unitOfWork.commit({
      memberships: {
        put: [{ ...snapshot.memberships[0], collectionId: projectId }],
      },
    })
    const before = await reader.readVerifiedSavedTabsSnapshot()
    await expect(service.undo(undoId)).rejects.toMatchObject({
      code: 'UNDO_CONFLICT',
    })
    expect(await reader.readVerifiedSavedTabsSnapshot()).toEqual(before)
    const move = await service.preview({
      kind: 'move_urls',
      sourceProjectId: 'project-a',
      targetProjectId: 'project-b',
      urlIds: ['url-b'],
    })
    const moved = await service.execute(move.id)
    const membership = (
      await reader.readVerifiedSavedTabsSnapshot()
    ).savedTabs.memberships.find((value) => value.collectionId === 'project-b')
    assert.isDefined(membership)
    await unitOfWork.commit({
      memberships: { put: [{ ...membership, notes: 'Later edit' }] },
    })
    const edited = await reader.readVerifiedSavedTabsSnapshot()
    await expect(service.undo(moved.undoId)).rejects.toMatchObject({
      code: 'UNDO_CONFLICT',
    })
    expect(await reader.readVerifiedSavedTabsSnapshot()).toEqual(edited)
    manager.close()
  })

  it('expires approvals and Undo after 30 minutes without writing', async () => {
    const { service, reader, setTime, commit, manager } = await createFixture()
    const preview = await service.preview({
      kind: 'create_project',
      name: 'Expired',
    })
    setTime(preview.expiresAt)
    await expect(service.execute(preview.id)).rejects.toMatchObject({
      code: 'PREVIEW_UNAVAILABLE',
    })
    expect(commit).not.toHaveBeenCalled()
    const next = await service.preview({
      kind: 'delete_urls',
      urlIds: ['url-a'],
    })
    const result = await service.execute(next.id)
    const before = await reader.readVerifiedSavedTabsSnapshot()
    setTime(next.expiresAt)
    await expect(service.undo(result.undoId)).rejects.toMatchObject({
      code: 'UNDO_UNAVAILABLE',
    })
    expect(await reader.readVerifiedSavedTabsSnapshot()).toEqual(before)
    manager.close()
  })

  it('returns saved partial success and usable Undo when change publication fails', async () => {
    const { service, reader, publish, snapshot, manager } =
      await createFixture()
    publish.mockRejectedValue(new Error('Notification failed'))
    const preview = await service.preview({
      kind: 'delete_urls',
      urlIds: ['url-a'],
    })
    const result = await service.execute(preview.id)
    expect(result.notificationFailed).toBe(true)
    expect(
      (await reader.readVerifiedSavedTabsSnapshot()).savedTabs.urls,
    ).toHaveLength(1)
    expect((await service.undo(result.undoId)).notificationFailed).toBe(true)
    expect((await reader.readVerifiedSavedTabsSnapshot()).savedTabs).toEqual(
      snapshot,
    )
    manager.close()
  })

  it('reads the canonical catalog without committing and fails closed if it cannot be verified', async () => {
    const { service, reader, commit, manager } = await createFixture()
    expect(await service.readCatalog()).toMatchObject({
      memberships: [
        expect.objectContaining({ projectId: 'project-a', urlId: 'url-a' }),
        expect.objectContaining({ projectId: 'project-a', urlId: 'url-b' }),
      ],
      projects: [
        expect.objectContaining({
          id: 'project-a',
          categories: [{ id: 'category-a', name: 'Category' }],
        }),
        expect.objectContaining({ id: 'project-b' }),
      ],
    })
    expect(commit).not.toHaveBeenCalled()
    vi.spyOn(reader, 'readVerifiedSavedTabsSnapshot').mockRejectedValue(
      new Error('Integrity error'),
    )
    await expect(service.readCatalog()).rejects.toMatchObject({
      code: 'INTEGRITY_ERROR',
    })
    manager.close()
  })

  it('rejects a move into an existing membership rather than losing source metadata', async () => {
    const { service, unitOfWork, snapshot, manager } = await createFixture()
    assert.isDefined(snapshot.memberships[0])
    await unitOfWork.commit({
      memberships: {
        put: [
          {
            ...snapshot.memberships[0],
            collectionId: 'project-b',
            notes: 'target notes',
          },
        ],
      },
    })
    await expect(
      service.preview({
        kind: 'move_urls',
        sourceProjectId: 'project-a',
        targetProjectId: 'project-b',
        urlIds: ['url-a'],
      }),
    ).rejects.toMatchObject({ code: 'INVALID_PROPOSAL' })
    manager.close()
  })

  it('keeps the undo token usable after a transaction failure', async () => {
    const { service, commit, reader, snapshot, manager } = await createFixture()
    const preview = await service.preview({
      kind: 'delete_urls',
      urlIds: ['url-a'],
    })
    const { undoId } = await service.execute(preview.id)
    commit.mockRejectedValueOnce(new Error('transaction aborted'))
    await expect(service.undo(undoId)).rejects.toMatchObject({
      code: 'COMMIT_FAILED',
    })
    await service.undo(undoId)
    expect((await reader.readVerifiedSavedTabsSnapshot()).savedTabs).toEqual(
      snapshot,
    )
    manager.close()
  })

  it('retains all unexpired undo entries and rejects new writes once the session is full', async () => {
    const { service, reader, manager } = await createFixture()
    const undoIds: string[] = []
    await Array.from({ length: 20 }, (_, index) => index).reduce(
      async (previous, i) => {
        await previous
        const preview = await service.preview({
          kind: 'create_project',
          name: `New ${i}`,
        })
        undoIds.push((await service.execute(preview.id)).undoId)
      },
      Promise.resolve(),
    )
    const before = await reader.readVerifiedSavedTabsSnapshot()
    const preview = await service.preview({
      kind: 'delete_urls',
      urlIds: ['url-a'],
    })
    await expect(service.execute(preview.id)).rejects.toMatchObject({
      code: 'SESSION_CAPACITY',
    })
    expect(await reader.readVerifiedSavedTabsSnapshot()).toEqual(before)
    assert.isDefined(undoIds[0])
    await service.undo(undoIds[0])
    expect(
      (await reader.readVerifiedSavedTabsSnapshot()).savedTabs.collections.some(
        ({ name }) => name === 'New 0',
      ),
    ).toBe(false)
    manager.close()
  })

  it('previews canonical target changes without writing and atomically commits approval', async () => {
    const { service, reader, commit, manager, snapshot } = await createFixture()
    const preview = await service.preview({
      categoryId: 'category-a',
      kind: 'set_category',
      projectId: 'project-a',
      urlIds: ['url-a'],
    })
    expect(preview.targets).toEqual([
      expect.objectContaining({
        after: expect.stringContaining('Category'),
        id: 'url-a',
        title: 'url-a',
      }),
    ])
    expect(commit).not.toHaveBeenCalled()
    const result = await service.execute(preview.id)
    expect(result.notificationFailed).toBe(false)
    expect(commit).toHaveBeenCalledOnce()
    expect(commit.mock.calls[0]?.[1]).toEqual({ expectedRevision: 1 })
    const saved = await reader.readVerifiedSavedTabsSnapshot()
    expect(saved.savedTabs.memberships[0]).toEqual({
      ...snapshot.memberships[0],
      categoryId: 'category-a',
      updatedAt: 10,
    })
    expect(saved.savedTabs.urls).toEqual(snapshot.urls)
    await service.undo(result.undoId)
    expect((await reader.readVerifiedSavedTabsSnapshot()).savedTabs).toEqual(
      snapshot,
    )
    manager.close()
  })

  it('moves only source membership, preserves canonical URLs and supports undo alongside unrelated writes', async () => {
    const { service, reader, unitOfWork, snapshot, manager } =
      await createFixture()
    const preview = await service.preview({
      kind: 'move_urls',
      sourceProjectId: 'project-a',
      targetProjectId: 'project-b',
      urlIds: ['url-a'],
    })
    const { undoId } = await service.execute(preview.id)
    assert.isDefined(snapshot.urls[1])
    await unitOfWork.commit({
      urls: { put: [{ ...snapshot.urls[1], title: 'unrelated title' }] },
    })
    await service.undo(undoId)
    const saved = (await reader.readVerifiedSavedTabsSnapshot()).savedTabs
    expect(saved.memberships).toEqual(snapshot.memberships)
    expect(saved.urls.find(({ id }) => id === 'url-b')?.title).toBe(
      'unrelated title',
    )
    manager.close()
  })

  it('deletes canonical URLs from every collection and restores all selected memberships', async () => {
    const { service, reader, unitOfWork, snapshot, manager } =
      await createFixture()
    assert.isDefined(snapshot.memberships[0])
    const extra = { ...snapshot.memberships[0], collectionId: 'project-b' }
    await unitOfWork.commit({ memberships: { put: [extra] } })
    const preview = await service.preview({
      kind: 'delete_urls',
      urlIds: ['url-a'],
    })
    expect(preview.proposal.kind).toBe('delete_urls')
    expect(preview.targets[0]?.before).toContain('project-b')
    const { undoId } = await service.execute(preview.id)
    const saved = (await reader.readVerifiedSavedTabsSnapshot()).savedTabs
    expect(saved.urls.some(({ id }) => id === 'url-a')).toBe(false)
    expect(saved.memberships.some(({ urlId }) => urlId === 'url-a')).toBe(false)
    await service.undo(undoId)
    expect(
      (await reader.readVerifiedSavedTabsSnapshot()).savedTabs.memberships,
    ).toEqual([...snapshot.memberships, extra])
    manager.close()
  })

  it('creates an empty project with a unique trimmed name and undoes it', async () => {
    const { service, reader, snapshot, manager } = await createFixture()
    const preview = await service.preview({
      kind: 'create_project',
      name: ' New project ',
    })
    const { undoId } = await service.execute(preview.id)
    const saved = (await reader.readVerifiedSavedTabsSnapshot()).savedTabs
    expect(
      saved.collections.find(({ name }) => name === 'New project'),
    ).toEqual(expect.objectContaining({ sortOrder: 2048 }))
    expect(saved.urls).toEqual(snapshot.urls)
    await service.undo(undoId)
    expect((await reader.readVerifiedSavedTabsSnapshot()).savedTabs).toEqual(
      snapshot,
    )
    manager.close()
  })
})
