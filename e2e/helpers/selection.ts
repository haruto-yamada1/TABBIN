import { createServer } from 'node:http'

import { AxeBuilder } from '@axe-core/playwright'
import type { Page, TestInfo, Worker } from '@playwright/test'

import {
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

type SelectionScenario = {
  appUrl: string
  page: Page
  serviceWorker: Pick<Worker, 'evaluate'>
}

type RankedSelectionRecord = Record<string, unknown> & {
  id: string
  sortOrder: number
  updatedAt: number
  groupId?: string
}

type SelectionSnapshot = {
  categories: unknown[]
  collections: RankedSelectionRecord[]
  groups: RankedSelectionRecord[]
  revision: unknown
  memberships: { urlId: string }[]
  urls: { id: string; title: string }[]
}

const readSelectionSnapshot = async (
  serviceWorker: Pick<Worker, 'evaluate'>,
): Promise<SelectionSnapshot> =>
  readPersistenceV2SavedTabsSnapshot(serviceWorker)

// Existing snapshot restoration stamps group/collection updatedAt and flattens
// separate parent-group ordering contexts. Compare every other field and the
// complete manual order within each parent, alongside the exact revision below.
export const selectionSnapshotRestorationContent = (
  snapshot: SelectionSnapshot,
) => ({
  urls: snapshot.urls,
  memberships: snapshot.memberships,
  categories: snapshot.categories,
  groups: snapshot.groups.map(({ updatedAt: _updatedAt, ...group }) => group),
  collections: snapshot.collections.map(
    ({ updatedAt: _updatedAt, sortOrder: _sortOrder, ...collection }) =>
      collection,
  ),
  domainOrder: Array.from(
    new Set(snapshot.collections.map(({ groupId }) => groupId ?? '')),
  )
    .toSorted((left, right) => left.localeCompare(right))
    .map((groupId) => ({
      groupId,
      ids: snapshot.collections
        .filter((collection) => (collection.groupId ?? '') === groupId)
        .toSorted((left, right) => left.sortOrder - right.sortOrder)
        .map(({ id }) => id),
    })),
})

const titles = [
  'Alpha guide',
  'Alpha loose tab',
  'Charlie first tab',
  'Charlie second tab',
  'Bravo guide',
  'Bravo loose tab',
] as const

export const createSelectionSeed = (confirmDeleteAll: boolean) => {
  const now = Date.now()
  const collections = [
    { id: 'alpha', domain: 'alpha.example', group: 'reference' },
    { id: 'bravo', domain: 'bravo.example', group: 'reading' },
    { id: 'charlie', domain: 'charlie.example', group: 'reference' },
  ]
  // Collection order deliberately differs from the rendered parent-group order.
  const entries = [
    { id: 'alpha-loose', collection: 'alpha', title: titles[1] },
    { id: 'bravo-guide', collection: 'bravo', title: titles[4] },
    { id: 'charlie-first', collection: 'charlie', title: titles[2] },
    { id: 'alpha-guide', collection: 'alpha', title: titles[0] },
    { id: 'bravo-loose', collection: 'bravo', title: titles[5] },
    { id: 'charlie-second', collection: 'charlie', title: titles[3] },
  ]
  return {
    persistence: {
      categories: ['alpha', 'bravo'].map((collectionId) => ({
        collectionId,
        createdAt: now,
        id: `${collectionId}:guides`,
        keywords: [],
        name: 'Guides',
        sortOrder: 0,
        updatedAt: now,
      })),
      collections: collections.map(({ id, domain, group }, index) => ({
        ...createDomainCollectionFixture(id, domain, now, index),
        groupId: group,
      })),
      groups: ['reference', 'reading'].map((id, sortOrder) => ({
        createdAt: now,
        id,
        name: id === 'reference' ? 'Reference' : 'Reading',
        sortOrder,
        updatedAt: now,
      })),
      memberships: entries.map(({ id, collection }, index) => ({
        ...createMembershipFixture(collection, id, now, index),
        ...(id.endsWith('-guide')
          ? { categoryId: `${collection}:guides` }
          : {}),
      })),
      urls: entries.map(({ id, collection, title }) =>
        createUrlFixture(id, `https://${collection}.example/${id}`, title, now),
      ),
    },
    storage: createBaseSeed({
      userSettings: {
        ...defaultUserSettings,
        confirmDeleteAll,
        removeTabAfterOpen: false,
      },
    }),
  }
}

const checkbox = (page: Page, title: string) =>
  page.getByRole('checkbox', { name: `Select ${title}`, exact: true })

const selectedTitles = async (page: Page): Promise<string[]> =>
  page
    .getByRole('checkbox', { checked: true })
    .evaluateAll((elements) =>
      elements.map((element) =>
        (element.getAttribute('aria-label') ?? '').replace(/^Select /u, ''),
      ),
    )

const expectSelected = async (
  page: Page,
  expected: readonly string[],
): Promise<void> => {
  await expect.poll(async () => selectedTitles(page)).toEqual(expected)
  await expect(
    page.getByRole('status').filter({
      hasText: `${expected.length} tabs selected`,
    }),
  ).toBeVisible()
}

const startSelection = async (
  { appUrl, page, serviceWorker }: SelectionScenario,
  confirmDeleteAll: boolean,
): Promise<void> => {
  await seedSavedTabsFixture(
    serviceWorker,
    createSelectionSeed(confirmDeleteAll),
  )
  await page.goto(appUrl)
  await expect(
    page.getByTestId('sortable-url-item').getByRole('link'),
  ).toHaveText(titles)
  await expect(page.getByRole('checkbox')).toHaveCount(0)
  await page.getByRole('button', { name: 'Select tabs', exact: true }).click()
  await expect(page.getByRole('checkbox')).toHaveCount(titles.length)
  await expectSelected(page, [])
  await expect(
    page.getByRole('button', { name: 'Open selected', exact: true }),
  ).toBeDisabled()
  await expect(
    page.getByRole('button', { name: 'Delete selected', exact: true }),
  ).toBeDisabled()
}

const attachSelectionScreenshot = async (
  page: Page,
  testInfo: TestInfo,
  name: string,
): Promise<void> => {
  const screenshotPath = testInfo.outputPath(`${name}.png`)
  await page.screenshot({
    animations: 'disabled',
    fullPage: true,
    path: screenshotPath,
  })
  await testInfo.attach(name, {
    contentType: 'image/png',
    path: screenshotPath,
  })
}

/* eslint-disable no-await-in-loop -- theme changes and modal transitions must be tested sequentially on the same browser page */
const verifySelectionContrast = async (
  page: Page,
  testInfo: TestInfo,
): Promise<void> => {
  const reports = []
  for (const scheme of ['light', 'dark'] as const) {
    // The seeded system theme resolves the browser preference when mounted.
    await page.emulateMedia({ colorScheme: scheme })
    await page.reload()
    await expect(page.locator('html')).toHaveClass(scheme)
    await page.getByRole('button', { name: 'Select tabs', exact: true }).click()
    await checkbox(page, titles[1]).click()
    await checkbox(page, titles[4]).click()
    for (const scope of ['toolbar', 'confirmation'] as const) {
      if (scope === 'confirmation') {
        await page
          .getByRole('button', { name: 'Delete selected', exact: true })
          .click()
        await expect(page.getByRole('alertdialog')).toBeVisible()
        await page.getByRole('alertdialog').evaluate(async (element) => {
          await Promise.all(
            element
              .getAnimations({ subtree: true })
              .map(async (animation) =>
                animation.finished.catch(() => undefined),
              ),
          )
        })
      }
      const selector =
        scope === 'toolbar'
          ? 'fieldset[aria-label="Saved tab selection"]'
          : '[role="alertdialog"]'
      const result = await new AxeBuilder({ page })
        .include(selector)
        .withRules(['color-contrast'])
        .analyze()
      const checked = [
        ...result.passes,
        ...result.violations,
        ...result.incomplete,
      ]
        .filter(({ id }) => id === 'color-contrast')
        .flatMap(({ nodes }) => nodes)
      const examinedDelete = await page
        .locator(selector)
        .getByRole('button', { name: 'Delete selected', exact: true })
        .evaluate(
          (element, targets) =>
            targets.some(
              (target) =>
                target.length === 1 &&
                typeof target[0] === 'string' &&
                element.matches(target[0]),
            ),
          checked.map(({ target }) => target),
        )
      reports.push({
        scheme,
        scope,
        examinedDelete,
        violations: result.violations.map(({ id, nodes }) => ({
          id,
          nodes: nodes.map(({ target, failureSummary }) => ({
            target,
            failureSummary,
          })),
        })),
        incomplete: result.incomplete.map(({ id }) => id),
      })
      if (scope === 'confirmation') {
        await page
          .getByRole('alertdialog')
          .getByRole('button', { name: 'Cancel', exact: true })
          .click()
      }
    }
  }
  await page.emulateMedia({ colorScheme: 'light' })
  await page.reload()
  await expect(page.locator('html')).toHaveClass('light')
  await page.getByRole('button', { name: 'Select tabs', exact: true }).click()
  await checkbox(page, titles[1]).click()
  await checkbox(page, titles[4]).click()
  await testInfo.attach('selection-color-contrast', {
    body: JSON.stringify(reports, null, 2),
    contentType: 'application/json',
  })
  expect(reports).toEqual(
    ['light', 'dark'].flatMap((scheme) =>
      ['toolbar', 'confirmation'].map((scope) => ({
        scheme,
        scope,
        examinedDelete: true,
        violations: [],
        incomplete: [],
      })),
    ),
  )
}

/* eslint-enable no-await-in-loop */

export const verifySelectionRangeAndUndo = async (
  scenario: SelectionScenario,
  testInfo: TestInfo,
): Promise<void> => {
  const { page, serviceWorker } = scenario
  await startSelection(scenario, true)
  const original = await readSelectionSnapshot(serviceWorker)

  await checkbox(page, titles[1]).click()
  await checkbox(page, titles[4]).click({ modifiers: ['Shift'] })
  await expectSelected(page, titles.slice(1, 5))
  await checkbox(page, titles[2]).click({ modifiers: ['ControlOrMeta'] })
  await checkbox(page, titles[3]).click({ modifiers: ['Meta'] })
  await expectSelected(page, [titles[1], titles[4]])
  await page.getByRole('link', { name: titles[5], exact: true }).click()
  await expectSelected(page, [titles[1], titles[4], titles[5]])
  await page
    .getByRole('link', { name: titles[5], exact: true })
    .click({ modifiers: ['ControlOrMeta'] })
  await expectSelected(page, [titles[1], titles[4]])
  await page
    .getByRole('link', { name: titles[2], exact: true })
    .click({ button: 'middle' })
  await expectSelected(page, [titles[1], titles[4]])
  expect(
    page
      .context()
      .pages()
      .filter((tab) => tab.url().startsWith('https://')),
  ).toHaveLength(0)
  await verifySelectionContrast(page, testInfo)
  await attachSelectionScreenshot(page, testInfo, 'cross-domain-selection')

  await page
    .getByRole('button', { name: 'Delete selected', exact: true })
    .click()
  const dialog = page.getByRole('alertdialog', {
    name: 'Delete 2 selected tabs?',
    exact: true,
  })
  await expect(dialog).toHaveAccessibleDescription(
    'The selected tabs and matching Custom entries will be deleted. You can undo this deletion.',
  )
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expectSelected(page, [titles[1], titles[4]])
  expect(await readSelectionSnapshot(serviceWorker)).toEqual(original)

  await page
    .getByRole('button', { name: 'Delete selected', exact: true })
    .click()
  await dialog
    .getByRole('button', { name: 'Delete selected', exact: true })
    .click()
  const removedIds = new Set(['alpha-loose', 'bravo-guide'])
  await expect
    .poll(async () =>
      (await readSelectionSnapshot(serviceWorker)).memberships
        .map(({ urlId }) => urlId)
        .toSorted((left, right) => left.localeCompare(right)),
    )
    .toEqual(
      original.memberships
        .filter(({ urlId }) => !removedIds.has(urlId))
        .map(({ urlId }) => urlId)
        .toSorted((left, right) => left.localeCompare(right)),
    )
  const deleted = await readSelectionSnapshot(serviceWorker)
  expect(deleted.revision).toBe(Number(original.revision) + 1)
  expect(
    deleted.urls
      .map(({ id }) => id)
      .toSorted((left, right) => left.localeCompare(right)),
  ).toEqual(
    original.urls
      .filter(({ id }) => !removedIds.has(id))
      .map(({ id }) => id)
      .toSorted((left, right) => left.localeCompare(right)),
  )
  await expect(
    page.getByTestId('sortable-url-item').getByRole('link'),
  ).toHaveText([titles[0], titles[2], titles[3], titles[5]])

  const undo = page.getByRole('button', { name: 'Undo', exact: true })
  await expect(undo).toHaveCount(1)
  await undo.click()
  await expect
    .poll(async () =>
      selectionSnapshotRestorationContent(
        await readSelectionSnapshot(serviceWorker),
      ),
    )
    .toEqual(selectionSnapshotRestorationContent(original))
  expect((await readSelectionSnapshot(serviceWorker)).revision).toBe(
    Number(original.revision) + 2,
  )
  await page.reload()
  await expect(
    page.getByTestId('sortable-url-item').getByRole('link'),
  ).toHaveText(titles)
}

export const verifySelectionSearchAndVisibility = async (
  scenario: SelectionScenario,
): Promise<void> => {
  const { page, serviceWorker } = scenario
  await startSelection(scenario, false)
  await checkbox(page, titles[0]).click()
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.getByRole('checkbox')).toHaveCount(0)
  await page.getByRole('button', { name: 'Select tabs', exact: true }).click()
  await expectSelected(page, [])
  await checkbox(page, titles[0]).click()
  await page
    .getByRole('button', { name: 'Collapse "alpha.example"', exact: true })
    .click()
  await expectSelected(page, [])
  await page
    .getByRole('button', { name: 'Select all visible', exact: true })
    .click()
  await expectSelected(page, titles.slice(2))
  await page
    .getByRole('button', { name: 'Clear selection', exact: true })
    .click()
  await expectSelected(page, [])
  await page
    .getByRole('button', { name: 'Expand "alpha.example"', exact: true })
    .click()
  await checkbox(page, titles[0]).click()

  const search = page.getByPlaceholder('Search', { exact: true })
  await search.fill('Bravo')
  await expectSelected(page, [])
  const deleteSelected = page.getByRole('button', {
    name: 'Delete selected',
    exact: true,
  })
  await expect(deleteSelected).toBeDisabled()
  await checkbox(page, titles[4]).click()
  await search.fill('Alpha')
  await expectSelected(page, [])
  await expect(deleteSelected).toBeDisabled()
  await page
    .getByRole('button', { name: 'Select all visible', exact: true })
    .click()
  await expectSelected(page, titles.slice(0, 2))
  await deleteSelected.click()
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await expect
    .poll(async () =>
      (await readSelectionSnapshot(serviceWorker)).urls
        .map(({ title }) => title)
        .toSorted((left, right) => left.localeCompare(right)),
    )
    .toEqual(
      titles.slice(2).toSorted((left, right) => left.localeCompare(right)),
    )
  await search.fill('')
  await page.reload()
  await expect(
    page.getByTestId('sortable-url-item').getByRole('link'),
  ).toHaveText(titles.slice(2))
}

export const createOpeningSelectionSeed = (origin: string) => {
  const now = Date.now()
  const alternateOrigin = origin.replace('127.0.0.1', 'localhost')
  const urls = [
    createUrlFixture('alpha-guide', `${origin}/alpha-guide`, titles[0], now),
    createUrlFixture('alpha-loose', `${origin}/alpha-loose`, titles[1], now),
    createUrlFixture(
      'bravo-guide',
      `${alternateOrigin}/bravo-guide`,
      titles[4],
      now,
    ),
  ]
  return {
    persistence: {
      categories: [],
      collections: [
        createDomainCollectionFixture('alpha', '127.0.0.1', now),
        createDomainCollectionFixture('bravo', 'localhost', now, 1),
      ],
      groups: [],
      memberships: urls.map(({ id }, index) =>
        createMembershipFixture(
          id.startsWith('alpha-') ? 'alpha' : 'bravo',
          id,
          now,
          index,
        ),
      ),
      urls,
    },
    storage: createBaseSeed({
      userSettings: { ...defaultUserSettings, removeTabAfterOpen: false },
    }),
  }
}

export const verifySelectionOpening = async (
  scenario: SelectionScenario,
): Promise<void> => {
  const { appUrl, page, serviceWorker } = scenario
  // Native browser.tabs-created targets need a real reachable URL from their
  // first request; a routing interceptor can attach after that navigation.
  const server = createServer((_request, response) => {
    response.setHeader('Content-Type', 'text/html')
    response.end('<title>Selected tab fixture</title>')
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  try {
    const address = server.address()
    if (!address || typeof address === 'string') {
      throw new Error('Selection opening fixture did not bind a TCP port')
    }
    const seed = createOpeningSelectionSeed(`http://127.0.0.1:${address.port}`)
    const [firstUrl, , secondUrl] = seed.persistence.urls
    if (!firstUrl || !secondUrl) {
      throw new Error('Selection fixture is incomplete')
    }
    await seedSavedTabsFixture(serviceWorker, seed)
    await page.goto(appUrl)
    await expect(page.getByRole('checkbox')).toHaveCount(0)
    const normalLink = page.getByRole('link', { name: titles[0], exact: true })
    await expect(normalLink).toHaveAttribute('href', firstUrl.url)
    const normalPagePromise = page.context().waitForEvent('page')
    await normalLink.click()
    const normalPage = await normalPagePromise
    await expect(normalPage).toHaveURL(firstUrl.url)
    await normalPage.close()

    await page.getByRole('button', { name: 'Select tabs', exact: true }).click()
    await checkbox(page, titles[0]).focus()
    await page.keyboard.press('Space')
    await checkbox(page, titles[4]).click()
    await expectSelected(page, [titles[0], titles[4]])
    const original = await readSelectionSnapshot(serviceWorker)
    await page
      .getByRole('button', { name: 'Open selected', exact: true })
      .click()
    await expect
      .poll(() =>
        page
          .context()
          .pages()
          .map((openedPage) => openedPage.url())
          .filter((url) => url.startsWith('http://'))
          .toSorted((left, right) => left.localeCompare(right)),
      )
      .toEqual(
        [firstUrl.url, secondUrl.url].toSorted((left, right) =>
          left.localeCompare(right),
        ),
      )
    expect(await readSelectionSnapshot(serviceWorker)).toEqual(original)
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error)
        } else {
          resolve()
        }
      })
      server.closeAllConnections()
    })
  }
}
