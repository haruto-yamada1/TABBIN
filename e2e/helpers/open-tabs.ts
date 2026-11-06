import { expect } from '@playwright/test'
import type { BrowserContext, Locator, Page } from '@playwright/test'

import {
  createCustomCollectionFixture,
  createDomainCollectionFixture,
  createMembershipFixture,
  createUrlFixture,
} from '@/test/fixtures/persistenceBrowserFixtures'

import {
  createBaseSeed,
  defaultUserSettings,
  readPersistenceV2SavedTabsSnapshot,
  readPersistenceV2Store,
  seedSavedTabsFixture,
} from './extension'
import {
  expectAnnouncement,
  expectInstructions,
  startKeyboardDrag,
  tabTo,
  waitForRestoredFocus,
} from './keyboard-dnd'

declare global {
  // eslint-disable-next-line typescript/consistent-type-definitions -- test-only browser probe
  interface Window {
    __openTabsQueryCount: number
  }
}

const firstUrl = 'https://open-tabs.example.test/article'
const secondUrl = 'https://open-tabs.example.test/other'
const hashUrl = `${firstUrl}#section`

const createOpenTabsFixture = () => {
  const now = Date.now()
  const urls = [
    createUrlFixture('open-first', firstUrl, 'Saved article', now),
    createUrlFixture('open-second', secondUrl, 'Other saved article', now),
    createUrlFixture('open-hash', hashUrl, 'Article section', now),
  ]
  return {
    storage: createBaseSeed({
      userSettings: {
        ...defaultUserSettings,
        removeTabAfterOpen: false,
        showOpenTabs: true,
      },
    }),
    persistence: {
      categories: [],
      collections: [
        createDomainCollectionFixture(
          'open-domain',
          'open-tabs.example.test',
          now,
        ),
        createCustomCollectionFixture('open-project', 'Reading queue', now),
      ],
      groups: [],
      memberships: urls.flatMap((url, index) => [
        createMembershipFixture('open-domain', url.id, now, index),
        createMembershipFixture('open-project', url.id, now, index),
      ]),
      urls,
    },
  }
}

const savedRowsScope = (page: Page, mode: 'domain' | 'custom'): Locator =>
  mode === 'domain'
    ? // 「今開いているタブ」セクションの行 (data-category-context="open-tabs") を除外
      page.locator(
        'li[data-testid="sortable-url-item"]:not([data-category-context="open-tabs"])',
      )
    : // custom モードはプロジェクト行のみ (セクション行は sortable-url-item)
      page.locator('li[data-testid="project-url-item"]')

const row = (page: Page, title: string, mode: 'domain' | 'custom' = 'custom') =>
  savedRowsScope(page, mode).filter({
    has: page.getByRole('link', { name: title, exact: true }),
  })

const dragHandle = (targetRow: Locator) =>
  targetRow.getByRole('button', {
    name: /^(Drag to reorder tab|ドラッグしてタブ)/u,
  })

const expectOpenState = async (
  targetRow: Locator,
  isOpen: boolean,
  label = 'Open now',
) => {
  const handle = dragHandle(targetRow)
  const icon = handle.locator('svg')
  const stateText = targetRow.getByText(label, { exact: true })
  await expect(
    targetRow.page().getByRole('tooltip', { name: label, exact: true }),
  ).toBeHidden()
  await expect(handle).toHaveAccessibleDescription(
    /Space.*Enter.*(?:arrow|矢印キー).*Escape/iu,
  )
  if (isOpen) {
    await expect(stateText).toHaveCount(1)
    await expect(stateText).toHaveClass(/\bsr-only\b/u)
    await expect(handle).toHaveAttribute('aria-description', label)
    await expect(handle).toHaveAccessibleDescription(
      /Space.*Enter.*(?:arrow|矢印キー).*Escape.*(?:Open now|開いています)/iu,
    )
    await expect(icon).toHaveClass(/\btext-emerald-600\b/u)
    await expect(icon).toHaveClass(/\bdark:text-emerald-400\b/u)
  } else {
    await expect(stateText).toHaveCount(0)
    await expect(handle).not.toHaveAttribute('aria-description')
    await expect(icon).toHaveClass(/\btext-muted-foreground\b/u)
    await expect(icon).not.toHaveClass(/\btext-emerald-600\b/u)
  }
}

const expectHoverTooltip = async (
  page: Page,
  handle: Locator,
  label = 'Open now',
) => {
  await page.bringToFront()
  const tooltip = page.getByRole('tooltip', { name: label, exact: true })
  await expect(tooltip).toBeHidden()
  // Hover the actual activator's center, where its nested grip icon is drawn.
  await handle.hover()
  await expect(tooltip).toHaveText(label)
  const viewport = page.viewportSize()
  if (!viewport) {
    throw new Error(
      'Open-tab scenarios require a viewport to move the pointer away',
    )
  }
  await page.mouse.move(viewport.width - 1, viewport.height - 1, { steps: 12 })
  await expect(tooltip).toBeHidden()
}

const routeOpenTabFixture = async (context: BrowserContext) => {
  await context.route('https://open-tabs.example.test/**', async (route) => {
    await route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Local tab fixture</title><h1>Article</h1>',
    })
  })
}

export const verifyOpenTabsDisplaySetting = async ({
  page,
  context,
  appUrl,
}: {
  page: Page
  context: BrowserContext
  appUrl: string
}) => {
  await routeOpenTabFixture(context)
  await page.goto(`${appUrl}#/options`)
  const fixture = createOpenTabsFixture()
  const { showOpenTabs: _showOpenTabs, ...legacySettings } = defaultUserSettings
  await seedSavedTabsFixture(page, {
    ...fixture,
    storage: createBaseSeed({
      userSettings: { ...legacySettings, removeTabAfterOpen: false },
    }),
  })
  const live = await context.newPage()
  await live.goto(firstUrl)
  const verifyMode = async (
    mode: 'domain' | 'custom',
    enabled: boolean,
    reload = false,
  ) => {
    await page.goto(`${appUrl}#/saved-tabs?mode=${mode}`)
    await expectOpenState(row(page, 'Saved article', mode), true)
    await expect(page.getByTestId('open-tabs-section')).toHaveCount(
      enabled ? 1 : 0,
    )
    if (reload) {
      await page.reload()
      await expect(page.getByTestId('open-tabs-section')).toHaveCount(
        enabled ? 1 : 0,
      )
    }
  }
  await verifyMode('domain', true, true)
  await verifyMode('custom', true, true)
  const options = await context.newPage()
  await options.goto(`${appUrl}#/options`)
  const checkbox = options.getByRole('checkbox', {
    name: 'Show currently open tabs',
    exact: true,
  })
  await expect(checkbox).toBeChecked()
  await checkbox.uncheck()
  await expect(page.getByTestId('open-tabs-section')).toHaveCount(0)
  await options.reload()
  await expect(checkbox).not.toBeChecked()
  await expectOpenState(row(page, 'Saved article', 'custom'), true)
  await verifyMode('domain', false, true)
  await verifyMode('custom', false, true)
  await checkbox.check()
  await expect(page.getByTestId('open-tabs-section')).toBeVisible()
  await options.reload()
  await expect(checkbox).toBeChecked()
  await checkbox.scrollIntoViewIfNeeded()
  await options.screenshot({
    path: '/tmp/tabbin-open-tabs-publish/options.png',
  })
  await verifyMode('domain', true, true)
  await verifyMode('custom', true, true)
  await options.close()
  await live.close()
}

export const verifyOpenTabs = async ({
  page,
  context,
  appUrl,
  mode,
  screenshots,
}: {
  page: Page
  context: BrowserContext
  appUrl: string
  mode: 'domain' | 'custom'
  screenshots?: { desktop: string; narrow: string }
}) => {
  await routeOpenTabFixture(context)
  await page.goto(`${appUrl}#/options`)
  await seedSavedTabsFixture(page, createOpenTabsFixture())
  const persistenceBefore = await readPersistenceV2SavedTabsSnapshot(page)
  await page.addInitScript(() => {
    window.__openTabsQueryCount = 0
    const browserApi: unknown = Reflect.get(globalThis, 'browser')
    const api = browserApi ?? chrome
    if (typeof api !== 'object' || !('tabs' in api)) {
      return
    }
    const tabs: unknown = api.tabs
    if (
      typeof tabs !== 'object' ||
      tabs === null ||
      !('query' in tabs) ||
      typeof tabs.query !== 'function'
    ) {
      return
    }
    const query = tabs.query
    Object.defineProperty(tabs, 'query', {
      value: (...args: unknown[]) => {
        window.__openTabsQueryCount += 1
        const result: unknown = Reflect.apply(query, tabs, args)
        return result
      },
    })
  })

  // Init scripts run on document loads, not same-document hash navigation.
  await page.reload()
  const existing = await context.newPage()
  await existing.goto(firstUrl)
  await page.goto(`${appUrl}#/saved-tabs?mode=${mode}`)
  const firstRow = row(page, 'Saved article', mode)
  const secondRow = row(page, 'Other saved article', mode)
  const hashRow = row(page, 'Article section', mode)
  await expectOpenState(firstRow, true)
  {
    // 保存カード/project 行に加え、「今開いているタブ」セクションにも同じ URL の行が出る
    await expect(
      page.locator('[data-testid="open-tabs-section"] li').filter({
        has: page.getByRole('link', { name: 'Saved article', exact: true }),
      }),
    ).toBeVisible()
  }
  await expectOpenState(secondRow, false)
  await expectOpenState(hashRow, false)
  await expectHoverTooltip(page, dragHandle(firstRow))
  expect(await page.evaluate(() => window.__openTabsQueryCount)).toBe(1)

  // A second matching browser tab keeps the green grip after either closes.
  const duplicate = await context.newPage()
  await duplicate.goto(firstUrl)
  await existing.close()
  await expectOpenState(firstRow, true)
  await duplicate.close()
  await expectOpenState(firstRow, false)

  const live = await context.newPage()
  await live.goto(firstUrl)
  await expectOpenState(firstRow, true)
  await live.goto(secondUrl)
  await expectOpenState(firstRow, false)
  await expectOpenState(secondRow, true)
  await live.goto(hashUrl)
  await expectOpenState(secondRow, false)
  await expectOpenState(hashRow, true)
  await expectOpenState(firstRow, false)
  // Neither title/status events nor membership changes re-query every tab.
  await live.evaluate(() => {
    document.title = 'Updated article title'
  })
  expect(await page.evaluate(() => window.__openTabsQueryCount)).toBe(1)

  await page.reload()
  await expectOpenState(hashRow, true)
  await expectOpenState(firstRow, false)
  await expectHoverTooltip(page, dragHandle(hashRow))
  expect(await page.evaluate(() => window.__openTabsQueryCount)).toBe(1)

  if (screenshots) {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.screenshot({ path: screenshots.desktop })
    await page.evaluate(async () => {
      const { userSettings } = await chrome.storage.local.get('userSettings')
      await chrome.storage.local.set({
        userSettings: { ...userSettings, language: 'ja' },
      })
    })
    await page.setViewportSize({ width: 420, height: 900 })
    await expectOpenState(hashRow, true, '開いています')
    await expectHoverTooltip(page, dragHandle(hashRow), '開いています')
    await page.screenshot({ path: screenshots.narrow })
  }

  await live.close()
  await expectOpenState(
    hashRow,
    false,
    screenshots ? '開いています' : 'Open now',
  )
  // 開いているタブがなくなればセクションは消える
  await expect(page.getByTestId('open-tabs-section')).toHaveCount(0)
  expect(await readPersistenceV2SavedTabsSnapshot(page)).toEqual(
    persistenceBefore,
  )
}

export const verifyOpenTabDragging = async ({
  page,
  context,
  appUrl,
  mode,
}: {
  page: Page
  context: BrowserContext
  appUrl: string
  mode: 'domain' | 'custom'
}) => {
  await routeOpenTabFixture(context)
  await page.goto(`${appUrl}#/options`)
  await seedSavedTabsFixture(page, createOpenTabsFixture())
  const before = await readPersistenceV2SavedTabsSnapshot(page)
  const readMemberships = async () =>
    readPersistenceV2Store<ReturnType<typeof createMembershipFixture>>(
      page,
      'collectionMemberships',
    )
  const beforeMemberships = await readMemberships()
  const beforeCollections = await readPersistenceV2Store<
    | ReturnType<typeof createCustomCollectionFixture>
    | ReturnType<typeof createDomainCollectionFixture>
  >(page, 'collections')
  const opened = await context.newPage()
  await opened.goto(firstUrl)
  await page.goto(`${appUrl}#/saved-tabs?mode=${mode}`)
  await page.bringToFront()

  const collectionId = mode === 'domain' ? 'open-domain' : 'open-project'
  const links = (
    mode === 'domain'
      ? savedRowsScope(page, mode)
      : page.getByTestId('project-url-item')
  ).getByRole('link')
  const firstRow = row(page, 'Saved article', mode)
  const handle = dragHandle(firstRow)
  const secondHandle = dragHandle(row(page, 'Other saved article', mode))
  const originalTitles = [
    'Saved article',
    'Other saved article',
    'Article section',
  ]
  const pointerTitles = [
    'Other saved article',
    'Saved article',
    'Article section',
  ]
  const readOrder = async () => {
    const memberships = await readMemberships()
    return memberships
      .filter((membership) => membership.collectionId === collectionId)
      .toSorted((left, right) => left.sortOrder - right.sortOrder)
      .map(({ urlId }) => urlId)
  }

  await expect(links).toHaveText(originalTitles)
  await expectOpenState(firstRow, true)
  await expectInstructions(handle)
  await expectHoverTooltip(page, handle)
  await handle.hover()
  await expect(
    page.getByRole('tooltip', { name: 'Open now', exact: true }),
  ).toHaveText('Open now')
  const source = await handle.boundingBox()
  const target = await secondHandle.boundingBox()
  if (!source || !target) {
    throw new Error('Opened URL drag handles must have visible rectangles')
  }
  await page.mouse.move(
    source.x + source.width / 2,
    source.y + source.height / 2,
  )
  await page.mouse.down()
  await expect(handle).toHaveAttribute('aria-pressed', 'true')
  await page.mouse.move(
    target.x + target.width / 2,
    target.y + target.height / 2,
    {
      steps: 12,
    },
  )
  await expectAnnouncement(page, 'Other saved article')
  await page.mouse.up()
  await expect(links).toHaveText(pointerTitles)
  await expect
    .poll(readOrder)
    .toEqual(['open-second', 'open-first', 'open-hash'])
  await page.mouse.move(0, 0, { steps: 12 })
  await expect(
    page.getByRole('tooltip', { name: 'Open now', exact: true }),
  ).toBeHidden()
  await page.reload()
  await expect(links).toHaveText(pointerTitles)
  await expectOpenState(firstRow, true)

  await tabTo(page, handle)
  await expectInstructions(handle)
  await handle.hover()
  await expect(
    page.getByRole('tooltip', { name: 'Open now', exact: true }),
  ).toHaveText('Open now')
  await startKeyboardDrag(page, handle, 'Space')
  await page.keyboard.press('ArrowUp')
  await expectAnnouncement(page, 'Other saved article')
  await page.keyboard.press('Escape')
  await waitForRestoredFocus(page, handle)
  await expect(handle).not.toHaveAttribute('aria-pressed', 'true')
  await expect(links).toHaveText(pointerTitles)
  expect(await readOrder()).toEqual(['open-second', 'open-first', 'open-hash'])

  // Cancelling restores focus before sortable's row transitions finish.
  // Wait for the actual layout to settle before measuring the next drag.
  await expect
    .poll(async () =>
      savedRowsScope(page, mode).evaluateAll((elements) =>
        elements.every(
          (element) => window.getComputedStyle(element).transform === 'none',
        ),
      ),
    )
    .toBe(true)

  await startKeyboardDrag(page, handle, 'Space')
  await page.keyboard.press('ArrowUp')
  await expectAnnouncement(page, 'Other saved article')
  await page.keyboard.press('Enter')
  await waitForRestoredFocus(page, handle)
  await expect(links).toHaveText(originalTitles)
  await expect
    .poll(readOrder)
    .toEqual(['open-first', 'open-second', 'open-hash'])
  await page.reload()
  await expect(links).toHaveText(originalTitles)
  await expectOpenState(firstRow, true)
  await expectInstructions(handle)

  const after = await readPersistenceV2SavedTabsSnapshot(page)
  expect(after.urls).toEqual(before.urls)
  expect(after.categories).toEqual(before.categories)
  expect(after.groups).toEqual(before.groups)
  // Reordering a custom project legitimately touches its modified timestamp.
  expect(after.collections).toEqual(
    beforeCollections.map((collection) =>
      collection.id === collectionId
        ? { ...collection, updatedAt: expect.any(Number) }
        : collection,
    ),
  )
  const afterMemberships = await readMemberships()
  expect(afterMemberships).toHaveLength(beforeMemberships.length)
  expect(
    afterMemberships.filter(
      (membership) => membership.collectionId !== collectionId,
    ),
  ).toEqual(
    beforeMemberships.filter(
      (membership) => membership.collectionId !== collectionId,
    ),
  )
  await opened.close()
  await expectOpenState(firstRow, false)
}
