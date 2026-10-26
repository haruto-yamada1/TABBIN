import type { Locator, Page, TestInfo, Worker } from '@playwright/test'

import {
  createCustomCollectionFixture,
  createDomainCollectionFixture,
  createMembershipFixture,
  createUrlFixture,
} from '@/test/fixtures/persistenceBrowserFixtures'

import {
  createBaseSeed,
  expect,
  readPersistenceV2Store,
  seedSavedTabsFixture,
} from './extension'

const now = Date.now()
const firstTitle = 'First saved tab'
const secondTitle = 'Second saved tab'
const titles = [firstTitle, secondTitle]
const categoryNames = ['Alpha', 'Beta']

const createSeed = (mode: 'domain' | 'custom', categorized = false) => {
  const collectionId = mode === 'domain' ? 'domain-a' : 'project-a'
  const urls = titles.map((title, index) =>
    createUrlFixture(
      `url-${index}`,
      `https://example.com/${index}`,
      title,
      now,
    ),
  )
  const categories = categorized
    ? categoryNames.map((name, sortOrder) => ({
        collectionId,
        createdAt: now,
        id: `${collectionId}:category:${sortOrder}`,
        keywords: [],
        name,
        sortOrder,
        updatedAt: now,
      }))
    : []
  return {
    persistence: {
      categories,
      collections: [
        mode === 'domain'
          ? createDomainCollectionFixture(collectionId, 'example.com', now)
          : createCustomCollectionFixture(
              collectionId,
              'Keyboard project',
              now,
            ),
      ],
      groups: [],
      memberships: urls.map((url, index) => ({
        ...createMembershipFixture(collectionId, url.id, now, index),
        ...(categories[index] ? { categoryId: categories[index].id } : {}),
      })),
      urls,
    },
    storage: createBaseSeed({ viewMode: mode }),
  }
}

const createParentCategorySeed = () => ({
  persistence: {
    categories: [],
    collections: categoryNames.map((_, index) => ({
      ...createDomainCollectionFixture(
        `domain-${index}`,
        `${index}.example.com`,
        now,
        index,
      ),
      groupId: `parent-${index}`,
    })),
    groups: categoryNames.map((name, sortOrder) => ({
      createdAt: now,
      id: `parent-${sortOrder}`,
      name,
      sortOrder,
      updatedAt: now,
    })),
    memberships: titles.map((_, index) =>
      createMembershipFixture(`domain-${index}`, `url-${index}`, now),
    ),
    urls: titles.map((title, index) =>
      createUrlFixture(
        `url-${index}`,
        `https://${index}.example.com/`,
        title,
        now,
      ),
    ),
  },
  storage: createBaseSeed(),
})

// Reach controls using the same Tab path as a keyboard-only user. A missing
// focus target fails with its accessible locator instead of silently focusing it.
/* eslint-disable no-await-in-loop -- keyboard focus must advance sequentially */
export const tabTo = async (page: Page, target: Locator): Promise<void> => {
  await expect(target).toBeVisible()
  for (let index = 0; index < 100; index += 1) {
    if (
      await target.evaluate((element) => element === document.activeElement)
    ) {
      break
    }
    const targetPrecedesFocus = await target.evaluate((element) => {
      const focused = document.activeElement
      return (
        focused !== null &&
        Boolean(
          focused.compareDocumentPosition(element) &
          Node.DOCUMENT_POSITION_PRECEDING,
        )
      )
    })
    await page.keyboard.press(targetPrecedesFocus ? 'Shift+Tab' : 'Tab')
  }
  await expect(target).toBeFocused()
}
/* eslint-enable no-await-in-loop */

export const expectInstructions = async (handle: Locator): Promise<void> => {
  const instructions = await handle.evaluate((element) =>
    (element.getAttribute('aria-describedby') ?? '')
      .split(/\s+/u)
      .map(
        (id) => document.querySelector(`#${CSS.escape(id)}`)?.textContent ?? '',
      )
      .join(' '),
  )
  expect(instructions).toMatch(/space/iu)
  expect(instructions).toMatch(/enter/iu)
  expect(instructions).toMatch(/arrow/iu)
  expect(instructions).toMatch(/escape/iu)
}

export const expectAnnouncement = async (
  page: Page,
  name: string,
): Promise<void> => {
  await expect
    .poll(async () =>
      (
        await page
          .locator('[role="status"][aria-live="assertive"]')
          .allTextContents()
      ).join(' '),
    )
    .toContain(name)
}

export const startKeyboardDrag = async (
  page: Page,
  handle: Locator,
  key: 'Space' | 'Enter',
): Promise<void> => {
  await page.bringToFront()
  await page.keyboard.press(key)
  await expect(handle).toHaveAttribute('aria-pressed', 'true')
  // KeyboardSensor installs its document key listener in a timer task. Yield
  // through that task; a rendered drag alone does not mean keys are attached.
  await page.evaluate(
    async () =>
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, 0)
      }),
  )
  // dnd-kit measures droppable rectangles after activation. The initial over
  // announcement confirms that geometry is ready before a movement key.
  await expectAnnouncement(page, ' is over ')
}

export const waitForRestoredFocus = async (
  page: Page,
  handle: Locator,
): Promise<void> => {
  await expect(handle).toBeFocused()
  // dnd-kit restores activator focus in requestAnimationFrame after drop. Let
  // that restoration complete before starting the next Tab traversal.
  await page.evaluate(
    async () =>
      new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => {
          resolve()
        })
      }),
  )
  await expect(handle).toBeFocused()
}

export const recordKeyboardState = async (
  page: Page,
  testInfo: TestInfo,
  label: string,
): Promise<void> => {
  if (testInfo.status === testInfo.expectedStatus) {
    return
  }
  const state = await page.evaluate(() => ({
    focusedElement: document.activeElement?.outerHTML.slice(0, 500),
    visibility: document.visibilityState,
    hasFocus: document.hasFocus(),
    live: [...document.querySelectorAll('[aria-live]')].map((node) => ({
      text: node.textContent,
      role: node.getAttribute('role'),
    })),
    items: [
      ...document.querySelectorAll(
        '[data-testid=sortable-url-item], [data-testid=sortable-category-section], [data-testid=card-group-title], [data-testid=domain-scroll-target], [data-saved-tabs-scroll-target], [data-testid=project-url-item], [aria-roledescription=sortable]',
      ),
    ].map((node) => {
      const rect = node.getBoundingClientRect()
      const style = getComputedStyle(node)
      return {
        text: node.textContent.slice(0, 100),
        testId: node.getAttribute('data-testid'),
        label: node.getAttribute('aria-label'),
        pressed: node.getAttribute('aria-pressed'),
        active: node === document.activeElement,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        transform: style.transform,
      }
    }),
  }))
  await testInfo.attach(label, {
    body: JSON.stringify(state, null, 2),
    contentType: 'application/json',
  })
}

type RankedMembership = {
  collectionId: string
  sortOrder: number
  urlId: string
}

const readUrlOrder = async (
  worker: Pick<Worker, 'evaluate'>,
  collectionId: string,
) =>
  (
    await readPersistenceV2Store<RankedMembership>(
      worker,
      'collectionMemberships',
    )
  )
    .filter((membership) => membership.collectionId === collectionId)
    .toSorted((left, right) => left.sortOrder - right.sortOrder)
    .map(({ urlId }) => urlId)

type RankedName = { name: string; sortOrder: number }

const readCategoryOrder = async (
  worker: Pick<Worker, 'evaluate'>,
  parent: boolean,
) =>
  (
    await readPersistenceV2Store<RankedName>(
      worker,
      parent ? 'collectionGroups' : 'collectionCategories',
    )
  )
    .toSorted((left, right) => left.sortOrder - right.sortOrder)
    .map(({ name }) => name)

const getDomainCategoryControls = (page: Page, parent: boolean) => {
  const headings = parent
    ? page.getByTestId('card-group-title').getByRole('heading', { level: 2 })
    : page
        .getByTestId('sortable-category-section')
        .getByRole('heading', { level: 3 })
  const handle = parent
    ? page.getByRole('button').filter({
        has: page.getByRole('heading', { name: 'Alpha', exact: true }),
      })
    : page.getByRole('button', {
        name: 'Drag to reorder category "Alpha"',
        exact: true,
      })
  return { headings, handle }
}

type KeyboardScenario = {
  page: Page
  serviceWorker: Pick<Worker, 'evaluate'>
  appUrl: string
}

export const verifyKeyboardUrlOrdering = async (
  {
    page,
    serviceWorker,
    appUrl,
    mode,
  }: KeyboardScenario & { mode: 'domain' | 'custom' },
  testInfo: TestInfo,
): Promise<void> => {
  const collectionId = mode === 'domain' ? 'domain-a' : 'project-a'
  const rowTestId = mode === 'domain' ? 'sortable-url-item' : 'project-url-item'
  await seedSavedTabsFixture(serviceWorker, createSeed(mode))
  await page.goto(appUrl)

  const rows = page.getByTestId(rowTestId)
  const links = rows.getByRole('link')
  const handle = page.getByRole('button', {
    name: `Drag to reorder tab "${firstTitle}"`,
    exact: true,
  })
  await expect(links).toHaveText(titles)
  await tabTo(page, handle)
  await expectInstructions(handle)

  await startKeyboardDrag(page, handle, 'Space')

  await expectAnnouncement(page, firstTitle)
  await page.keyboard.press('ArrowDown')

  await expectAnnouncement(page, secondTitle)
  await page.keyboard.press('Escape')

  await waitForRestoredFocus(page, handle)
  await expect(links).toHaveText(titles)
  expect(await readUrlOrder(serviceWorker, collectionId)).toEqual([
    'url-0',
    'url-1',
  ])

  await startKeyboardDrag(page, handle, 'Enter')

  await expectAnnouncement(page, firstTitle)
  await page.keyboard.press('ArrowDown')

  await expectAnnouncement(page, secondTitle)
  await page.keyboard.press('Enter')
  await expect(links).toHaveText(titles.toReversed())
  await waitForRestoredFocus(page, handle)
  await expect
    .poll(async () => readUrlOrder(serviceWorker, collectionId))
    .toEqual(['url-1', 'url-0'])
  await page.reload()
  await expect(links).toHaveText(titles.toReversed())
  const screenshotPath = testInfo.outputPath(`${mode}-keyboard-url-order.png`)
  await page.screenshot({ path: screenshotPath, fullPage: true })
  await testInfo.attach(`${mode}-keyboard-url-order`, {
    path: screenshotPath,
    contentType: 'image/png',
  })
}

export const verifyKeyboardDomainCategories = async (
  {
    page,
    serviceWorker,
    appUrl,
    parent,
  }: KeyboardScenario & { parent: boolean },
  testInfo: TestInfo,
): Promise<void> => {
  await seedSavedTabsFixture(
    serviceWorker,
    parent ? createParentCategorySeed() : createSeed('domain', true),
  )
  await page.goto(appUrl)

  const { headings, handle } = getDomainCategoryControls(page, parent)
  const targets = parent
    ? page.locator('[data-saved-tabs-scroll-target="parent"]')
    : page.getByTestId('sortable-category-section')
  const source = targets.filter({
    has: page.getByRole('heading', { name: 'Alpha', exact: true }),
  })
  const destination = targets.filter({
    has: page.getByRole('heading', { name: 'Beta', exact: true }),
  })
  const cancel = page.getByRole('button', {
    name: 'Cancel parent category reordering',
    exact: true,
  })
  const confirm = page.getByRole('button', {
    name: 'Confirm parent category reordering',
    exact: true,
  })
  await expect(headings).toHaveText(categoryNames)
  await tabTo(page, handle)
  await expectInstructions(handle)

  await startKeyboardDrag(page, handle, 'Space')
  await expectAnnouncement(page, 'Alpha')
  await expect(source).toHaveAttribute('data-drop-state', 'source')
  await expect(destination).toHaveAttribute('data-drop-state', 'available')
  await expect(destination).toHaveCSS('outline-style', 'dashed')

  await page.keyboard.press('ArrowDown')

  await expectAnnouncement(page, 'Beta')
  await expect(destination).toHaveAttribute('data-drop-state', 'over')
  await expect(destination).toHaveCSS('outline-style', 'solid')
  await page.keyboard.press('Escape')
  await expect(destination).toHaveAttribute('data-drop-state', 'idle')
  await expect(headings).toHaveText(categoryNames)
  await waitForRestoredFocus(page, handle)
  await expect(confirm).toBeHidden()
  expect(await readCategoryOrder(serviceWorker, parent)).toEqual(categoryNames)

  await startKeyboardDrag(page, handle, 'Enter')

  await page.keyboard.press('ArrowDown')

  await expectAnnouncement(page, 'Beta')
  await page.keyboard.press('Enter')
  await expect(headings).toHaveText(categoryNames.toReversed())
  await waitForRestoredFocus(page, handle)
  expect(await readCategoryOrder(serviceWorker, parent)).toEqual(categoryNames)
  const previewPath = testInfo.outputPath(
    `domain-${parent ? 'parent' : 'child'}-keyboard-preview.png`,
  )
  await page.screenshot({ path: previewPath, fullPage: true })
  await testInfo.attach('domain-keyboard-category-preview', {
    path: previewPath,
    contentType: 'image/png',
  })
  await tabTo(page, cancel)
  await page.keyboard.press('Enter')
  await expect(headings).toHaveText(categoryNames)
  await expect(confirm).toBeHidden()

  await tabTo(page, handle)

  await startKeyboardDrag(page, handle, 'Space')

  await page.keyboard.press('ArrowDown')

  await expectAnnouncement(page, 'Beta')
  await page.keyboard.press('Space')
  await expect(headings).toHaveText(categoryNames.toReversed())
  await waitForRestoredFocus(page, handle)
  await tabTo(page, confirm)
  await page.keyboard.press('Enter')
  await expect(confirm).toBeHidden()
  await expect
    .poll(async () => readCategoryOrder(serviceWorker, parent))
    .toEqual(categoryNames.toReversed())
  await page.reload()
  await expect(headings).toHaveText(categoryNames.toReversed())
}

export const verifyTouchDomainCategories = async ({
  page,
  serviceWorker,
  appUrl,
  parent,
}: KeyboardScenario & { parent: boolean }): Promise<void> => {
  await seedSavedTabsFixture(
    serviceWorker,
    parent ? createParentCategorySeed() : createSeed('domain', true),
  )
  await page.goto(appUrl)
  const { headings, handle } = getDomainCategoryControls(page, parent)
  await expect(headings).toHaveText(categoryNames)
  const targets = parent
    ? page.locator('[data-saved-tabs-scroll-target="parent"]')
    : page.getByTestId('sortable-category-section')
  const destination = targets.filter({
    has: page.getByRole('heading', { name: 'Beta', exact: true }),
  })
  const center = async (target: Locator) => {
    const box = await target.boundingBox()
    if (!box) {
      throw new Error('Touch drag target is not visible')
    }
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  }
  const session = await page.context().newCDPSession(page)
  const point = await center(handle.locator('[data-saved-tabs-drag-handle]'))
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [point],
  })
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: point.x + 4, y: point.y + 4 }],
  })
  await expect(destination).toHaveAttribute('data-drop-state', 'available')
  const next = await center(destination)
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [next],
  })
  await expect(destination).toHaveAttribute('data-drop-state', 'over')
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  })
  await expect(headings).toHaveText(categoryNames.toReversed())
  const confirm = page.getByRole('button', {
    name: 'Confirm parent category reordering',
    exact: true,
  })
  await tabTo(page, confirm)
  await page.keyboard.press('Enter')
  await expect(confirm).toBeHidden()
  await expect
    .poll(async () => readCategoryOrder(serviceWorker, parent))
    .toEqual(categoryNames.toReversed())
  await page.reload()
  await expect(headings).toHaveText(categoryNames.toReversed())
}

export const verifyCategoryTouchScrolling = async ({
  page,
  serviceWorker,
  appUrl,
  targetPart,
  parent,
}: KeyboardScenario & {
  targetPart: 'title' | 'badge'
  parent: boolean
}): Promise<void> => {
  const seed = parent ? createParentCategorySeed() : createSeed('domain', true)
  const membership = seed.persistence.memberships[0]
  if (!membership) {
    throw new Error('Touch scrolling fixture needs a source membership')
  }
  const now = Date.now()
  const extraUrls = Array.from({ length: 8 }, (_, index) =>
    createUrlFixture(
      `scroll-${index}`,
      `https://example.com/scroll-${index}`,
      `Scroll tab ${index}`,
      now,
    ),
  )
  seed.persistence.urls.push(...extraUrls)
  seed.persistence.memberships.push(
    ...extraUrls.map((url, index) => ({
      ...membership,
      urlId: url.id,
      sortOrder: (index + 2) * 1024,
    })),
  )
  await seedSavedTabsFixture(serviceWorker, seed)
  await page.setViewportSize({ width: 1280, height: 350 })
  await page.goto(appUrl)
  const { handle: row } = getDomainCategoryControls(page, parent)
  const target =
    targetPart === 'title'
      ? row.getByRole('heading', { name: 'Alpha', exact: true })
      : row.getByText(String(extraUrls.length + 1), { exact: true }).first()
  const box = await target.boundingBox()
  if (!box) {
    throw new Error('Category touch target is not visible')
  }
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  const pane = page.getByTestId('saved-tabs-left-pane')
  await expect
    .poll(async () =>
      pane.evaluate((node) => node.scrollHeight - node.clientHeight),
    )
    .toBeGreaterThan(90)
  const session = await page.context().newCDPSession(page)
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [point],
  })
  await expect(page.locator('[data-drop-state="source"]')).toHaveCount(0)
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: point.x, y: point.y - 20 }],
  })
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: point.x, y: point.y - 90 }],
  })
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  })
  await expect
    .poll(async () =>
      page
        .getByTestId('saved-tabs-left-pane')
        .evaluate((node) => node.scrollTop),
    )
    .toBeGreaterThan(30)
  await expect(
    page.locator('[data-drop-state="source"], [data-drop-state="over"]'),
  ).toHaveCount(0)
  expect(await readCategoryOrder(serviceWorker, parent)).toEqual(categoryNames)
}

export const verifyKeyboardCustomCategories = async ({
  page,
  serviceWorker,
  appUrl,
}: KeyboardScenario): Promise<void> => {
  await seedSavedTabsFixture(serviceWorker, createSeed('custom', true))
  await page.goto(appUrl)

  const headings = page.getByRole('heading', { level: 3 })
  const handle = page.getByRole('button', {
    name: 'Drag to reorder category "Alpha"',
    exact: true,
  })
  const source = page.locator('[data-drop-state][data-category="Alpha"]')
  const destination = page.locator('[data-drop-state][data-category="Beta"]')
  await expect(headings).toHaveText(categoryNames)
  await tabTo(page, handle)
  await expectInstructions(handle)
  await startKeyboardDrag(page, handle, 'Space')
  await expectAnnouncement(page, 'Alpha')
  await expect(source).toHaveAttribute('data-drop-state', 'source')
  await expect(destination).toHaveAttribute('data-drop-state', 'available')
  await expect(destination).toHaveCSS('outline-style', 'dashed')
  await page.keyboard.press('ArrowDown')
  await expectAnnouncement(page, 'Beta')
  await expect(destination).toHaveAttribute('data-drop-state', 'over')
  await expect(destination).toHaveCSS('outline-style', 'solid')
  await page.keyboard.press('Escape')
  await expect(destination).toHaveAttribute('data-drop-state', 'idle')
  await expect(headings).toHaveText(categoryNames)
  await waitForRestoredFocus(page, handle)
  expect(await readCategoryOrder(serviceWorker, false)).toEqual(categoryNames)

  await startKeyboardDrag(page, handle, 'Enter')
  await page.keyboard.press('ArrowDown')
  await expectAnnouncement(page, 'Beta')
  await page.keyboard.press('Enter')
  await expect(headings).toHaveText(categoryNames.toReversed())
  await expect
    .poll(async () => readCategoryOrder(serviceWorker, false))
    .toEqual(categoryNames.toReversed())
  await page.reload()
  await expect(headings).toHaveText(categoryNames.toReversed())
}

export const verifyKeyboardCustomHierarchy = async ({
  page,
  serviceWorker,
  appUrl,
}: KeyboardScenario): Promise<void> => {
  const title = 'Transfer saved tab'
  const sourceProjectId = 'transfer-source'
  const targetProjectId = 'transfer-target'
  const categoryId = 'transfer-source:archive'
  await seedSavedTabsFixture(serviceWorker, {
    persistence: {
      categories: [
        {
          collectionId: sourceProjectId,
          createdAt: now,
          id: categoryId,
          keywords: [],
          name: 'Archive',
          sortOrder: 0,
          updatedAt: now,
        },
      ],
      collections: [
        createCustomCollectionFixture(
          sourceProjectId,
          'Source project',
          now,
          0,
        ),
        createCustomCollectionFixture(
          targetProjectId,
          'Target project',
          now,
          1024,
        ),
      ],
      groups: [],
      memberships: [
        {
          ...createMembershipFixture(sourceProjectId, 'transfer-url', now),
          notes: 'Keep this note across keyboard moves',
        },
      ],
      urls: [
        createUrlFixture(
          'transfer-url',
          'https://example.com/transfer',
          title,
          now,
        ),
      ],
    },
    storage: createBaseSeed({ viewMode: 'custom' }),
  })
  await page.goto(appUrl)

  const row = page.getByTestId('project-url-item')
  const handle = page.getByRole('button', {
    name: `Drag to reorder tab "${title}"`,
    exact: true,
  })
  const archive = page.locator('[aria-label="Category: Archive"]')
  const uncategorized = page.locator(`#uncategorized-${sourceProjectId}`)
  const targetHeading = page.getByRole('heading', {
    name: 'Target project',
    exact: true,
  })
  const bounds = async (target: Locator) => {
    const rectangle = await target.boundingBox()
    if (!rectangle) {
      throw new Error('Keyboard hierarchy target has no visible rectangle')
    }
    return rectangle
  }
  const readMembership = async () => {
    const memberships = await readPersistenceV2Store<{
      collectionId: string
      urlId: string
      categoryId?: string
      notes?: string
    }>(serviceWorker, 'collectionMemberships')
    return memberships
      .filter(({ urlId }) => urlId === 'transfer-url')
      .map((membership) => ({
        collectionId: membership.collectionId,
        categoryId: membership.categoryId ?? null,
        notes: membership.notes,
      }))
  }
  const move = async (
    steps: readonly {
      key: 'ArrowLeft' | 'ArrowUp' | 'ArrowDown'
      targetName: string
    }[],
    collectionId: string,
    expectedCategory: string | null,
  ): Promise<void> => {
    await tabTo(page, handle)
    await startKeyboardDrag(page, handle, 'Space')
    await expect(archive).toHaveAttribute('data-drop-state', /available|over/)
    await expect(archive).toHaveCSS('outline-style', /dashed|solid/)
    /* eslint-disable no-await-in-loop -- explicit keyboard navigation steps must run sequentially */
    for (const { key, targetName } of steps) {
      await page.keyboard.press(key)
      await expectAnnouncement(page, targetName)
      if (targetName === 'Archive') {
        await expect(archive).toHaveAttribute('data-drop-state', 'over')
        await expect(archive).toHaveCSS('outline-style', 'solid')
      }
      if (targetName === 'Uncategorized tabs') {
        await expect(uncategorized).toHaveAttribute('data-drop-state', 'over')
      }
    }
    /* eslint-enable no-await-in-loop */

    await page.keyboard.press('Enter')
    await expect.poll(readMembership).toEqual([
      {
        collectionId,
        categoryId: expectedCategory,
        notes: 'Keep this note across keyboard moves',
      },
    ])
    await page.reload()

    await expect(row).toHaveAttribute('data-project-id', collectionId)
  }

  // Archive's card begins to the left of the indented uncategorized URL row.
  // Left first reaches the containing uncategorized area; Up then reaches
  // Archive above it. Both hierarchical positions are announced explicitly.
  await expect(archive.getByTestId('empty-state')).toBeVisible()
  expect((await bounds(archive)).x).toBeLessThan((await bounds(row)).x)
  expect((await bounds(archive)).y).toBeLessThan(
    (await bounds(uncategorized)).y,
  )
  await move(
    [
      { key: 'ArrowLeft', targetName: 'Uncategorized tabs' },
      { key: 'ArrowUp', targetName: 'Archive' },
    ],
    sourceProjectId,
    categoryId,
  )
  await expect(
    archive.getByRole('link', { name: title, exact: true }),
  ).toBeVisible()

  // The empty uncategorized area is below the only URL in Archive.
  expect((await bounds(uncategorized)).y).toBeGreaterThan((await bounds(row)).y)
  await move(
    [{ key: 'ArrowDown', targetName: 'Uncategorized tabs' }],
    sourceProjectId,
    null,
  )
  await expect(
    uncategorized.getByRole('link', { name: title, exact: true }),
  ).toBeVisible()

  // At the end of the source bucket, Down reaches the next project's header.
  expect((await bounds(targetHeading)).y).toBeGreaterThan((await bounds(row)).y)
  await move(
    [{ key: 'ArrowDown', targetName: 'Target project' }],
    targetProjectId,
    null,
  )
  await expect(
    page.getByRole('link', { name: title, exact: true }),
  ).toHaveCount(1)
  expect(await readMembership()).toEqual([
    {
      collectionId: targetProjectId,
      categoryId: null,
      notes: 'Keep this note across keyboard moves',
    },
  ])
}
