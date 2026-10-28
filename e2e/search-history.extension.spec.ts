/* eslint-disable playwright/expect-expect -- shared scenario checks UI and persistence */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { exportFullBackup } from './helpers/backup-export'
import {
  expect,
  getExtensionUrl,
  readStorage,
  seedSavedTabsFixture,
  test,
} from './helpers/extension'
import {
  createSearchHistoryFixture,
  verifySearchHistory,
} from './helpers/search-history'

for (const mode of ['domain', 'custom'] as const) {
  test(`${mode} search history follows input, deletes a single entry and survives reload`, async ({
    extensionId,
    page,
    serviceWorker,
  }, testInfo) => {
    await verifySearchHistory(
      { page, serviceWorker, appUrl: getExtensionUrl(extensionId, 'app.html') },
      mode,
      testInfo,
    )
  })
}

test('concurrent searches on two pages are both retained and synchronized', async ({
  extensionContext,
  extensionId,
  page,
  serviceWorker,
}) => {
  await seedSavedTabsFixture(serviceWorker, createSearchHistoryFixture())
  const second = await extensionContext.newPage()
  const url = getExtensionUrl(extensionId, 'app.html#/saved-tabs?mode=domain')
  await Promise.all([page.goto(url), second.goto(url)])
  const firstInput = page.getByRole('textbox', { name: 'Search', exact: true })
  const secondInput = second.getByRole('textbox', {
    name: 'Search',
    exact: true,
  })
  await Promise.all([
    firstInput.fill('alpha query'),
    secondInput.fill('beta query'),
  ])
  await expect
    .poll(async () =>
      readStorage<{ savedTabsSearchHistory: string[] }>(
        serviceWorker,
        'savedTabsSearchHistory',
      ),
    )
    .toMatchObject({
      savedTabsSearchHistory: expect.arrayContaining([
        'alpha query',
        'beta query',
      ]),
    })
  await Promise.all([firstInput.fill(''), secondInput.fill('')])
  await Promise.all([firstInput.click(), secondInput.click()])
  await Promise.all(
    [page, second].map(async (view) => {
      const history = view.getByRole('list', { name: 'Search history' })
      await expect(history.getByText('alpha query')).toBeVisible()
      await expect(history.getByText('beta query')).toBeVisible()
    }),
  )
})

test('search history remains device-local and is excluded from Backup V2', async ({
  extensionId,
  page,
  serviceWorker,
}) => {
  await seedSavedTabsFixture(serviceWorker, createSearchHistoryFixture())
  await page.goto(getExtensionUrl(extensionId, 'app.html#/options'))
  const download = page.waitForEvent('download')
  await exportFullBackup(page)
  const path = await (await download).path()
  assert.ok(path)
  expect(await readFile(path, 'utf8')).not.toContain('savedTabsSearchHistory')
  expect(await readStorage(serviceWorker, 'savedTabsSearchHistory')).toEqual({
    savedTabsSearchHistory: ['youtube ご飯', '太郎 ご飯'],
  })
})

test('deleting a search on one page cancels a pending re-add on another page', async ({
  extensionContext,
  extensionId,
  page,
  serviceWorker,
}) => {
  await seedSavedTabsFixture(serviceWorker, createSearchHistoryFixture())
  const second = await extensionContext.newPage()
  const url = getExtensionUrl(extensionId, 'app.html#/saved-tabs?mode=domain')
  await Promise.all([page.goto(url), second.goto(url)])
  const firstInput = page.getByRole('textbox', { name: 'Search', exact: true })
  const secondInput = second.getByRole('textbox', {
    name: 'Search',
    exact: true,
  })
  await firstInput.click()
  const deleteButton = page.getByRole('button', {
    name: 'Remove youtube ご飯 from search history',
  })
  await expect(deleteButton).toBeVisible()
  await secondInput.fill('youtube ご飯')
  await deleteButton.click()
  const start = Date.now()
  await expect
    .poll(
      async () => {
        const state = await readStorage<{ savedTabsSearchHistory: string[] }>(
          serviceWorker,
          'savedTabsSearchHistory',
        )
        if (state.savedTabsSearchHistory.includes('youtube ご飯')) {
          return 'present'
        }
        return Date.now() - start >= 1600 ? 'absent' : 'waiting'
      },
      { timeout: 5000 },
    )
    .toBe('absent')
  await secondInput.fill('new query')
  await expect
    .poll(async () =>
      readStorage<{ savedTabsSearchHistory: string[] }>(
        serviceWorker,
        'savedTabsSearchHistory',
      ),
    )
    .toMatchObject({
      savedTabsSearchHistory: expect.arrayContaining(['new query']),
    })
})
