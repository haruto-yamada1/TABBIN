import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { BackupEnvelopeV2Schema } from '@/features/options/lib/import-export/v2/BackupV2Schema'
import {
  createExamplePersistenceFixture,
  createUrlFixture,
} from '@/test/fixtures/persistenceBrowserFixtures'

import { exportFullBackup } from './helpers/backup-export'
import {
  createBaseSeed,
  expect,
  getExtensionUrl,
  readPersistenceV2SavedTabsSnapshot,
  readStorage,
  seedSavedTabsFixture,
  test,
  waitForPersistenceV2Ready,
} from './helpers/extension'

test('previews paginated additions/updates/deletions and restores only selected sections', async ({
  extensionId,
  page,
  serviceWorker,
}, testInfo) => {
  const now = Date.now()
  const persistence = createExamplePersistenceFixture(now)
  await seedSavedTabsFixture(serviceWorker, {
    persistence: {
      ...persistence,
      urls: [
        ...persistence.urls,
        createUrlFixture(
          'removed',
          'https://removed.example/',
          'Removed preview URL',
          now,
        ),
      ],
    },
    storage: createBaseSeed(),
  })
  await page.goto(getExtensionUrl(extensionId, 'app.html#/options'))
  await waitForPersistenceV2Ready(serviceWorker)
  const downloadPromise = page.waitForEvent('download')
  await exportFullBackup(page)
  const downloadPath = await (await downloadPromise).path()
  expect(downloadPath).toBeTruthy()
  const backup = BackupEnvelopeV2Schema.parse(
    JSON.parse(await readFile(downloadPath as string, 'utf8')),
  )
  const collectionId = backup.data.savedTabs.collections[0]?.id
  expect(collectionId).toBeTruthy()
  assert.ok(collectionId)
  const urls = backup.data.savedTabs.urls
    .filter(({ id }) => id !== 'removed')
    .map((url) => ({ ...url, title: 'Updated preview URL' }))
  const memberships = [...backup.data.savedTabs.memberships]
  for (let i = 0; i < 24; i += 1) {
    urls.push({
      ...createUrlFixture(
        `added-${i}`,
        `https://added-${i}.example/`,
        `Added preview URL ${i}`,
        now,
      ),
      firstSavedAtProvenance: 'exact',
      lastSavedAtProvenance: 'exact',
    })
    memberships.push({
      addedAt: now,
      collectionId,
      sortOrder: 2048 + i,
      updatedAt: now,
      urlId: `added-${i}`,
    })
  }
  backup.data.savedTabs = { ...backup.data.savedTabs, urls, memberships }
  backup.data.userSettings.showSavedTime =
    !backup.data.userSettings.showSavedTime
  const settingsBefore = await readStorage(serviceWorker, ['userSettings'])
  const before = await readPersistenceV2SavedTabsSnapshot(serviceWorker)
  await page.getByRole('button', { name: /import/i }).click()
  await page.getByTestId('hidden-file-input').setInputFiles({
    name: 'preview.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)),
  })
  const dialog = page.getByRole('dialog')
  await expect(
    dialog.getByText('Choose data to restore', { exact: true }),
  ).toBeVisible()
  await dialog
    .getByRole('checkbox', { name: 'Settings', exact: true })
    .uncheck()
  await dialog
    .getByRole('checkbox', { name: 'AI chat history', exact: true })
    .uncheck()
  await dialog
    .getByRole('checkbox', { name: 'Analytics views', exact: true })
    .uncheck()
  await expect(dialog.getByRole('status')).toHaveText(
    'Add: 48 · Update: 1 · Delete: 1',
  )
  const list = dialog.getByRole('list', { name: 'Changes to selected data' })
  await expect(list.getByRole('listitem')).toHaveCount(20)
  // A preview is read-only, including the settings that will be retained.
  expect(await readPersistenceV2SavedTabsSnapshot(serviceWorker)).toEqual(
    before,
  )
  expect(await readStorage(serviceWorker, ['userSettings'])).toEqual(
    settingsBefore,
  )
  await page.setViewportSize({ width: 1280, height: 960 })
  await dialog
    .getByText('Choose data to restore', { exact: true })
    .scrollIntoViewIfNeeded()
  await expect(
    page.getByText('Exported settings and tab data successfully', {
      exact: true,
    }),
  ).toBeHidden()
  const screenshot = testInfo.outputPath('backup-import-preview.png')
  await page.screenshot({ path: screenshot, animations: 'disabled' })
  await testInfo.attach('backup-import-preview', {
    path: screenshot,
    contentType: 'image/png',
  })
  await dialog.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(list).toContainText('Removed preview URL')
  await expect(list).toContainText('Updated preview URL')
  await dialog.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(list.getByRole('listitem')).toHaveCount(10)
  await dialog
    .getByRole('checkbox', { name: 'Saved tabs', exact: true })
    .uncheck()
  await expect(
    dialog.getByRole('button', { name: 'Confirm Import' }),
  ).toBeDisabled()
  await dialog
    .getByRole('checkbox', { name: 'Saved tabs', exact: true })
    .check()
  await dialog.getByRole('button', { name: 'Confirm Import' }).click()
  await expect(dialog).toBeHidden()
  expect(await readStorage(serviceWorker, ['userSettings'])).toEqual(
    settingsBefore,
  )
  await page.reload()
  const after = await readPersistenceV2SavedTabsSnapshot(serviceWorker)
  expect(after.urls).toHaveLength(25)
  expect(after.urls.some((url) => url.id === 'removed')).toBe(false)
  expect(after.urls.some((url) => url.title === 'Updated preview URL')).toBe(
    true,
  )
})

test('rejects confirmation when settings changed after the preview', async ({
  extensionId,
  page,
  serviceWorker,
}) => {
  await seedSavedTabsFixture(serviceWorker, {
    persistence: createExamplePersistenceFixture(Date.now()),
    storage: createBaseSeed(),
  })
  await page.goto(getExtensionUrl(extensionId, 'app.html#/options'))
  await waitForPersistenceV2Ready(serviceWorker)
  const downloadPromise = page.waitForEvent('download')
  await exportFullBackup(page)
  const downloadPath = await (await downloadPromise).path()
  const content = await readFile(downloadPath as string, 'utf8')
  await page.getByRole('button', { name: /import/i }).click()
  await page.getByTestId('hidden-file-input').setInputFiles({
    name: 'preview.json',
    mimeType: 'application/json',
    buffer: Buffer.from(content),
  })
  await expect(
    page.getByRole('button', { name: 'Confirm Import' }),
  ).toBeEnabled()
  const before = await readPersistenceV2SavedTabsSnapshot(serviceWorker)
  await serviceWorker.evaluate(async () => {
    const { userSettings } = await chrome.storage.local.get('userSettings')
    await chrome.storage.local.set({
      userSettings: {
        ...userSettings,
        showSavedTime: !userSettings.showSavedTime,
      },
    })
  })
  const changedSettings = await readStorage(serviceWorker, ['userSettings'])
  await page.getByRole('button', { name: 'Confirm Import' }).click()
  await expect(
    page.getByText(
      'Data changed after the preview. Go back and select the file again to review the latest changes.',
    ),
  ).toBeVisible()
  await expect(page.getByRole('dialog')).toBeVisible()
  expect(await readPersistenceV2SavedTabsSnapshot(serviceWorker)).toEqual(
    before,
  )
  expect(await readStorage(serviceWorker, ['userSettings'])).toEqual(
    changedSettings,
  )
})
