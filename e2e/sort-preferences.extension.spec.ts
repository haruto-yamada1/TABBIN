import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import type { Page } from '@playwright/test'

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
} from './helpers/extension'

const manualTitles = [
  'Middle saved tab',
  'Oldest saved tab',
  'Newest saved tab',
] as const
const ascendingTitles = [manualTitles[1], manualTitles[0], manualTitles[2]]
const descendingTitles = [manualTitles[2], manualTitles[0], manualTitles[1]]
const manualDomains = ['zeta.example', 'alpha.example', 'middle.example']

const createSortFixture = () => {
  const now = Date.now()
  const dates = [now - 20_000, now - 30_000, now - 10_000]
  const urls = manualTitles.map((title, index) =>
    createUrlFixture(
      `sort-url-${index}`,
      `https://zeta.example/${index}`,
      title,
      dates[index] ?? now,
    ),
  )
  return {
    storage: createBaseSeed({
      userSettings: { ...defaultUserSettings, showSavedTime: true },
    }),
    persistence: {
      categories: [],
      collections: [
        ...manualDomains.map((domain, index) => ({
          ...createDomainCollectionFixture(
            `domain-${index}`,
            domain,
            now,
            index,
          ),
          groupId: 'category-sort',
        })),
        createCustomCollectionFixture('project-sort', 'Reading queue', now, 3),
      ],
      groups: [
        {
          id: 'category-sort',
          name: 'Research',
          createdAt: now,
          updatedAt: now,
          sortOrder: 0,
        },
      ],
      memberships: [
        ...urls.flatMap((url, index) => [
          createMembershipFixture(
            'domain-0',
            url.id,
            dates[index] ?? now,
            index,
          ),
          createMembershipFixture(
            'project-sort',
            url.id,
            dates[index] ?? now,
            index,
          ),
        ]),
        ...manualDomains
          .slice(1)
          .map((_, index) =>
            createMembershipFixture(
              `domain-${index + 1}`,
              `other-${index}`,
              now,
            ),
          ),
      ],
      urls: [
        ...urls,
        ...manualDomains
          .slice(1)
          .map((domain, index) =>
            createUrlFixture(
              `other-${index}`,
              `https://${domain}/`,
              domain,
              now,
            ),
          ),
      ],
    },
  }
}

const sortButton = (page: Page, target: string | undefined, label: string) =>
  page.getByRole('button', {
    name: target ? `Sort order for "${target}": ${label}` : label,
    exact: true,
  })

const sortedRows = (page: Page) =>
  page
    .locator('a[href^="https://zeta.example/"]')
    .locator(
      '[data-testid="url-title-label"], [data-testid="project-url-title"]',
    )

for (const { mode, target, scope, id, screenshotPath } of [
  {
    mode: 'domain',
    target: 'zeta.example',
    scope: 'domain',
    id: 'domain-0',
    screenshotPath: '/private/tmp/issue916-sort-preferences.png',
  },
  {
    mode: 'custom',
    target: undefined,
    scope: 'project',
    id: 'project-sort',
    screenshotPath: '/private/tmp/issue916-custom-sort-preferences.png',
  },
]) {
  test(`${mode} date sorting survives reload and route revisit, synchronizes pages, and preserves manual order`, async ({
    extensionContext,
    extensionId,
    page,
    serviceWorker,
  }) => {
    await seedSavedTabsFixture(serviceWorker, createSortFixture())
    const appUrl = getExtensionUrl(extensionId, 'app.html')
    const savedUrl = `${appUrl}#/saved-tabs?mode=${mode}`
    const second = await extensionContext.newPage()
    await page.goto(savedUrl)
    await second.goto(savedUrl)
    await expect(sortedRows(page)).toHaveText(manualTitles)
    await expect(sortedRows(second)).toHaveText(manualTitles)
    const before = await readPersistenceV2SavedTabsSnapshot(serviceWorker)

    await sortButton(page, target, 'Default').click()
    await expect(sortedRows(page)).toHaveText(ascendingTitles)
    await expect(sortedRows(second)).toHaveText(ascendingTitles)
    await expect(
      sortButton(second, target, 'Saved date ascending'),
    ).toBeEnabled()
    const key = `savedTabsSort:${scope}:${id}`
    await expect
      .poll(async () => readStorage(serviceWorker, key))
      .toEqual({ [key]: 'asc' })

    await page.reload()
    await expect(sortedRows(page)).toHaveText(ascendingTitles)
    await expect(sortButton(page, target, 'Saved date ascending')).toBeEnabled()
    await page.goto(`${appUrl}#/options`)
    await page.goto(savedUrl)
    await expect(sortedRows(page)).toHaveText(ascendingTitles)

    await sortButton(second, target, 'Saved date ascending').click()
    await expect(sortedRows(page)).toHaveText(descendingTitles)
    await expect(sortedRows(second)).toHaveText(descendingTitles)
    const dragHandle = page.getByLabel(
      'Drag to reorder tab "Middle saved tab"',
      { exact: true },
    )
    await expect(dragHandle).toHaveAttribute('aria-disabled', 'true')
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.screenshot({
      path: screenshotPath,
      animations: 'disabled',
    })

    await sortButton(page, target, 'Saved date descending').click()
    await expect(sortedRows(page)).toHaveText(manualTitles)
    await expect(sortedRows(second)).toHaveText(manualTitles)
    await expect(sortButton(page, target, 'Default')).toBeEnabled()
    await expect(dragHandle).toHaveAttribute('aria-disabled', 'false')
    await page.reload()
    await expect(sortedRows(page)).toHaveText(manualTitles)
    expect(await readPersistenceV2SavedTabsSnapshot(serviceWorker)).toEqual(
      before,
    )
  })
}

test('category name sorting is local, survives Backup V2 import, and leaves manual domain order intact', async ({
  extensionContext,
  extensionId,
  page,
  serviceWorker,
}) => {
  await seedSavedTabsFixture(serviceWorker, createSortFixture())
  const appUrl = getExtensionUrl(extensionId, 'app.html')
  const savedUrl = `${appUrl}#/saved-tabs?mode=domain`
  await page.goto(savedUrl)
  const second = await extensionContext.newPage()
  await second.goto(savedUrl)
  const domainNames = (view: Page) =>
    view
      .getByRole('group', { name: 'Research category group', exact: true })
      .getByTestId('domain-scroll-target')
      .getByRole('heading', { level: 2 })
  await expect(domainNames(page)).toHaveText(manualDomains)
  const before = await readPersistenceV2SavedTabsSnapshot(serviceWorker)

  await sortButton(page, 'Research', 'Default').click()
  await expect(domainNames(page)).toHaveText([
    'alpha.example',
    'middle.example',
    'zeta.example',
  ])
  await expect(domainNames(second)).toHaveText([
    'alpha.example',
    'middle.example',
    'zeta.example',
  ])
  await page.reload()
  await expect(domainNames(page)).toHaveText([
    'alpha.example',
    'middle.example',
    'zeta.example',
  ])
  await sortButton(page, 'zeta.example', 'Default').click()
  await expect(sortedRows(page)).toHaveText(ascendingTitles)
  const custom = await extensionContext.newPage()
  await custom.goto(`${appUrl}#/saved-tabs?mode=custom`)
  await sortButton(custom, undefined, 'Default').click()
  await expect(sortedRows(custom)).toHaveText(ascendingTitles)
  expect(await readPersistenceV2SavedTabsSnapshot(serviceWorker)).toEqual(
    before,
  )
  const keys = [
    'savedTabsSort:category:category-sort',
    'savedTabsSort:domain:domain-0',
    'savedTabsSort:project:project-sort',
  ]
  const preferences = Object.fromEntries(keys.map((key) => [key, 'asc']))
  await expect
    .poll(async () => readStorage(serviceWorker, keys))
    .toEqual(preferences)

  const options = await extensionContext.newPage()
  await options.goto(`${appUrl}#/options`)
  const downloadPromise = options.waitForEvent('download')
  await options.getByRole('button', { name: /export/i }).click()
  const downloadPath = await (await downloadPromise).path()
  assert.ok(downloadPath, 'Backup download did not provide a file')
  const content = await readFile(downloadPath, 'utf8')
  BackupEnvelopeV2Schema.parse(JSON.parse(content))
  expect(content).not.toContain('savedTabsSort:')
  await options.getByRole('button', { name: /import/i }).click()
  await options.getByTestId('hidden-file-input').setInputFiles({
    name: 'sort-preferences-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(content),
  })
  const dialog = options.getByRole('dialog')
  await expect(
    dialog.getByRole('button', { name: 'Confirm Import' }),
  ).toBeEnabled()
  await dialog.getByRole('button', { name: 'Confirm Import' }).click()
  await expect(dialog).toBeHidden()
  expect(await readStorage(serviceWorker, keys)).toEqual(preferences)
  await page.reload()
  await custom.reload()
  await expect(domainNames(page)).toHaveText([
    'alpha.example',
    'middle.example',
    'zeta.example',
  ])
  await expect(sortedRows(page)).toHaveText(ascendingTitles)
  await expect(sortedRows(custom)).toHaveText(ascendingTitles)

  await sortButton(page, 'Research', 'Saved date ascending').click()
  await expect(domainNames(second)).toHaveText([
    'zeta.example',
    'middle.example',
    'alpha.example',
  ])
  await sortButton(page, 'Research', 'Saved date descending').click()
  await expect(domainNames(page)).toHaveText(manualDomains)
  await expect(domainNames(second)).toHaveText(manualDomains)
})
