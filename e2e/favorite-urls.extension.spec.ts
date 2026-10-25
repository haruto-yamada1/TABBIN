import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

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
  seedSavedTabsFixture,
  test,
} from './helpers/extension'

const titles = [
  'First saved tab',
  'Important reference',
  'Last saved tab',
] as const

test('favorites synchronize modes, retain manual order, roundtrip Backup V2 and survive automatic expiration', async ({
  extensionContext,
  extensionId,
  page,
  serviceWorker,
}) => {
  const savedAt = Date.now() - 3 * 86_400_000
  const urls = titles.map((title, index) =>
    createUrlFixture(
      `url-${index}`,
      `https://example.com/${index}`,
      title,
      savedAt,
    ),
  )
  await seedSavedTabsFixture(serviceWorker, {
    storage: createBaseSeed(),
    persistence: {
      categories: [],
      groups: [],
      collections: [
        createDomainCollectionFixture('domain', 'example.com', savedAt),
        createCustomCollectionFixture('project', 'Reading queue', savedAt),
      ],
      urls,
      memberships: urls.flatMap((url, index) =>
        ['domain', 'project'].map((id) =>
          createMembershipFixture(id, url.id, savedAt, index),
        ),
      ),
    },
  })
  const appUrl = getExtensionUrl(extensionId, 'app.html')
  await page.goto(`${appUrl}#/saved-tabs?mode=domain`)
  const custom = await extensionContext.newPage()
  await custom.goto(`${appUrl}#/saved-tabs?mode=custom`)
  const domainTitles = page.getByTestId('url-title-label')
  const projectTitles = custom.getByTestId('project-url-title')
  await expect(domainTitles).toHaveText(titles)
  const before = await readPersistenceV2SavedTabsSnapshot(serviceWorker)
  const star = (view: typeof page) =>
    view.getByRole('button', {
      name: 'Favorite: Important reference',
      exact: true,
    })
  await star(page).click()
  await expect(star(page)).toHaveAttribute('aria-pressed', 'true')
  await expect(star(custom)).toHaveAttribute('aria-pressed', 'true')
  await expect(domainTitles).toHaveText([titles[1], titles[0], titles[2]])
  await expect(projectTitles).toHaveText([titles[1], titles[0], titles[2]])
  const favoriteSnapshot =
    await readPersistenceV2SavedTabsSnapshot(serviceWorker)
  expect(favoriteSnapshot.memberships).toEqual(before.memberships)
  expect(
    favoriteSnapshot.urls.filter(({ id }: { id: string }) => id !== 'url-1'),
  ).toEqual(before.urls.filter(({ id }: { id: string }) => id !== 'url-1'))
  await page.reload()
  await custom.reload()
  await expect(star(page)).toHaveAttribute('aria-pressed', 'true')
  const filter = page.getByRole('button', {
    name: 'Show only favorites in example.com',
    exact: true,
  })
  await filter.click()
  await expect(domainTitles).toHaveText(['Important reference'])
  await star(custom).click()
  await expect(domainTitles).toHaveCount(0)
  await page
    .getByRole('button', {
      name: 'Delete all tabs for "example.com"',
      exact: true,
    })
    .click()
  expect(
    (await readPersistenceV2SavedTabsSnapshot(serviceWorker)).memberships,
  ).toEqual(before.memberships)
  await filter.click()
  await expect(domainTitles).toHaveText(titles)
  await star(custom).click()
  await expect(domainTitles).toHaveText([titles[1], titles[0], titles[2]])

  const options = await extensionContext.newPage()
  await options.goto(`${appUrl}#/options`)
  const downloadPromise = options.waitForEvent('download')
  await options.getByRole('button', { name: /export/i }).click()
  const downloadPath = await (await downloadPromise).path()
  assert.ok(downloadPath)
  const content = await readFile(downloadPath, 'utf8')
  const backup = BackupEnvelopeV2Schema.parse(JSON.parse(content))
  expect(
    backup.data.savedTabs.urls.find(({ id }) => id === 'url-1')?.isFavorite,
  ).toBe(true)
  await star(custom).click()
  await expect(star(page)).toHaveAttribute('aria-pressed', 'false')
  await options.getByRole('button', { name: /import/i }).click()
  await options.getByTestId('hidden-file-input').setInputFiles({
    name: 'favorite-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(content),
  })
  const dialog = options.getByRole('dialog')
  await expect(
    dialog.getByRole('button', { name: 'Confirm Import' }),
  ).toBeEnabled()
  await dialog.getByRole('button', { name: 'Confirm Import' }).click()
  await expect(dialog).toBeHidden()
  await expect(star(page)).toHaveAttribute('aria-pressed', 'true')
  await expect(star(custom)).toHaveAttribute('aria-pressed', 'true')

  await page.setViewportSize({ width: 1100, height: 760 })
  await page.screenshot({
    path: 'docs/testing/assets/issue-912-favorites.png',
    fullPage: true,
  })
  await serviceWorker.evaluate(async (settings) => {
    await chrome.storage.local.set({
      userSettings: { ...settings, autoDeletePeriod: '1day' },
    })
  }, defaultUserSettings)
  await page.evaluate(async () =>
    chrome.runtime.sendMessage({ action: 'checkExpiredTabs' }),
  )
  await expect(domainTitles).toHaveText(['Important reference'])
  await expect(projectTitles).toHaveCount(3)
  await star(custom).click()
  await expect(star(page)).toHaveAttribute('aria-pressed', 'false')
  await page.evaluate(async () =>
    chrome.runtime.sendMessage({ action: 'checkExpiredTabs' }),
  )
  await expect(domainTitles).toHaveCount(0)
})
