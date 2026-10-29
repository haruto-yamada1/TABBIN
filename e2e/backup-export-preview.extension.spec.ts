import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import type { Worker } from '@playwright/test'

import { BackupEnvelopeV2Schema } from '@/features/options/lib/import-export/v2/BackupV2Schema'
import {
  createCustomCollectionFixture,
  createDomainCollectionFixture,
  createMembershipFixture,
  createUrlFixture,
} from '@/test/fixtures/persistenceBrowserFixtures'

import {
  createBaseSeed,
  defaultUserSettings,
  expect,
  getExtensionUrl,
  readPersistenceV2SavedTabsSnapshot,
  readStorage,
  seedSavedTabsFixture,
  test,
  waitForPersistenceV2Ready,
} from './helpers/extension'

const createExportFixture = (now: number) => ({
  categories: [
    {
      collectionId: 'public',
      createdAt: now,
      id: 'public-category',
      keywords: [],
      name: 'Reading',
      sortOrder: 0,
      updatedAt: now,
    },
    {
      collectionId: 'private',
      createdAt: now,
      id: 'private-category',
      keywords: ['private-marker-keyword'],
      name: 'private-marker-category',
      sortOrder: 0,
      updatedAt: now,
    },
  ],
  collections: [
    {
      ...createDomainCollectionFixture('public', 'public.example', now),
      groupId: 'public-group',
    },
    {
      ...createCustomCollectionFixture(
        'private',
        'private-marker-project',
        now,
      ),
      groupId: 'private-group',
    },
  ],
  groups: [
    {
      createdAt: now,
      id: 'public-group',
      name: 'Reading group',
      sortOrder: 0,
      updatedAt: now,
    },
    {
      createdAt: now,
      id: 'private-group',
      name: 'private-marker-group',
      sortOrder: 1,
      updatedAt: now,
    },
  ],
  memberships: [
    {
      ...createMembershipFixture('public', 'public-url', now),
      categoryId: 'public-category',
      notes: 'Public note',
    },
    createMembershipFixture('public', 'shared-url', now, 1),
    {
      ...createMembershipFixture('private', 'private-url', now),
      categoryId: 'private-category',
      notes: 'private-marker-note',
    },
    {
      ...createMembershipFixture('private', 'shared-url', now, 1),
      notes: 'private-marker-shared-note',
    },
  ],
  urls: [
    {
      ...createUrlFixture(
        'public-url',
        'https://public.example/article?x=1&y=2',
        'Public <article>',
        now,
      ),
      isFavorite: true,
    },
    createUrlFixture(
      'shared-url',
      'https://shared.example/',
      'Shared reference',
      now,
    ),
    createUrlFixture(
      'private-url',
      'https://private-marker.example/?token=private-marker-token',
      'private-marker-title',
      now,
    ),
    createUrlFixture(
      'orphan-url',
      'https://private-marker-orphan.example/',
      'private-marker-orphan',
      now,
    ),
  ],
})

const seedPrivateSupplementaryData = async (
  serviceWorker: Worker,
  now: number,
) => {
  await serviceWorker.evaluate(async (savedAt) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('tabbin-persistence-v2', 1)
      request.addEventListener('success', () => resolve(request.result))
      request.addEventListener('error', () =>
        reject(
          request.error ?? new Error('Backup seed could not open IndexedDB.'),
        ),
      )
    })
    try {
      const transaction = database.transaction(
        ['conversations', 'messages', 'analyticsViews'],
        'readwrite',
      )
      const completed = new Promise<void>((resolve, reject) => {
        transaction.addEventListener('complete', () => resolve())
        transaction.addEventListener('abort', () =>
          reject(
            transaction.error ?? new Error('Backup seed transaction failed.'),
          ),
        )
        transaction.addEventListener('error', () =>
          reject(
            transaction.error ?? new Error('Backup seed transaction failed.'),
          ),
        )
      })
      transaction.objectStore('conversations').put({
        id: 'conversation-1',
        updatedAt: savedAt,
        value: { title: 'private-marker-conversation' },
      })
      transaction.objectStore('messages').put({
        conversationId: 'conversation-1',
        createdAt: savedAt,
        id: 'message-1',
        value: { content: 'private-marker-message', role: 'user' },
      })
      transaction.objectStore('analyticsViews').put({
        id: 'view-1',
        updatedAt: savedAt,
        value: { name: 'private-marker-analysis' },
      })
      await completed
    } finally {
      database.close()
    }
  }, now)
}

test('previews selected JSON backup counts, excludes private data and restores through the existing import UI', async ({
  extensionId,
  page,
  serviceWorker,
}, testInfo) => {
  const now = Date.now()
  await seedSavedTabsFixture(serviceWorker, {
    persistence: createExportFixture(now),
    storage: createBaseSeed({
      userSettings: {
        ...defaultUserSettings,
        excludePatterns: ['private-marker-setting'],
      },
    }),
  })
  await seedPrivateSupplementaryData(serviceWorker, now)
  await page.goto(getExtensionUrl(extensionId, 'app.html#/options'))
  await waitForPersistenceV2Ready(serviceWorker)
  const before = await readPersistenceV2SavedTabsSnapshot(serviceWorker)
  const settingsBefore = await readStorage(serviceWorker, 'userSettings')
  let downloadCount = 0
  page.on('download', () => {
    downloadCount += 1
  })
  await page.getByRole('button', { name: /export/i }).click()
  const dialog = page.getByRole('dialog', { name: 'Export Preview' })
  const confirm = dialog.getByRole('button', { name: 'Download JSON backup' })
  await expect(confirm).toBeDisabled()
  await dialog
    .getByRole('checkbox', { name: 'Saved tabs', exact: true })
    .check()
  await dialog
    .getByRole('checkbox', { name: 'private-marker-project', exact: true })
    .uncheck()
  await dialog
    .getByRole('checkbox', {
      name: 'URLs without a domain or project (1)',
      exact: true,
    })
    .uncheck()
  const counts = dialog.getByRole('region', {
    name: 'Records in the selected backup',
  })
  await Promise.all(
    [
      ['URL', '2'] as const,
      ['Collection', '1'] as const,
      ['Category', '1'] as const,
      ['Group', '1'] as const,
      ['Tab placement', '2'] as const,
      ['Conversation', '0'] as const,
      ['Message', '0'] as const,
      ['Analytics view', '0'] as const,
    ].map(async ([label, count]) => {
      await expect(
        counts
          .locator('div')
          .filter({
            has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }),
          })
          .locator('dd'),
      ).toHaveText(count)
    }),
  )
  expect(downloadCount).toBe(0)
  expect(await readPersistenceV2SavedTabsSnapshot(serviceWorker)).toEqual(
    before,
  )
  expect(await readStorage(serviceWorker, 'userSettings')).toEqual(
    settingsBefore,
  )
  await page.setViewportSize({ width: 1280, height: 960 })
  const screenshot = testInfo.outputPath('backup-export-preview.png')
  await page.screenshot({ path: screenshot, animations: 'disabled' })
  await testInfo.attach('backup-export-preview', {
    path: screenshot,
    contentType: 'image/png',
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(confirm).toBeInViewport()
  const narrowScreenshot = testInfo.outputPath(
    'backup-export-preview-narrow.png',
  )
  await page.screenshot({ path: narrowScreenshot, animations: 'disabled' })
  await testInfo.attach('backup-export-preview-narrow', {
    path: narrowScreenshot,
    contentType: 'image/png',
  })
  const download = page.waitForEvent('download')
  await confirm.click()
  const downloadPath = await (await download).path()
  assert.ok(downloadPath)
  const content = await readFile(downloadPath, 'utf8')
  const backup = BackupEnvelopeV2Schema.parse(JSON.parse(content))
  expect(content).not.toContain('private-marker')
  expect(backup.data.savedTabs.urls.map(({ id }) => id)).toEqual([
    'public-url',
    'shared-url',
  ])
  expect(backup.data.savedTabs.urls[0]).toMatchObject({
    isFavorite: true,
    title: 'Public <article>',
    firstSavedAt: now,
  })
  expect(backup.data.savedTabs.memberships.map(({ notes }) => notes)).toEqual([
    'Public note',
    undefined,
  ])
  expect(backup.data.conversations).toEqual([])
  expect(backup.data.messages).toEqual([])
  expect(backup.data.analyticsViews).toEqual([])
  expect(await readPersistenceV2SavedTabsSnapshot(serviceWorker)).toEqual(
    before,
  )
  expect(await readStorage(serviceWorker, 'userSettings')).toEqual(
    settingsBefore,
  )
  await expect(dialog).toBeHidden()
  await page.setViewportSize({ width: 1280, height: 960 })
  await page.getByRole('button', { name: /import/i }).click()
  await page.getByTestId('hidden-file-input').setInputFiles({
    name: 'selected-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(content),
  })
  const importDialog = page.getByRole('dialog')
  await importDialog
    .getByRole('checkbox', { name: 'Settings', exact: true })
    .uncheck()
  await importDialog
    .getByRole('checkbox', { name: 'AI chat history', exact: true })
    .uncheck()
  await importDialog
    .getByRole('checkbox', { name: 'Analytics views', exact: true })
    .uncheck()
  await importDialog.getByRole('button', { name: 'Confirm Import' }).click()
  await expect(importDialog).toBeHidden()
  expect(await readStorage(serviceWorker, 'userSettings')).toEqual(
    settingsBefore,
  )
  await page.reload()
  const { revision, ...restored } =
    await readPersistenceV2SavedTabsSnapshot(serviceWorker)
  expect(restored).toEqual(backup.data.savedTabs)
  assert.ok(typeof revision === 'number' && typeof before.revision === 'number')
  expect(revision).toBeGreaterThan(before.revision)
})

test('paginates large collection lists and resets cancelled selections', async ({
  extensionId,
  page,
  serviceWorker,
}) => {
  const now = Date.now()
  await seedSavedTabsFixture(serviceWorker, {
    persistence: {
      categories: [],
      collections: Array.from({ length: 25 }, (_, index) =>
        createDomainCollectionFixture(
          `collection-${String(index).padStart(2, '0')}`,
          `domain-${index}.example`,
          now,
          index,
        ),
      ),
      groups: [],
      memberships: [],
      urls: [],
    },
    storage: createBaseSeed(),
  })
  await page.goto(getExtensionUrl(extensionId, 'app.html#/options'))
  await page.getByRole('button', { name: /export/i }).click()
  const dialog = page.getByRole('dialog', { name: 'Export Preview' })
  await dialog
    .getByRole('checkbox', { name: 'Saved tabs', exact: true })
    .check()
  const collections = dialog.getByRole('group', {
    name: 'Domains and projects to include',
  })
  await expect(collections.getByRole('checkbox')).toHaveCount(20)
  await collections.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(collections.getByRole('checkbox')).toHaveCount(5)
  await collections
    .getByRole('checkbox', { name: 'domain-24.example', exact: true })
    .uncheck()
  await collections
    .getByRole('button', { name: 'Previous', exact: true })
    .click()
  await collections.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(
    collections.getByRole('checkbox', {
      name: 'domain-24.example',
      exact: true,
    }),
  ).not.toBeChecked()
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: /export/i }).click()
  await expect(
    dialog.getByRole('button', { name: 'Download JSON backup' }),
  ).toBeDisabled()
  await dialog
    .getByRole('checkbox', { name: 'Saved tabs', exact: true })
    .check()
  await expect(collections.getByRole('checkbox')).toHaveCount(20)
  await collections.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(
    collections.getByRole('checkbox', {
      name: 'domain-24.example',
      exact: true,
    }),
  ).toBeChecked()
})
