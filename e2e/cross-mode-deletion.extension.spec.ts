import type { Page } from '@playwright/test'

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
import { selectionSnapshotRestorationContent } from './helpers/selection'

const urlIds = ['a', 'b', 'c', 'd'] as const

const titles = {
  a: 'needle Alpha guide',
  b: 'Retained Alpha tab',
  c: 'needle Bravo guide',
  d: 'Retained Bravo tab',
}

const createCrossModeSeed = () => {
  const now = Date.now()
  const urls = urlIds.map((id, index) =>
    createUrlFixture(
      id,
      `https://${index < 2 ? 'alpha' : 'bravo'}.example/${id}`,
      titles[id],
      now,
    ),
  )
  return {
    persistence: {
      categories: [],
      collections: [
        createDomainCollectionFixture('alpha', 'alpha.example', now),
        createDomainCollectionFixture('bravo', 'bravo.example', now, 1),
        createCustomCollectionFixture('research', 'Research', now),
        createCustomCollectionFixture('reading', 'Reading', now, 1),
      ],
      groups: [],
      memberships: [
        ...urls.map(({ id }, index) =>
          createMembershipFixture(
            index < 2 ? 'alpha' : 'bravo',
            id,
            now,
            index,
          ),
        ),
        ...['a', 'b', 'c'].map((id, index) =>
          createMembershipFixture('research', id, now, index),
        ),
        ...['c', 'd'].map((id, index) =>
          createMembershipFixture('reading', id, now, index),
        ),
      ],
      urls,
    },
    storage: createBaseSeed({
      userSettings: {
        ...defaultUserSettings,
        removeTabAfterOpen: false,
      },
      viewMode: 'custom',
    }),
  }
}

const switchMode = async (page: Page, mode: 'Domain mode' | 'Custom mode') => {
  await page.getByRole('combobox', { name: 'Switch view mode' }).press('Enter')
  await page.getByRole('option', { name: mode, exact: true }).press('Enter')
}

const projectCard = (page: Page, name: string) =>
  page
    .locator('[data-saved-tabs-scroll-target="project"]')
    .filter({ has: page.getByText(name, { exact: true }) })

const undoToastShown = 'custom-deletion-undo-toast-shown'

const markUndoToastWhenMounted = async (page: Page) =>
  page.evaluate((mark) => {
    const observer = new MutationObserver(() => {
      const action = document.querySelector(
        '[data-sonner-toast][data-mounted="true"][data-visible="true"] button[data-action]',
      )
      if (action) {
        performance.mark(mark)
        observer.disconnect()
      }
    })
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-mounted', 'data-visible'],
      childList: true,
      subtree: true,
    })
  }, undoToastShown)

const scenarios = [
  {
    name: 'single',
    removedIds: ['a'],
    remove: async (page: Page) => {
      const row = projectCard(page, 'Research')
        .getByTestId('project-url-item')
        .filter({ hasText: titles.a })
      await row.hover()
      await row
        .getByRole('button', { name: `Delete tab: ${titles.a}`, exact: true })
        .click()
    },
  },
  {
    name: 'filtered bulk',
    removedIds: ['a', 'c'],
    remove: async (page: Page) => {
      await page.getByPlaceholder('Search', { exact: true }).fill('needle')
      const research = projectCard(page, 'Research')
      await expect(research.getByTestId('project-url-item')).toHaveCount(2)
      await research
        .getByRole('button', { name: 'Delete all', exact: true })
        .click()
    },
  },
  {
    name: 'selected bulk',
    removedIds: ['a', 'c'],
    remove: async (page: Page) => {
      await page
        .getByRole('button', { name: 'Select tabs', exact: true })
        .click()
      await projectCard(page, 'Research')
        .getByRole('checkbox', { name: `Select ${titles.a}`, exact: true })
        .click()
      await projectCard(page, 'Reading')
        .getByRole('checkbox', { name: `Select ${titles.c}`, exact: true })
        .click()
      await page
        .getByRole('button', { name: 'Delete selected', exact: true })
        .click()
    },
  },
]

for (const { name, removedIds, remove } of scenarios) {
  test(`custom ${name} deletion synchronizes both modes and Undo survives reload`, async ({
    extensionId,
    page,
    serviceWorker,
  }) => {
    await seedSavedTabsFixture(serviceWorker, createCrossModeSeed())
    await page.goto(
      getExtensionUrl(extensionId, 'app.html#/saved-tabs?mode=custom'),
    )
    await expect(page.getByTestId('project-url-item')).toHaveCount(5)
    const before = await readPersistenceV2SavedTabsSnapshot(serviceWorker)
    // Capture the display time while the storage and mode assertions run.
    await markUndoToastWhenMounted(page)
    await remove(page)
    await page.mouse.move(0, 0)

    const retainedIds = urlIds.filter((id) => !removedIds.includes(id))
    await expect
      .poll(async () => {
        const snapshot = await readPersistenceV2SavedTabsSnapshot(serviceWorker)
        return {
          urls: snapshot.urls.map(({ id }: { id: string }) => id).toSorted(),
          memberships: snapshot.memberships
            .map(({ urlId }: { urlId: string }) => urlId)
            .toSorted(),
        }
      })
      .toEqual({
        urls: retainedIds,
        memberships: before.memberships
          .map(({ urlId }: { urlId: string }) => urlId)
          .filter((id: string) => !removedIds.includes(id))
          .toSorted(),
      })

    await page.getByPlaceholder('Search', { exact: true }).fill('')
    await switchMode(page, 'Domain mode')
    await expect(
      page.getByTestId('sortable-url-item').getByRole('link'),
    ).toHaveText(retainedIds.map((id) => titles[id]))
    const undo = page.getByRole('button', { name: 'Undo', exact: true })
    await expect(undo).toBeVisible()
    await expect
      .poll(
        async () =>
          page.evaluate((mark) => {
            const shown = performance.getEntriesByName(mark, 'mark').at(0)
            const now = performance.now()
            return now - (shown?.startTime ?? now)
          }, undoToastShown),
        { timeout: 7_000 },
      )
      .toBeGreaterThanOrEqual(5_000)
    await expect(undo).toBeVisible()
    await undo.click()
    await expect
      .poll(async () =>
        selectionSnapshotRestorationContent(
          await readPersistenceV2SavedTabsSnapshot(serviceWorker),
        ),
      )
      .toEqual(selectionSnapshotRestorationContent(before))

    await page.reload()
    await expect(
      page.getByTestId('sortable-url-item').getByRole('link'),
    ).toHaveText(Object.values(titles))
    await switchMode(page, 'Custom mode')
    await expect(page.getByTestId('project-url-item')).toHaveCount(5)

    // Undo keeps both representations usable: deleting the same URLs again
    // must persist when the extension page is subsequently reloaded.
    await remove(page)
    await expect
      .poll(async () => {
        const snapshot = await readPersistenceV2SavedTabsSnapshot(serviceWorker)
        return snapshot.urls.map(({ id }: { id: string }) => id).toSorted()
      })
      .toEqual(retainedIds)
    await page.getByPlaceholder('Search', { exact: true }).fill('')
    await switchMode(page, 'Domain mode')
    await page.reload()
    await expect(
      page.getByTestId('sortable-url-item').getByRole('link'),
    ).toHaveText(retainedIds.map((id) => titles[id]))
    await switchMode(page, 'Custom mode')
    await expect(page.getByTestId('project-url-item')).toHaveCount(
      before.memberships.filter(
        ({ collectionId, urlId }: { collectionId: string; urlId: string }) =>
          ['research', 'reading'].includes(collectionId) &&
          !removedIds.includes(urlId),
      ).length,
    )
  })
}
