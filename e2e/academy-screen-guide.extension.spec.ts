import type { Page, Worker } from '@playwright/test'

import {
  createEmptyPersistenceFixture,
  createExamplePersistenceFixture,
} from '@/test/fixtures/persistenceBrowserFixtures'

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

const guide = (page: Page) =>
  page.getByRole('dialog', { name: 'Screen guide', exact: true })

const readUserData = async (serviceWorker: Worker) => ({
  savedTabs: await readPersistenceV2SavedTabsSnapshot(serviceWorker),
  settings: await readStorage(serviceWorker, ['userSettings']),
  tabs: await serviceWorker.evaluate(async () =>
    (await chrome.tabs.query({}))
      .map(({ id }) => id)
      .toSorted((left, right) => (left ?? -1) - (right ?? -1)),
  ),
})

const startFromLesson = async (
  page: Page,
  extensionId: string,
  serviceWorker: Worker,
  lessonId = 'domain-mode',
) => {
  await page.goto(getExtensionUrl(extensionId, `app.html#/academy/${lessonId}`))
  await page.getByRole('tab', { name: 'Screen guide', exact: true }).click()
  // App bootstrap normalizes older settings fixtures. Capture the user's
  // current state after that load and before the guide starts.
  const before = await readUserData(serviceWorker)
  await page
    .getByRole('link', { name: 'Start screen guide', exact: true })
    .click()
  await expect(guide(page)).toBeVisible()
  return before
}

const next = async (page: Page) => {
  await guide(page).getByRole('button', { name: 'Next', exact: true }).click()
}

const expectGuideFocus = async (page: Page) => {
  await expect
    .poll(async () => {
      const state = await guide(page).evaluate((element) => ({
        inside: element.contains(document.activeElement),
        active: document.activeElement?.outerHTML.slice(0, 500),
        role: element.getAttribute('role'),
        ariaModal: element.getAttribute('aria-modal'),
        buttons: [...element.querySelectorAll('button')].map((button) => ({
          text: button.textContent,
          action: button.getAttribute('data-action'),
        })),
      }))
      return state.inside ? 'inside guide' : JSON.stringify(state)
    })
    .toBe('inside guide')
}

const expectGuideWithinViewport = async (page: Page) => {
  const layout = await guide(page).evaluate((element) => {
    const bounds = (node: Element | null) => {
      if (!node) {
        return null
      }
      const { x, y, width, height, right, bottom } =
        node.getBoundingClientRect()
      return { x, y, width, height, right, bottom }
    }
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      tooltip: bounds(element),
      floater: bounds(element.parentElement),
      offsetParent: bounds(
        element instanceof HTMLElement ? element.offsetParent : null,
      ),
      modal: bounds(
        document.querySelector('[data-tour="academy-parent-dialog"]'),
      ),
    }
  })
  expect(layout.tooltip?.x, JSON.stringify(layout)).toBeGreaterThanOrEqual(0)
  expect(layout.tooltip?.y, JSON.stringify(layout)).toBeGreaterThanOrEqual(0)
  expect(layout.tooltip?.right, JSON.stringify(layout)).toBeLessThanOrEqual(
    layout.viewport.width,
  )
  expect(layout.tooltip?.bottom, JSON.stringify(layout)).toBeLessThanOrEqual(
    layout.viewport.height,
  )
}

const tabThroughGuide = async (
  page: Page,
  remaining: number,
  key = 'Tab',
): Promise<void> => {
  if (remaining === 0) {
    return
  }
  await page.keyboard.press(key)
  await expectGuideFocus(page)
  await tabThroughGuide(page, remaining - 1, key)
}

test('Academy screen guide completes the real Domain and Custom views without changing saved data or tabs', async ({
  page,
  extensionId,
  serviceWorker,
}, testInfo) => {
  await seedSavedTabsFixture(serviceWorker, {
    storage: createBaseSeed(),
    persistence: createExamplePersistenceFixture(1_800_000_000_000),
  })
  const before = await startFromLesson(page, extensionId, serviceWorker)
  await expect(page.getByTestId('url-title-label')).toHaveText('Example Home')
  await expect(
    guide(page).getByRole('button', { name: 'Next', exact: true }),
  ).toBeVisible()
  await expect(
    guide(page).getByRole('button', { name: 'Back', exact: true }),
  ).toHaveCount(0)
  await page.screenshot({ path: '/tmp/tabbin-1002-guide.png', fullPage: true })
  await page.screenshot({
    path: testInfo.outputPath('academy-screen-guide-first-step.png'),
    fullPage: true,
  })
  await assertNoAxeViolations(page, 'Academy screen guide saved URL')
  await next(page)
  await guide(page).getByRole('button', { name: 'Back', exact: true }).click()
  await expect(page.getByTestId('url-title-label')).toHaveText('Example Home')
  await next(page)
  await next(page)
  await expect(page).toHaveURL(/mode=custom/u)
  await guide(page).getByRole('button', { name: 'Finish', exact: true }).click()
  await expect(
    page.getByText('Screen guide viewed', { exact: true }),
  ).toBeVisible()
  expect(await readUserData(serviceWorker)).toEqual(before)

  await page.getByRole('button', { name: 'Replay', exact: true }).click()
  await expect(
    guide(page).getByRole('button', { name: 'Next', exact: true }),
  ).toBeVisible()
  await guide(page).getByRole('button', { name: 'Skip', exact: true }).click()
  await expect(page).toHaveURL(/app\.html#\/academy\/domain-mode$/u)
  await expect(
    page.getByText('Screen guide viewed', { exact: false }),
  ).toBeVisible()
  await page.reload()
  await expect(
    page.getByText('Screen guide viewed', { exact: false }),
  ).toBeVisible()
  await expect(
    page.getByText('Practice completed', { exact: false }),
  ).toHaveCount(0)
  await expect(
    page.getByText('Practice not completed', { exact: false }),
  ).toBeVisible()
  expect(await readUserData(serviceWorker)).toEqual(before)
})

test('Academy parent category guide opens the actual Radix dialog with keyboard focus and no writes', async ({
  page,
  extensionId,
  serviceWorker,
}, testInfo) => {
  const seed = createBaseSeed()
  await seedSavedTabsFixture(serviceWorker, {
    storage: {
      ...seed,
      userSettings: { ...seed.userSettings, enableCategories: true },
    },
    persistence: createExamplePersistenceFixture(1_800_000_000_000),
  })
  const before = await startFromLesson(
    page,
    extensionId,
    serviceWorker,
    'parent-categories',
  )
  const nextButton = guide(page).getByRole('button', {
    name: 'Next',
    exact: true,
  })
  await nextButton.focus()
  await page.keyboard.press('Enter')
  const categories = page.getByRole('dialog', {
    name: 'Manage parent categories',
    exact: true,
  })
  await expect(categories).toBeVisible()
  await expect(guide(page)).toBeVisible()
  await expect(
    guide(page).getByRole('button', { name: 'Finish', exact: true }),
  ).toBeInViewport()
  await expectGuideWithinViewport(page)
  await tabThroughGuide(page, 8)
  await tabThroughGuide(page, 8, 'Shift+Tab')
  await assertNoAxeViolations(
    page,
    'Academy screen guide Radix category dialog',
  )
  await page.screenshot({
    path: testInfo.outputPath('academy-screen-guide-category-dialog.png'),
    fullPage: true,
  })
  await guide(page).getByRole('button', { name: 'Finish', exact: true }).click()
  await expect(categories).toBeHidden()
  await expect(
    page.getByText('Screen guide viewed', { exact: true }),
  ).toBeVisible()
  expect(await readUserData(serviceWorker)).toEqual(before)
})

test('Academy empty data guide has a bounded fallback and retry never invents completion', async ({
  page,
  extensionId,
  serviceWorker,
}) => {
  await seedSavedTabsFixture(serviceWorker, {
    storage: createBaseSeed(),
    persistence: createEmptyPersistenceFixture(),
  })
  const before = await startFromLesson(page, extensionId, serviceWorker)
  const missing = page.getByText('This part of the screen is not available.', {
    exact: false,
  })
  await expect(missing).toBeVisible()
  await expect(
    guide(page).getByRole('button', { name: 'Finish', exact: true }),
  ).toHaveCount(0)
  await guide(page).getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(missing).toBeVisible()
  await guide(page).getByRole('button', { name: 'Skip', exact: true }).click()
  await expect(page).toHaveURL(/app\.html#\/academy\/domain-mode$/u)
  await expect(
    page.getByText('Screen guide viewed', { exact: false }),
  ).toHaveCount(0)
  await expect(
    page.getByText('Screen guide not viewed', { exact: false }),
  ).toBeVisible()
  expect(await readUserData(serviceWorker)).toEqual(before)
  await expect(page.getByText(/academy\.test/u)).toHaveCount(0)
})

test('Academy guide supports narrow dark reduced-motion keyboard use and Escape without completion', async ({
  page,
  extensionId,
  serviceWorker,
}, testInfo) => {
  await seedSavedTabsFixture(serviceWorker, {
    storage: createBaseSeed({ 'tab-manager-theme': 'dark' }),
    persistence: createExamplePersistenceFixture(1_800_000_000_000),
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' })
  const before = await startFromLesson(page, extensionId, serviceWorker)
  await expect(
    guide(page).getByRole('button', { name: 'Next', exact: true }),
  ).toBeVisible()
  await expectGuideFocus(page)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  await assertNoAxeViolations(
    page,
    'Academy screen guide narrow dark reduced motion',
  )
  await expectGuideWithinViewport(page)
  await page.screenshot({
    path: testInfo.outputPath('academy-screen-guide-narrow-dark.png'),
    fullPage: true,
  })
  const target = page.locator('[data-tour="academy-saved-url"]').first()
  await target.evaluate((element) => {
    element.style.visibility = 'hidden'
  })
  await expect(
    page.getByText('This part of the screen is not available.', {
      exact: false,
    }),
  ).toBeVisible()
  await target.evaluate((element) => {
    element.style.visibility = ''
  })
  await guide(page).getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(
    guide(page).getByRole('button', { name: 'Next', exact: true }),
  ).toBeVisible()
  await expectGuideFocus(page)
  await page.keyboard.press('Escape')
  await expect(
    page.getByRole('button', { name: 'Next', exact: true }),
  ).toHaveCount(0)
  await page.goto(getExtensionUrl(extensionId, 'app.html#/academy/domain-mode'))
  await expect(
    page.getByText('Screen guide viewed', { exact: false }),
  ).toHaveCount(0)
  await expect(
    page.getByText('Screen guide not viewed', { exact: false }),
  ).toBeVisible()
  expect(await readUserData(serviceWorker)).toEqual(before)
})

test('Academy guide engine is not requested by the initial Options route', async ({
  page,
  extensionId,
  serviceWorker,
}) => {
  await seedSavedTabsFixture(serviceWorker, {
    storage: createBaseSeed(),
    persistence: createExamplePersistenceFixture(1_800_000_000_000),
  })
  const requested: string[] = []
  page.on('request', (request) => requested.push(request.url()))
  await page.goto(getExtensionUrl(extensionId, 'app.html#/options'))
  await expect(
    page.getByRole('heading', { name: 'Options', exact: true }),
  ).toBeVisible()
  expect(requested.filter((url) => /\/AcademyScreenGuide-/u.test(url))).toEqual(
    [],
  )
  await startFromLesson(page, extensionId, serviceWorker)
  expect(
    requested.filter((url) => /\/AcademyScreenGuide-/u.test(url)),
  ).not.toEqual([])
})
