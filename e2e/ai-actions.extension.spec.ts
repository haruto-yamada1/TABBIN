import type { Worker } from '@playwright/test'

import {
  createCustomCollectionFixture,
  createExamplePersistenceFixture,
  createMembershipFixture,
  createUrlFixture,
} from '@/test/fixtures/persistenceBrowserFixtures'

import {
  createBaseSeed,
  expect,
  getExtensionUrl,
  readPersistenceV2SavedTabsSnapshot,
  seedSavedTabsFixture,
  test,
} from './helpers/extension'

const sourceProjectId = 'project-inbox'
const targetProjectId = 'project-research'
const movedUrlId = 'url-example'
const deletedUrlId = 'url-delete'
const conversationId = 'conversation-organization'

const createOrganizationSeed = () => {
  const now = Date.now()
  const persistence = createExamplePersistenceFixture(now)
  return {
    persistence: {
      ...persistence,
      collections: [
        ...persistence.collections,
        createCustomCollectionFixture(sourceProjectId, 'Inbox', now),
        createCustomCollectionFixture(targetProjectId, 'Research', now, 1024),
      ],
      memberships: [
        ...persistence.memberships,
        createMembershipFixture(sourceProjectId, movedUrlId, now),
        createMembershipFixture('group-example', deletedUrlId, now, 1024),
        createMembershipFixture(sourceProjectId, deletedUrlId, now, 1024),
      ],
      urls: [
        ...persistence.urls,
        createUrlFixture(
          deletedUrlId,
          'https://example.com/obsolete',
          'Obsolete reference',
          now,
        ),
      ],
    },
    storage: createBaseSeed({
      activeAiChatConversationId: conversationId,
      viewMode: 'custom',
    }),
  }
}

// Seed the persisted assistant result, leaving all organization operations on
// the production UI and IndexedDB paths without requiring an Ollama server.
const seedOrganizationConversation = async (serviceWorker: Worker) => {
  const now = Date.now()
  const message = {
    content: 'Review these proposed changes before applying them.',
    id: 'message-organization',
    role: 'assistant',
    toolTraces: [
      {
        input: {
          kind: 'move_urls',
          sourceProjectId,
          targetProjectId,
          urlIds: [movedUrlId],
        },
        output: {
          proposal: {
            kind: 'move_urls',
            sourceProjectId,
            targetProjectId,
            urlIds: [movedUrlId],
          },
        },
        state: 'output-available',
        title: 'Propose saved tabs action',
        toolCallId: 'proposal-move',
        toolName: 'proposeSavedTabsAction',
        type: 'dynamic-tool',
      },
      {
        input: { kind: 'delete_urls', urlIds: [deletedUrlId] },
        output: {
          proposal: { kind: 'delete_urls', urlIds: [deletedUrlId] },
        },
        state: 'output-available',
        title: 'Propose saved tabs action',
        toolCallId: 'proposal-delete',
        toolName: 'proposeSavedTabsAction',
        type: 'dynamic-tool',
      },
    ],
  }
  await serviceWorker.evaluate(
    async (value) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('tabbin-persistence-v2', 1)
        request.addEventListener('success', () => resolve(request.result))
        request.addEventListener('error', () =>
          reject(request.error ?? new Error('Failed to open persistence v2.')),
        )
      })
      try {
        const transaction = database.transaction(
          ['conversations', 'messages'],
          'readwrite',
        )
        const completed = new Promise<void>((resolve, reject) => {
          transaction.addEventListener('complete', () => resolve())
          transaction.addEventListener('abort', () =>
            reject(
              transaction.error ?? new Error('Conversation seed aborted.'),
            ),
          )
          transaction.addEventListener('error', () =>
            reject(transaction.error ?? new Error('Conversation seed failed.')),
          )
        })
        transaction.objectStore('conversations').put({
          id: value.conversationId,
          updatedAt: value.now,
          value: {
            createdAt: value.now,
            messageIds: [value.message.id],
            title: 'Organize saved tabs',
          },
        })
        transaction.objectStore('messages').put({
          conversationId: value.conversationId,
          createdAt: value.now,
          id: value.message.id,
          value: value.message,
        })
        await completed
      } finally {
        database.close()
      }
    },
    { conversationId, message, now },
  )
}

test.describe('extension AI saved-tabs actions', () => {
  test('approval gates project moves and URL deletion with Undo and reload persistence', async ({
    extensionId,
    page,
    serviceWorker,
  }, testInfo) => {
    await seedSavedTabsFixture(serviceWorker, createOrganizationSeed())
    await seedOrganizationConversation(serviceWorker)
    const before = await readPersistenceV2SavedTabsSnapshot(serviceWorker)
    await page.setViewportSize({ width: 1440, height: 1200 })

    await page.goto(getExtensionUrl(extensionId, 'app.html#/ai-chat'))
    const proposals = page.getByRole('region', { name: 'Proposed action' })
    const move = proposals.filter({ hasText: 'Move URLs between projects' })
    const deletion = proposals.filter({ hasText: 'Delete saved URLs' })
    await expect(proposals).toHaveCount(2)
    await expect(
      move.getByRole('button', { name: 'Approve and apply' }),
    ).toHaveCount(0)
    await expect(
      deletion.getByRole('button', { name: 'Approve and apply' }),
    ).toHaveCount(0)
    expect(await readPersistenceV2SavedTabsSnapshot(serviceWorker)).toEqual(
      before,
    )

    await move.getByRole('button', { name: 'Review proposed action' }).click()
    await expect(
      move.getByText('Affected URLs: 1', { exact: true }),
    ).toBeVisible()
    await expect(move.getByText('Example Home', { exact: true })).toBeVisible()
    await expect(
      move.getByText('https://example.com/', { exact: true }),
    ).toBeVisible()
    await expect(move.getByText('Inbox / —', { exact: true })).toBeVisible()
    await expect(move.getByText('Research / —', { exact: true })).toBeVisible()
    expect(await readPersistenceV2SavedTabsSnapshot(serviceWorker)).toEqual(
      before,
    )

    await move.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(
      move.getByRole('button', { name: 'Approve and apply' }),
    ).toHaveCount(0)
    expect(await readPersistenceV2SavedTabsSnapshot(serviceWorker)).toEqual(
      before,
    )

    await move.getByRole('button', { name: 'Review proposed action' }).click()
    await deletion
      .getByRole('button', { name: 'Review proposed action' })
      .click()
    await expect(
      deletion.getByText(
        'These URLs will be deleted from all projects and domain collections.',
      ),
    ).toBeVisible()
    await expect(
      deletion.getByText('Obsolete reference', { exact: true }),
    ).toBeVisible()
    expect(await readPersistenceV2SavedTabsSnapshot(serviceWorker)).toEqual(
      before,
    )
    await testInfo.attach('ai-actions-preview', {
      body: await page.screenshot({
        fullPage: true,
        path: testInfo.outputPath('ai-actions-preview.png'),
      }),
      contentType: 'image/png',
    })

    await move.getByRole('button', { name: 'Approve and apply' }).click()
    await expect(move.getByRole('status')).toHaveText('Action applied.')
    const afterMove = await readPersistenceV2SavedTabsSnapshot(serviceWorker)
    expect(afterMove.urls).toEqual(before.urls)
    expect(afterMove.memberships).toContainEqual(
      expect.objectContaining({
        collectionId: targetProjectId,
        urlId: movedUrlId,
      }),
    )
    expect(afterMove.memberships).not.toContainEqual(
      expect.objectContaining({
        collectionId: sourceProjectId,
        urlId: movedUrlId,
      }),
    )
    expect(afterMove.memberships).toContainEqual(
      before.memberships.find(
        (membership: { collectionId: string; urlId: string }) =>
          membership.collectionId === 'group-example' &&
          membership.urlId === movedUrlId,
      ),
    )

    // The move changes the revision, so explicitly review the deletion again.
    await deletion.getByRole('button', { name: 'Cancel', exact: true }).click()
    await deletion
      .getByRole('button', { name: 'Review proposed action' })
      .click()
    expect(await readPersistenceV2SavedTabsSnapshot(serviceWorker)).toEqual(
      afterMove,
    )
    await deletion.getByRole('button', { name: 'Approve and apply' }).click()
    await expect(deletion.getByRole('status')).toHaveText('Action applied.')
    const afterDelete = await readPersistenceV2SavedTabsSnapshot(serviceWorker)
    expect(afterDelete.urls).not.toContainEqual(
      expect.objectContaining({ id: deletedUrlId }),
    )
    expect(afterDelete.memberships).not.toContainEqual(
      expect.objectContaining({ urlId: deletedUrlId }),
    )
    expect(afterDelete.urls).toContainEqual(
      before.urls.find((url: { id: string }) => url.id === movedUrlId),
    )

    await deletion.getByRole('button', { name: 'Undo this action' }).click()
    await expect(deletion.getByRole('status')).toHaveText('Action undone.')
    const afterUndo = await readPersistenceV2SavedTabsSnapshot(serviceWorker)
    expect(afterUndo).toEqual({ ...afterMove, revision: afterUndo.revision })
    expect(Number(afterUndo.revision)).toBeGreaterThan(
      Number(afterDelete.revision),
    )

    await page.getByRole('link', { name: 'Saved tabs', exact: true }).click()
    await page.getByRole('link', { name: 'Chat', exact: true }).click()
    await expect(
      move.getByRole('button', { name: 'Undo this action' }),
    ).toBeVisible()
    await move.getByRole('button', { name: 'Undo this action' }).click()
    await expect(move.getByRole('status')).toHaveText('Action undone.')
    const afterMoveUndo =
      await readPersistenceV2SavedTabsSnapshot(serviceWorker)
    expect(afterMoveUndo).toEqual({
      ...before,
      revision: afterMoveUndo.revision,
    })

    await page.reload()
    await expect(
      page.getByRole('region', { name: 'Proposed action' }),
    ).toHaveCount(2)
    expect(await readPersistenceV2SavedTabsSnapshot(serviceWorker)).toEqual(
      afterMoveUndo,
    )
    await page.goto(
      getExtensionUrl(extensionId, 'app.html#/saved-tabs?mode=custom'),
    )
    await expect(page.getByText('Example Home', { exact: true })).toBeVisible()
    await expect(
      page.getByText('Obsolete reference', { exact: true }),
    ).toBeVisible()
    expect(await readPersistenceV2SavedTabsSnapshot(serviceWorker)).toEqual(
      afterMoveUndo,
    )
  })
})
