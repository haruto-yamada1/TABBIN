import type { Locator, Page, Worker } from '@playwright/test'

import { createExamplePersistenceFixture } from '@/test/fixtures/persistenceBrowserFixtures'

import { assertNoAxeViolations } from './helpers/axe'
import {
  createBaseSeed,
  expect,
  getExtensionUrl,
  readPersistenceV2SavedTabsSnapshot,
  readStorage,
  seedSavedTabsFixture,
  test,
} from './helpers/extension'
import {
  expectAnnouncement,
  startKeyboardDrag,
  tabTo,
  waitForRestoredFocus,
} from './helpers/keyboard-dnd'

test.use({ screenshot: 'only-on-failure', trace: 'retain-on-failure' })

const target = (page: Page, name: string) =>
  page.locator(`[data-tour="${name}"]`)
const status = (page: Page) => target(page, 'academy-practice-status')
const lesson = (page: Page) => target(page, 'academy-practice-lesson')
const domain = (page: Page, name: string) =>
  target(page, 'academy-domain').filter({
    has: page.getByRole('heading', { name, exact: true }),
  })
const parent = (page: Page, name: string) =>
  target(page, 'academy-parent-group').filter({
    has: page.getByRole('heading', { name, exact: true }),
  })

const readBoundary = async (worker: Worker) => {
  const { academyProgressV1: _progress, ...storage } =
    await readStorage<Record<string, unknown>>(worker)
  return {
    storage,
    savedTabs: await readPersistenceV2SavedTabsSnapshot(worker),
    tabs: await worker.evaluate(async () =>
      (await chrome.tabs.query({}))
        .map(({ id }) => id)
        .toSorted((left, right) => (left ?? -1) - (right ?? -1)),
    ),
  }
}

const guardPractice = async (page: Page) => {
  await page.addInitScript(() => {
    if (!location.pathname.endsWith('/practice.html')) {
      return
    }
    const calls: string[] = []
    Object.defineProperty(globalThis, '__academyDomainNativeCalls', {
      value: calls,
    })
    const block = (name: string) => () => {
      calls.push(name)
      throw new Error(`Domain practice attempted native effect: ${name}`)
    }
    for (const method of ['create', 'remove', 'update']) {
      Object.defineProperty(chrome.tabs, method, {
        value: block(`tabs.${method}`),
      })
    }
    Object.defineProperty(chrome.windows, 'create', {
      value: block('windows.create'),
    })
    Object.defineProperty(chrome.runtime, 'sendMessage', {
      value: block('runtime.sendMessage'),
    })
    const originalSet = chrome.storage.local.set.bind(chrome.storage.local)
    Object.defineProperty(chrome.storage.local, 'set', {
      value: async (values: Record<string, unknown>) => {
        if (
          Object.keys(values).length === 1 &&
          Object.hasOwn(values, 'academyProgressV1')
        ) {
          return originalSet(values)
        }
        return block('storage.local.set')()
      },
    })
    for (const method of ['remove', 'clear']) {
      Object.defineProperty(chrome.storage.local, method, {
        value: block(`storage.local.${method}`),
      })
    }
    Object.defineProperty(indexedDB, 'open', {
      value: block('indexedDB.open'),
    })
    Object.defineProperty(indexedDB, 'deleteDatabase', {
      value: block('indexedDB.deleteDatabase'),
    })
  })
}

const readPracticeSteps = async (worker: Worker, lessonId: string) => {
  const stored = await readStorage<{
    academyProgressV1?: {
      lessons: Record<string, { practice: Record<string, number> }>
    }
  }>(worker)
  return Object.keys(
    stored.academyProgressV1?.lessons[lessonId]?.practice ?? {},
  )
}

const expectIsolated = async (
  page: Page,
  worker: Worker,
  before: Awaited<ReturnType<typeof readBoundary>>,
) => {
  expect(await readBoundary(worker)).toEqual(before)
  expect(
    await page.evaluate(() =>
      Reflect.get(globalThis, '__academyDomainNativeCalls'),
    ),
  ).toEqual([])
}

const startPractice = async (
  page: Page,
  extensionId: string,
  worker: Worker,
  lessonId: string,
  language = 'en',
) => {
  await seedSavedTabsFixture(worker, {
    storage: createBaseSeed({ domainPracticeMarker: 'unchanged' }),
    persistence: createExamplePersistenceFixture(1_800_000_000_000),
  })
  await page.goto(getExtensionUrl(extensionId, 'app.html#/options'))
  await expect(
    page.getByRole('heading', { name: 'Options', exact: true }),
  ).toBeVisible()
  await guardPractice(page)
  const before = await readBoundary(worker)
  await page.goto(
    getExtensionUrl(
      extensionId,
      `practice.html?lessonId=${lessonId}&lang=${language}`,
    ),
  )
  await expect(status(page)).toContainText('0 /')
  return before
}

const enterValue = async (input: Locator, value: string) => {
  await input.fill(value)
  await input.press('Enter')
}

const closeDialog = async (dialog: Locator) => {
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(dialog).toBeHidden()
}

const selectParent = async (page: Page, name: string) => {
  await target(page, 'academy-parent-dialog')
    .getByRole('combobox', { name: 'Select parent category' })
    .click()
  await page.getByRole('option', { name, exact: true }).click()
}

test('Domain practice parent lesson requires successful create, rename, assignment and move', async ({
  page,
  extensionId,
  serviceWorker,
}, testInfo) => {
  const before = await startPractice(
    page,
    extensionId,
    serviceWorker,
    'parent-categories',
  )
  await expect(
    lesson(page).getByRole('button', { name: 'Next', exact: true }),
  ).toHaveCount(0)
  await lesson(page)
    .getByRole('button', { name: 'Show hint', exact: true })
    .click()
  await target(page, 'academy-parent-categories').click()
  const manager = target(page, 'academy-parent-dialog')
  await expect(
    manager.getByRole('dialog', { name: 'Show hint', exact: true }),
  ).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('academy-parent-practice-hint.png'),
    animations: 'disabled',
    fullPage: true,
  })
  await expect(manager).toHaveCSS('overflow', 'visible')
  await expect(
    manager.getByRole('dialog', { name: 'Show hint', exact: true }),
  ).toBeInViewport()
  await target(page, 'academy-parent-create').click()
  await enterValue(target(page, 'academy-parent-create'), 'Demo workspace')
  await expect(
    page.getByText('A category named "Demo workspace" already exists'),
  ).toBeVisible()
  await expect(status(page)).toContainText('0 / 4')
  expect(await readPracticeSteps(serviceWorker, 'parent-categories')).toEqual(
    [],
  )
  await enterValue(target(page, 'academy-parent-create'), 'Development')
  await expect(status(page)).toContainText('1 / 4')
  await closeDialog(manager)

  await parent(page, 'Demo workspace')
    .getByRole('button', { name: /Manage parent categories/u })
    .click()
  const edit = target(page, 'academy-parent-manage')
  await edit
    .getByRole('button', { name: 'Demo workspace', exact: true })
    .click()
  await enterValue(target(page, 'academy-parent-rename'), 'Development sites')
  await expect(status(page)).toContainText('2 / 4')
  await closeDialog(edit)

  await target(page, 'academy-parent-categories').click()
  await selectParent(page, 'Development')
  const notes = manager.getByRole('checkbox', {
    name: 'notes.academy.test',
    exact: true,
  })
  await notes.check()
  await expect(notes).toBeChecked()
  await expect(status(page)).toContainText('3 / 4')
  await selectParent(page, 'Demo learning')
  await notes.check()
  await expect(status(page)).toContainText('4 / 4')
  await closeDialog(manager)
  await expect(
    parent(page, 'Demo learning').getByRole('heading', {
      name: 'notes.academy.test',
      exact: true,
    }),
  ).toBeVisible()
  await expect
    .poll(async () => readPracticeSteps(serviceWorker, 'parent-categories'))
    .toHaveLength(4)
  await expectIsolated(page, serviceWorker, before)
  await page.screenshot({
    path: testInfo.outputPath('academy-parent-practice-complete.png'),
    fullPage: true,
  })
})

test('Domain practice child lesson uses the real category manager and keyword-driven URL regrouping', async ({
  page,
  extensionId,
  serviceWorker,
}, testInfo) => {
  const before = await startPractice(
    page,
    extensionId,
    serviceWorker,
    'child-categories',
  )
  const notes = domain(page, 'notes.academy.test')
  await notes.locator('[data-tour="academy-child-categories"]').click()
  await enterValue(target(page, 'academy-child-create'), 'Scratch')
  await expect(status(page)).toContainText('1 / 4')
  await target(page, 'academy-child-rename-action').click()
  await enterValue(target(page, 'academy-child-rename'), 'Research')
  await expect(status(page)).toContainText('2 / 4')
  await enterValue(target(page, 'academy-child-keywords'), 'scratch')
  await expect(status(page)).toContainText('3 / 4')
  await target(page, 'academy-child-select').click()
  await page.getByRole('option', { name: 'Guides', exact: true }).click()
  await enterValue(target(page, 'academy-child-keywords'), 'notes')
  await expect(status(page)).toContainText('4 / 4')
  await closeDialog(target(page, 'academy-child-dialog'))
  await expect(notes.getByTestId('url-title-label')).toHaveText([
    'notes guide',
    'notes reference',
  ])
  await expect(
    notes.locator(
      '[data-category-context="category-Guides-practice-domain-0"]',
    ),
  ).toHaveCount(2)
  await expect
    .poll(async () => readPracticeSteps(serviceWorker, 'child-categories'))
    .toHaveLength(4)
  await expectIsolated(page, serviceWorker, before)
  await page.screenshot({
    path: testInfo.outputPath('academy-child-practice-complete.png'),
    fullPage: true,
  })
})

const keyboardMove = async (
  page: Page,
  handle: Locator,
  destinationName: string,
) => {
  await handle.focus()
  await startKeyboardDrag(page, handle, 'Space')
  await page.keyboard.press('ArrowDown')
  await expectAnnouncement(page, destinationName)
  await page.keyboard.press('Space')
  await waitForRestoredFocus(page, handle)
}

const confirmOrder = async (page: Page) => {
  await page
    .getByRole('button', {
      name: 'Confirm parent category reordering',
      exact: true,
    })
    .click()
}

const pointerMoveChild = async (page: Page, notes: Locator) => {
  const handle = notes.getByRole('button', {
    name: 'Drag to reorder category "Guides"',
    exact: true,
  })
  const destination = notes.getByTestId('sortable-category-section').filter({
    has: page.getByRole('heading', { name: 'References', exact: true }),
  })
  await handle.scrollIntoViewIfNeeded()
  const source = await handle.boundingBox()
  if (!source) {
    throw new Error('Child drag handle is not visible')
  }
  await page.mouse.move(source.x + 12, source.y + source.height / 2)
  await page.mouse.down()
  await page.mouse.move(source.x + 16, source.y + source.height / 2 + 4)
  await expect(destination).toHaveAttribute('data-drop-state', 'available')
  const next = await destination.boundingBox()
  if (!next) {
    throw new Error('Child drag destination is not visible')
  }
  await page.mouse.move(next.x + next.width / 2, next.y + next.height / 2, {
    steps: 10,
  })
  await expect(destination).toHaveAttribute('data-drop-state', 'over')
  await page.mouse.up()
}

test('Domain practice reorder lesson recognizes committed parent, domain and child keyboard moves', async ({
  page,
  extensionId,
  serviceWorker,
}) => {
  const before = await startPractice(
    page,
    extensionId,
    serviceWorker,
    'reorder-items',
  )
  const workspace = parent(page, 'Demo workspace')
  const parentHandle = workspace.locator('[data-tour="academy-parent-drag"]')
  await parentHandle.focus()
  await startKeyboardDrag(page, parentHandle, 'Space')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Escape')
  await waitForRestoredFocus(page, parentHandle)
  await expect(status(page)).toContainText('0 / 3')
  await keyboardMove(page, parentHandle, 'Demo learning')
  await expect(status(page)).toContainText('0 / 3')
  await confirmOrder(page)
  await expect(status(page)).toContainText('1 / 3')

  const notes = domain(page, 'notes.academy.test')
  await keyboardMove(
    page,
    notes.locator('[data-tour="academy-domain-drag"]'),
    'learn.academy.test',
  )
  await expect(status(page)).toContainText('1 / 3')
  await confirmOrder(page)
  await expect(status(page)).toContainText('2 / 3')
  await keyboardMove(
    page,
    notes.getByRole('button', {
      name: 'Drag to reorder category "Guides"',
      exact: true,
    }),
    'References',
  )
  await expect(status(page)).toContainText('2 / 3')
  await confirmOrder(page)
  await expect(status(page)).toContainText('3 / 3')

  await lesson(page)
    .getByRole('button', { name: 'Previous step', exact: true })
    .click()
  await expect(status(page)).toContainText('2 / 3')
  await pointerMoveChild(page, notes)
  await expect(status(page)).toContainText('2 / 3')
  const confirm = page.getByRole('button', {
    name: 'Confirm parent category reordering',
    exact: true,
  })
  // Match the existing pointer/touch scenarios: navigate to the confirmation
  // with the keyboard after dropping instead of clicking during drag teardown.
  await tabTo(page, confirm)
  await page.keyboard.press('Enter')
  await expect(confirm).toBeHidden()
  await expect(status(page)).toContainText('3 / 3')
  await expectIsolated(page, serviceWorker, before)
})

test('Domain restoration screen guide records viewing without opening tabs or completing practice', async ({
  page,
  extensionId,
  serviceWorker,
}) => {
  await seedSavedTabsFixture(serviceWorker, {
    storage: createBaseSeed({ domainPracticeMarker: 'unchanged' }),
    persistence: createExamplePersistenceFixture(1_800_000_000_000),
  })
  // Complete the normal saved-tabs bootstrap, including legacy view-mode
  // normalization, before comparing the guide's read-only boundary.
  await page.goto(
    getExtensionUrl(extensionId, 'app.html#/saved-tabs?mode=domain'),
  )
  await expect(page.getByTestId('url-title-label')).toHaveText('Example Home')
  await expect
    .poll(async () => readStorage(serviceWorker, ['viewMode']))
    .toEqual({})
  await page.goto(
    getExtensionUrl(extensionId, 'app.html#/academy/restore-tabs'),
  )
  await page.getByRole('tab', { name: 'Screen guide', exact: true }).click()
  const before = await readBoundary(serviceWorker)
  await page
    .getByRole('link', { name: 'Start screen guide', exact: true })
    .click()
  await expect(page).toHaveURL(/guide=restore-tabs/u)
  const guide = page.getByRole('dialog', { name: 'Screen guide', exact: true })
  await expect(guide).toContainText('This guide will not open any tabs.')
  await guide.getByRole('button', { name: 'Finish', exact: true }).click()
  await expect(guide).toContainText('Screen guide viewed')
  await expect
    .poll(async () => {
      const stored = await readStorage<{
        academyProgressV1?: {
          lessons: Record<
            string,
            { guideViewedAt?: number; practice: Record<string, number> }
          >
        }
      }>(serviceWorker)
      return stored.academyProgressV1?.lessons['restore-tabs']
    })
    .toMatchObject({ guideViewedAt: expect.any(Number), practice: {} })
  expect(await readBoundary(serviceWorker)).toEqual(before)
})

test('Domain practice Japanese narrow reduced-motion restoration, retry, back and reset stay isolated', async ({
  page,
  extensionId,
  serviceWorker,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' })
  const before = await startPractice(
    page,
    extensionId,
    serviceWorker,
    'restore-tabs',
    'ja',
  )
  await expect(status(page)).toContainText('0 / 1')
  const notes = domain(page, 'notes.academy.test')
  await notes.locator('[data-tour="academy-restore-tabs"]').click()
  await expect(status(page)).toContainText('1 / 1')
  await expectIsolated(page, serviceWorker, before)
  await expect
    .poll(async () => readPracticeSteps(serviceWorker, 'restore-tabs'))
    .toEqual(['restore-tabs-success'])
  await page
    .getByRole('button', { name: '練習をリセット', exact: true })
    .click()
  await expect(status(page)).toHaveCount(1)
  await expect(status(page)).toContainText('0 / 1')
  await expect(page.getByTestId('sortable-url-item')).toHaveCount(6)
  await lesson(page).getByRole('button', { name: 'この手順をやり直す' }).click()
  await expect(status(page)).toContainText('0 / 1')
  const mode = target(page, 'academy-view-mode')
  await mode.click()
  await page
    .getByRole('option', { name: 'カスタムモード', exact: true })
    .click()
  await expect(page.getByText('Demo collection', { exact: true })).toBeVisible()
  await mode.click()
  await page
    .getByRole('option', { name: 'ドメインモード', exact: true })
    .click()
  await expect(page.getByTestId('sortable-url-item')).toHaveCount(6)
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390)
  await assertNoAxeViolations(
    page,
    'Domain practice Japanese narrow reduced motion',
  )
  await expectIsolated(page, serviceWorker, before)
  await page.screenshot({
    path: testInfo.outputPath('academy-domain-practice-narrow-ja.png'),
    fullPage: true,
  })
})
