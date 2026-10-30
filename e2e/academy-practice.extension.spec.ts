import type { Page, Worker } from '@playwright/test'

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

const readBoundary = async (serviceWorker: Worker) => ({
  savedTabs: await readPersistenceV2SavedTabsSnapshot(serviceWorker),
  storage: await readStorage<Record<string, unknown>>(serviceWorker),
  tabs: await serviceWorker.evaluate(async () =>
    (await chrome.tabs.query({}))
      .map((tab) => tab.id)
      .toSorted((left, right) => (left ?? -1) - (right ?? -1)),
  ),
})

// Throw and retain every attempted native side effect, including failures that
// a component catches. The worker still reads the real production snapshot.
const guardPracticeApis = async (page: Page) => {
  await page.addInitScript(() => {
    if (!location.pathname.endsWith('/practice.html')) {
      return
    }
    const calls: string[] = []
    Object.defineProperty(globalThis, '__tabbinPracticeNativeCalls', {
      value: calls,
    })
    const blocked = (name: string) => () => {
      calls.push(name)
      throw new Error(`Practice called native API: ${name}`)
    }
    for (const method of ['create', 'remove', 'update']) {
      Object.defineProperty(chrome.tabs, method, {
        value: blocked(`tabs.${method}`),
      })
    }
    Object.defineProperty(chrome.windows, 'create', {
      value: blocked('windows.create'),
    })
    Object.defineProperty(chrome.runtime, 'sendMessage', {
      value: blocked('runtime.sendMessage'),
    })
    for (const method of ['set', 'remove', 'clear']) {
      Object.defineProperty(chrome.storage.local, method, {
        value: blocked(`storage.local.${method}`),
      })
    }
    Object.defineProperty(indexedDB, 'open', {
      value: blocked('indexedDB.open'),
    })
    Object.defineProperty(indexedDB, 'deleteDatabase', {
      value: blocked('indexedDB.deleteDatabase'),
    })
    Object.defineProperty(globalThis, '__tabbinPracticeGuardsReady', {
      value: true,
    })
  })
}

const expectNoNativeCalls = async (page: Page) => {
  expect(
    await page.evaluate(() =>
      Reflect.get(globalThis, '__tabbinPracticeGuardsReady'),
    ),
  ).toBe(true)
  expect(
    await page.evaluate(() =>
      Reflect.get(globalThis, '__tabbinPracticeNativeCalls'),
    ),
  ).toEqual([])
}

const exercisePracticeData = async (page: Page) => {
  const items = page.getByTestId('sortable-url-item')
  await expect(items).toHaveCount(6)
  const first = items.first()
  await first.hover()
  await first.getByRole('button', { name: 'Delete tab', exact: true }).click()
  await expect(items).toHaveCount(5)
  await page
    .getByRole('button', { name: 'Reset practice', exact: true })
    .click()
  await expect(items).toHaveCount(6)

  // Practice exposes buttons instead of native hrefs, so modifier and middle
  // clicks cannot bypass the simulated BrowserTabPort.
  await expect(page.locator('a[href^="http"]')).toHaveCount(0)
  const title = page.getByTestId('url-title-label').first()
  await title.click({ modifiers: ['ControlOrMeta'] })
  await title.click({ button: 'middle' })
  await page
    .getByRole('button', { name: 'Reset practice', exact: true })
    .click()
  await expect(items).toHaveCount(6)
  await page.getByRole('button', { name: 'Start empty', exact: true }).click()
  await expect(items).toHaveCount(0)
  await page
    .getByRole('button', { name: 'Simulate saving tabs', exact: true })
    .click()
  await expect(items).toHaveCount(6)
}

const exerciseCategoryAndCustom = async (page: Page) => {
  await page
    .getByRole('button', { name: 'Manage parent categories', exact: true })
    .click()
  const dialog = page.getByRole('dialog', {
    name: 'Manage parent categories',
    exact: true,
  })
  await dialog
    .getByRole('textbox', { name: 'New parent category' })
    .fill('Practice only')
  await dialog
    .getByRole('textbox', { name: 'New parent category' })
    .press('Enter')
  await dialog.getByRole('combobox', { name: 'Select parent category' }).click()
  await expect(
    page.getByRole('option', { name: 'Practice only', exact: true }),
  ).toBeVisible()
  await page.getByRole('option', { name: 'Practice only', exact: true }).click()
  const domain = dialog.getByRole('checkbox', {
    name: 'notes.academy.test',
    exact: true,
  })
  await domain.click()
  await expect(domain).toBeChecked()
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(
    page.getByRole('heading', { name: 'Practice only', exact: true }),
  ).toBeVisible()
  await page.getByRole('combobox', { name: 'Switch view mode' }).click()
  await page.getByRole('option', { name: 'Custom mode', exact: true }).click()
  await expect(page.getByText('Demo collection', { exact: true })).toBeVisible()
  await expect(page.locator('a[href^="http"]')).toHaveCount(0)
  await expect(page.getByTestId('project-url-title')).toHaveCount(2)
  await page.getByTestId('project-url-title').first().click()
  await expectNoNativeCalls(page)
}

test('Academy practice modifies only memory through create, delete, restore, reset, reload and exit', async ({
  page,
  extensionId,
  serviceWorker,
}, testInfo) => {
  await seedSavedTabsFixture(serviceWorker, {
    storage: createBaseSeed({ practiceIsolationMarker: 'keep' }),
    persistence: createExamplePersistenceFixture(1_800_000_000_000),
  })
  await guardPracticeApis(page)
  await page.goto(getExtensionUrl(extensionId, 'app.html#/academy/domain-mode'))
  await page.getByRole('tab', { name: 'Try it yourself', exact: true }).click()
  const before = await readBoundary(serviceWorker)
  await page.getByRole('link', { name: 'Try it yourself', exact: true }).click()
  await expect(page).toHaveURL(/practice\.html\?lessonId=domain-mode&lang=en$/u)
  await expect(
    page.getByRole('heading', {
      name: 'TABBIN Academy · Practice data',
      exact: true,
    }),
  ).toBeVisible()
  await exercisePracticeData(page)
  await page.screenshot({
    path: testInfo.outputPath('academy-practice-before-categories-en.png'),
    fullPage: true,
  })
  await exerciseCategoryAndCustom(page)
  await expectNoNativeCalls(page)
  expect(await readBoundary(serviceWorker)).toEqual(before)
  await page.reload()
  await expect(
    page.getByRole('heading', {
      name: 'TABBIN Academy · Practice data',
      exact: true,
    }),
  ).toBeVisible()
  await expect(page.getByTestId('sortable-url-item')).toHaveCount(6)
  await expectNoNativeCalls(page)
  expect(await readBoundary(serviceWorker)).toEqual(before)
  await page.screenshot({
    path: testInfo.outputPath('academy-practice-en.png'),
    fullPage: true,
  })
  await page.getByRole('link', { name: 'Exit practice', exact: true }).click()
  await expect(page).toHaveURL(/app\.html#\/academy\/domain-mode$/u)
  expect(await readPersistenceV2SavedTabsSnapshot(serviceWorker)).toEqual(
    before.savedTabs,
  )
})

test('Academy practice stays explicit in Japanese narrow dark keyboard use', async ({
  page,
  extensionId,
  serviceWorker,
}, testInfo) => {
  await seedSavedTabsFixture(serviceWorker, {
    storage: createBaseSeed(),
    persistence: createExamplePersistenceFixture(1_800_000_000_000),
  })
  const before = await readBoundary(serviceWorker)
  await guardPracticeApis(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
  await page.goto(
    getExtensionUrl(extensionId, 'practice.html?lang=ja&lessonId=domain-mode'),
  )
  await expect(
    page.getByRole('heading', {
      name: 'TABBIN Academy · 練習用データ',
      exact: true,
    }),
  ).toBeVisible()
  const reset = page.getByRole('button', {
    name: '練習をリセット',
    exact: true,
  })
  await reset.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('sortable-url-item')).toHaveCount(6)
  const layout = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
    overflowing: [...document.querySelectorAll('body *')]
      .filter(
        (element) => element.getBoundingClientRect().right > window.innerWidth,
      )
      .slice(0, 8)
      .map((element) => ({
        tag: element.tagName,
        className: element.className,
      })),
  }))
  await page.screenshot({
    path: testInfo.outputPath('academy-practice-before-layout-ja.png'),
    fullPage: true,
  })
  expect(layout.width, JSON.stringify(layout)).toBeLessThanOrEqual(
    layout.viewport,
  )
  await assertNoAxeViolations(page, 'Academy practice Japanese narrow dark')
  await page.screenshot({
    path: testInfo.outputPath('academy-practice-narrow-ja.png'),
    fullPage: true,
  })
  await expectNoNativeCalls(page)
  expect(await readBoundary(serviceWorker)).toEqual(before)
})
