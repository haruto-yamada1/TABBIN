import { z } from 'zod'

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

test('review candidates can be searched, deleted across memberships, restored, and reloaded', async ({
  extensionId,
  page,
  serviceWorker,
}) => {
  const now = Date.now()
  const old = now - 100 * 86_400_000
  await seedSavedTabsFixture(serviceWorker, {
    storage: createBaseSeed(),
    persistence: {
      groups: [],
      categories: [],
      collections: [
        createDomainCollectionFixture('review-domain', 'example.com', old),
        createCustomCollectionFixture('review-project', 'Reading', old, 1024),
      ],
      urls: [
        createUrlFixture(
          'review-alpha',
          'https://example.com/docs',
          'Alpha guide',
          old,
        ),
        createUrlFixture(
          'review-beta',
          'https://example.com/blog',
          'Beta article',
          old + 1000,
        ),
        createUrlFixture(
          'review-new',
          'https://example.com/new',
          'Outside review criteria',
          now,
        ),
      ],
      memberships: [
        createMembershipFixture('review-domain', 'review-alpha', old),
        createMembershipFixture('review-project', 'review-alpha', old),
        createMembershipFixture('review-domain', 'review-beta', old, 1024),
        createMembershipFixture('review-domain', 'review-new', now, 2048),
      ],
    },
  })
  const original = await readPersistenceV2SavedTabsSnapshot(serviceWorker)
  const originalRevision = z.number().int().parse(original.revision)
  const params = new URLSearchParams({
    review: '1',
    target: 'older',
    olderThanDays: '30',
    reviewAt: String(now),
  })
  const reviewUrl = getExtensionUrl(
    extensionId,
    `app.html#/saved-tabs?${params}`,
  )
  await page.goto(reviewUrl)
  const results = page.getByRole('list', { name: 'Review candidates' })
  await expect(results.getByRole('listitem')).toHaveCount(2)
  await expect(
    page.getByText('Outside review criteria', { exact: true }),
  ).toBeHidden()
  await page.getByLabel('Sort by', { exact: true }).selectOption('newest')
  await expect(results.getByRole('listitem').first()).toContainText(
    'Beta article',
  )
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.screenshot({
    path: '/tmp/tabbin-review-actions-en.png',
    fullPage: true,
  })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    path: '/tmp/tabbin-review-actions-mobile.png',
    fullPage: true,
  })
  await serviceWorker.evaluate(
    async (userSettings) => {
      await chrome.storage.local.set({ userSettings })
    },
    { ...defaultUserSettings, language: 'ja' },
  )
  await expect(
    page.getByRole('heading', { name: '保存タブの見直し', exact: true }),
  ).toBeVisible()
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.screenshot({
    path: '/tmp/tabbin-review-actions-ja.png',
    fullPage: true,
  })
  await serviceWorker.evaluate(
    async (userSettings) => {
      await chrome.storage.local.set({ userSettings })
    },
    { ...defaultUserSettings, language: 'en' },
  )
  await expect(
    page.getByRole('heading', { name: 'Review saved tabs', exact: true }),
  ).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  const search = page.getByRole('searchbox', {
    name: 'Search review candidates',
  })
  await search.fill('DOCS')
  await expect(results.getByRole('listitem')).toHaveCount(1)
  await expect(page.getByRole('status')).toHaveText(
    'Showing 1 of 2 review candidates',
  )
  await page
    .getByRole('button', { name: 'Select displayed tabs', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Delete selected (1)', exact: true })
    .click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog.getByText('Alpha guide', { exact: true })).toBeVisible()
  await expect(dialog.getByText('Beta article', { exact: true })).toBeHidden()
  expect(await readPersistenceV2SavedTabsSnapshot(serviceWorker)).toEqual(
    original,
  )
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  expect(await readPersistenceV2SavedTabsSnapshot(serviceWorker)).toEqual(
    original,
  )
  await page
    .getByRole('button', { name: 'Delete selected (1)', exact: true })
    .click()
  await dialog
    .getByRole('button', { name: 'Delete 1 tabs', exact: true })
    .click()
  await expect(results.getByRole('listitem')).toHaveCount(0)
  await expect(search).toHaveValue('DOCS')
  const deleted = await readPersistenceV2SavedTabsSnapshot(serviceWorker)
  expect(deleted.urls.map(({ id }) => id)).toEqual([
    'review-beta',
    'review-new',
  ])
  expect(
    deleted.memberships.some(({ urlId }) => urlId === 'review-alpha'),
  ).toBe(false)
  const observer = await page.context().newPage()
  await observer.goto(reviewUrl)
  await expect(
    observer.getByRole('heading', { name: 'Alpha guide', exact: true }),
  ).toBeHidden()
  await expect(
    observer.getByRole('heading', { name: 'Beta article', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Undo deletion', exact: true }).click()
  await expect(
    results.getByRole('heading', { name: 'Alpha guide', exact: true }),
  ).toBeVisible()
  expect(await readPersistenceV2SavedTabsSnapshot(serviceWorker)).toEqual({
    ...original,
    revision: originalRevision + 2,
  })
  await observer.reload()
  await expect(
    observer.getByRole('heading', { name: 'Alpha guide', exact: true }),
  ).toBeVisible()
  await observer.close()
  await page.getByRole('button', { name: 'Clear search', exact: true }).click()
  await page
    .getByRole('button', { name: 'Delete tab Alpha guide', exact: true })
    .click()
  await dialog
    .getByRole('button', { name: 'Delete 1 tabs', exact: true })
    .click()
  await expect(results.getByRole('listitem')).toHaveCount(1)
  await page.reload()
  await expect(results.getByRole('listitem')).toHaveCount(1)
  await expect(
    results.getByRole('heading', { name: 'Beta article', exact: true }),
  ).toBeVisible()
  expect(await readPersistenceV2SavedTabsSnapshot(serviceWorker)).toEqual({
    ...deleted,
    revision: originalRevision + 3,
  })
})
