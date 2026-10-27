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
  seedSavedTabsFixture,
} from './extension'

type SavedSearchScenario = {
  appUrl: string
  page: Page
  serviceWorker: Pick<Worker, 'evaluate'>
}

export const createSavedSearchFixture = () => {
  const now = Date.now()
  const urls = [
    createUrlFixture('alpha', 'https://one.example/alpha', 'Alpha guide', now),
    createUrlFixture('beta', 'https://one.example/beta', 'Beta guide', now),
  ]
  return {
    storage: createBaseSeed({
      userSettings: { ...defaultUserSettings, language: 'en' },
    }),
    persistence: {
      categories: [],
      collections: [
        createDomainCollectionFixture('domain', 'one.example', now, 0),
        createCustomCollectionFixture('project', 'Reading list', now, 1),
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

const rows = (page: Page) => page.locator('a[href^="https://one.example/"]')

export const verifySavedSearches = async (
  { appUrl, page, serviceWorker }: SavedSearchScenario,
  testInfo: TestInfo,
  initialMode: 'domain' | 'custom',
): Promise<void> => {
  await seedSavedTabsFixture(serviceWorker, createSavedSearchFixture())
  const before = await readPersistenceV2SavedTabsSnapshot(serviceWorker)
  await page.goto(`${appUrl}#/saved-tabs?mode=${initialMode}`)
  await expect(rows(page)).toHaveCount(2)
  const search = page.getByRole('textbox', { name: 'Search', exact: true })
  await search.fill('Alpha')
  await expect(rows(page)).toHaveCount(1)
  await expect(rows(page)).toHaveAttribute('href', 'https://one.example/alpha')

  await page
    .getByRole('button', { name: 'Saved searches', exact: true })
    .click()
  const dialog = page.getByRole('dialog', { name: 'Saved searches' })
  await dialog.getByRole('textbox', { name: 'Search name' }).fill('Work')
  await dialog.getByRole('button', { name: 'Save search', exact: true }).click()
  await expect(dialog.getByRole('button', { name: 'Apply Work' })).toBeVisible()
  await testInfo.attach('saved-searches', {
    body: await page.screenshot({ animations: 'disabled' }),
    contentType: 'image/png',
  })

  await page.reload()
  await page
    .getByRole('button', { name: 'Saved searches', exact: true })
    .click()
  await page.getByRole('button', { name: 'Apply Work', exact: true }).click()
  await expect(search).toHaveValue('Alpha')
  await expect(rows(page)).toHaveCount(1)
  await expect(rows(page)).toHaveAttribute('href', 'https://one.example/alpha')

  const otherMode = initialMode === 'domain' ? 'custom' : 'domain'
  await page.goto(`${appUrl}#/saved-tabs?mode=${otherMode}`)
  await search.fill('')
  await expect(rows(page)).toHaveCount(2)
  await page
    .getByRole('button', { name: 'Saved searches', exact: true })
    .click()
  await page.getByRole('button', { name: 'Apply Work', exact: true }).click()
  await expect(search).toHaveValue('Alpha')
  await expect(rows(page)).toHaveCount(1)
  await expect(rows(page)).toHaveAttribute('href', 'https://one.example/alpha')

  await page
    .getByRole('button', { name: 'Saved searches', exact: true })
    .click()
  await page.getByRole('button', { name: 'Rename Work', exact: true }).click()
  await dialog.getByRole('textbox', { name: 'Search name' }).fill('Reading')
  await dialog.getByRole('button', { name: 'Save name', exact: true }).click()
  await expect(
    dialog.getByRole('button', { name: 'Apply Reading' }),
  ).toBeVisible()
  await page.reload()
  await page
    .getByRole('button', { name: 'Saved searches', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Delete Reading', exact: true })
    .click()
  await expect(
    dialog.getByRole('button', { name: 'Apply Reading' }),
  ).toHaveCount(0)
  await page.reload()
  await page
    .getByRole('button', { name: 'Saved searches', exact: true })
    .click()
  await expect(dialog.getByText('No saved searches yet.')).toBeVisible()
  expect(await readPersistenceV2SavedTabsSnapshot(serviceWorker)).toEqual(
    before,
  )
}
