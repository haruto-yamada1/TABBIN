import type { Page, TestInfo, Worker } from '@playwright/test'

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
  readPersistenceV2SavedTabsSnapshot,
  readStorage,
  seedSavedTabsFixture,
} from './extension'

export const createSearchHistoryFixture = () => {
  const now = Date.now()
  const urls = [
    createUrlFixture(
      'alpha',
      'https://history.example/alpha',
      'youtube ご飯',
      now,
    ),
    createUrlFixture('beta', 'https://history.example/beta', '太郎 ご飯', now),
  ]
  return {
    storage: createBaseSeed({
      userSettings: { ...defaultUserSettings, language: 'en' },
      savedTabsSearchHistory: ['youtube ご飯', '太郎 ご飯'],
    }),
    persistence: {
      categories: [],
      collections: [
        createDomainCollectionFixture('domain', 'history.example', now, 0),
        createCustomCollectionFixture('project', 'Reading', now, 1),
      ],
      groups: [],
      memberships: urls.flatMap((url, index) => [
        createMembershipFixture('domain', url.id, now, index),
        createMembershipFixture('project', url.id, now, index),
      ]),
      urls,
    },
  }
}

export const verifySearchHistory = async (
  {
    page,
    serviceWorker,
    appUrl,
  }: { page: Page; serviceWorker: Pick<Worker, 'evaluate'>; appUrl: string },
  mode: 'domain' | 'custom',
  testInfo: TestInfo,
): Promise<void> => {
  await seedSavedTabsFixture(serviceWorker, createSearchHistoryFixture())
  const before = await readPersistenceV2SavedTabsSnapshot(serviceWorker)
  await page.goto(`${appUrl}#/saved-tabs?mode=${mode}`)
  const rows = page.locator('a[href^="https://history.example/"]')
  await expect(rows).toHaveCount(2)
  const search = page.getByRole('textbox', { name: 'Search', exact: true })
  await search.click()
  const history = page.getByRole('list', { name: 'Search history' })
  await expect(history.getByText('youtube ご飯')).toBeVisible()
  await expect(history.getByText('太郎 ご飯')).toBeVisible()
  await search.fill('youtube')
  await expect(rows).toHaveCount(1)
  await expect(history.getByText('youtube ご飯')).toBeVisible()
  await expect(history.getByText('太郎 ご飯')).toHaveCount(0)
  await testInfo.attach('search-history', {
    body: await page.screenshot({ animations: 'disabled' }),
    contentType: 'image/png',
  })
  await expect
    .poll(async () => readStorage(serviceWorker, 'savedTabsSearchHistory'))
    .toEqual({
      savedTabsSearchHistory: ['youtube', 'youtube ご飯', '太郎 ご飯'],
    })
  await expect(history.getByText('youtube', { exact: true })).toHaveCount(0)
  await history
    .getByRole('button', { name: 'Remove youtube ご飯 from search history' })
    .click()
  await expect(history.getByText('youtube ご飯')).toHaveCount(0)
  await expect(search).toHaveValue('youtube')
  await page.reload()
  await search.click()
  await expect(history.getByText('youtube', { exact: true })).toBeVisible()
  await expect(history.getByText('youtube ご飯')).toHaveCount(0)
  await history.getByText('youtube', { exact: true }).click()
  await expect(search).toHaveValue('youtube')
  expect(await readPersistenceV2SavedTabsSnapshot(serviceWorker)).toEqual(
    before,
  )
}
