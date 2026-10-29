import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { BackupEnvelopeV2Schema } from '@/features/options/lib/import-export/v2/BackupV2Schema'
import {
  createCustomCollectionFixture,
  createDomainCollectionFixture,
  createMembershipFixture,
  createUrlFixture,
} from '@/test/fixtures/persistenceBrowserFixtures'

import { exportFullBackup } from './helpers/backup-export'
import {
  createBaseSeed,
  defaultUserSettings,
  expect,
  getExtensionUrl,
  readPersistenceV2SavedTabsSnapshot,
  seedSavedTabsFixture,
  test,
} from './helpers/extension'
import {
  expectAnnouncement,
  startKeyboardDrag,
  tabTo,
} from './helpers/keyboard-dnd'

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
}, testInfo) => {
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
  await exportFullBackup(options)
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
    path:
      process.env.UPDATE_DOC_ASSETS === '1'
        ? 'docs/testing/assets/issue-912-favorites.png'
        : testInfo.outputPath('issue-912-favorites.png'),
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

for (const { mode, collectionId, rowTestId, filterName } of [
  {
    mode: 'domain',
    collectionId: 'domain',
    rowTestId: 'sortable-url-item',
    filterName: 'example.com',
  },
  {
    mode: 'custom',
    collectionId: 'project',
    rowTestId: 'project-url-item',
    filterName: 'Reading queue',
  },
]) {
  test(`${mode} favorites and regular tabs reorder only within their own bucket`, async ({
    extensionId,
    page,
    serviceWorker,
  }, testInfo) => {
    const savedAt = Date.now()
    const labels = ['Regular A', 'Favorite B', 'Regular C', 'Favorite D']
    const urls = labels.map((title, index) => ({
      ...createUrlFixture(
        `reorder-${index}`,
        `https://example.com/reorder-${index}`,
        title,
        savedAt,
      ),
      isFavorite: index % 2 === 1,
    }))
    await seedSavedTabsFixture(serviceWorker, {
      storage: createBaseSeed({ viewMode: mode }),
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
            createMembershipFixture(id, url.id, savedAt, index * 1024),
          ),
        ),
      },
    })
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto(
      `${getExtensionUrl(extensionId, 'app.html')}#/saved-tabs?mode=${mode}`,
    )
    const rows = page.getByTestId(rowTestId)
    const visibleTitles = rows.getByRole('link')
    const handle = (title: string) =>
      page.getByRole('button', {
        name: `Drag to reorder tab "${title}"`,
        exact: true,
      })
    const row = (title: string) =>
      rows.filter({ has: page.getByRole('link', { name: title, exact: true }) })
    const readOrder = async () =>
      (await readPersistenceV2SavedTabsSnapshot(serviceWorker)).memberships
        .filter(
          (membership: { collectionId: string }) =>
            membership.collectionId === collectionId,
        )
        .toSorted(
          (left: { sortOrder: number }, right: { sortOrder: number }) =>
            left.sortOrder - right.sortOrder,
        )
        .map((membership: { urlId: string }) => membership.urlId)
    const pointerMove = async (source: string, destination: string) => {
      const sourceHandle = handle(source)
      const sourceBox = await sourceHandle.boundingBox()
      const destinationBox = await row(destination).boundingBox()
      assert.ok(sourceBox)
      assert.ok(destinationBox)
      const x = sourceBox.x + sourceBox.width / 2
      const y = sourceBox.y + sourceBox.height / 2
      await page.mouse.move(x, y)
      await page.mouse.down()
      await page.mouse.move(x + 5, y + 5)
      await expect(sourceHandle).toHaveAttribute('aria-pressed', 'true')
      await page.mouse.move(x, destinationBox.y + destinationBox.height / 2, {
        steps: 10,
      })
      await page.mouse.up()
      await expect(sourceHandle).not.toHaveAttribute('aria-pressed', 'true')
    }
    await expect(visibleTitles).toHaveText([
      'Favorite B',
      'Favorite D',
      'Regular A',
      'Regular C',
    ])
    const before = await readPersistenceV2SavedTabsSnapshot(serviceWorker)

    await pointerMove('Favorite B', 'Favorite D')
    await expect(visibleTitles).toHaveText([
      'Favorite D',
      'Favorite B',
      'Regular A',
      'Regular C',
    ])
    await expect
      .poll(readOrder)
      .toEqual(['reorder-0', 'reorder-3', 'reorder-2', 'reorder-1'])
    await pointerMove('Regular A', 'Regular C')
    await expect(visibleTitles).toHaveText([
      'Favorite D',
      'Favorite B',
      'Regular C',
      'Regular A',
    ])
    const reordered = ['reorder-2', 'reorder-3', 'reorder-0', 'reorder-1']
    await expect.poll(readOrder).toEqual(reordered)

    await pointerMove('Favorite D', 'Regular C')
    expect(await readOrder()).toEqual(reordered)
    await pointerMove('Regular A', 'Favorite B')
    expect(await readOrder()).toEqual(reordered)
    await page.reload()
    await expect(visibleTitles).toHaveText([
      'Favorite D',
      'Favorite B',
      'Regular C',
      'Regular A',
    ])

    const lastFavoriteHandle = handle('Favorite B')
    await tabTo(page, lastFavoriteHandle)
    await startKeyboardDrag(page, lastFavoriteHandle, 'Enter')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    expect(await readOrder()).toEqual(reordered)
    await expect(visibleTitles).toHaveText([
      'Favorite D',
      'Favorite B',
      'Regular C',
      'Regular A',
    ])

    const filter = page.getByRole('button', {
      name: `Show only favorites in ${filterName}`,
      exact: true,
    })
    await filter.click()
    await expect(visibleTitles).toHaveText(['Favorite D', 'Favorite B'])
    const favoriteHandle = handle('Favorite D')
    await tabTo(page, favoriteHandle)
    await startKeyboardDrag(page, favoriteHandle, 'Space')
    await page.keyboard.press('ArrowDown')
    await expectAnnouncement(page, 'Favorite B')
    await page.keyboard.press('Space')
    await expect(visibleTitles).toHaveText(['Favorite B', 'Favorite D'])
    await expect
      .poll(readOrder)
      .toEqual(['reorder-2', 'reorder-1', 'reorder-0', 'reorder-3'])
    await filter.click()
    await expect(visibleTitles).toHaveText([
      'Favorite B',
      'Favorite D',
      'Regular C',
      'Regular A',
    ])
    await page.reload()
    await expect(visibleTitles).toHaveText([
      'Favorite B',
      'Favorite D',
      'Regular C',
      'Regular A',
    ])
    const after = await readPersistenceV2SavedTabsSnapshot(serviceWorker)
    expect(after.urls).toEqual(before.urls)
    const otherMemberships = (memberships: typeof after.memberships) =>
      memberships.filter(
        (membership: { collectionId: string }) =>
          membership.collectionId !== collectionId,
      )
    expect(otherMemberships(after.memberships)).toEqual(
      otherMemberships(before.memberships),
    )
    const screenshotPath = testInfo.outputPath(`${mode}-favorite-order.png`)
    await page.screenshot({ path: screenshotPath, fullPage: true })
    await testInfo.attach(`${mode}-favorite-order`, {
      path: screenshotPath,
      contentType: 'image/png',
    })
  })
}
