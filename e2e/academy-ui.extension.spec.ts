import { ok } from 'node:assert/strict'

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
  seedStorage,
  test,
} from './helpers/extension'

const academyProgressKey = 'academyProgressV1'

test('Fresh install opens the saved tabs page without storing tabs', async ({
  extensionContext,
  serviceWorker,
}) => {
  await expect
    .poll(async () => {
      const data = await serviceWorker.evaluate(async () =>
        chrome.storage.local.get('changelogShown'),
      )
      return data.changelogShown
    })
    .toBe(true)
  await expect
    .poll(() =>
      extensionContext
        .pages()
        .some((candidate) => candidate.url().includes('app.html')),
    )
    .toBe(true)
  const installed = extensionContext
    .pages()
    .find((candidate) => candidate.url().includes('app.html'))
  ok(installed, 'Install page missing')
  const before = await readPersistenceV2SavedTabsSnapshot(serviceWorker)
  await expect(
    installed.getByRole('heading', { name: 'Saved tabs', exact: true }),
  ).toBeVisible()
  await installed.reload()
  expect(await readPersistenceV2SavedTabsSnapshot(serviceWorker)).toEqual(
    before,
  )
})

test('Academy code loads only when navigating to the learning center', async ({
  page,
  extensionId,
  serviceWorker,
}) => {
  await seedStorage(serviceWorker, createBaseSeed())
  const requested: string[] = []
  page.on('request', (request) => requested.push(request.url()))
  await page.goto(getExtensionUrl(extensionId, 'app.html#/options'))
  await expect(
    page.getByRole('heading', { name: 'Options', exact: true }),
  ).toBeVisible()
  expect(requested.filter((url) => url.includes('/AcademyRoute-'))).toEqual([])
  await page
    .getByRole('link', { name: 'TABBIN Academy', exact: true })
    .first()
    .click()
  await expect(
    page.getByRole('heading', { name: 'TABBIN Academy', exact: true }),
  ).toBeVisible()
  expect(requested.filter((url) => url.includes('/AcademyRoute-'))).not.toEqual(
    [],
  )
  expect(requested.filter((url) => /\.(mp4|vtt)(?:\?|$)/u.test(url))).toEqual(
    [],
  )
})

for (const scenario of [
  {
    name: 'saved',
    fixture: () => createExamplePersistenceFixture(1_800_000_000_000),
    titles: ['Example Home'],
  },
  { name: 'empty', fixture: createEmptyPersistenceFixture, titles: [] },
]) {
  test(`Academy screen explanation opens the real ${scenario.name} data without practice adapters or injected samples`, async ({
    page,
    extensionId,
    serviceWorker,
  }) => {
    await seedSavedTabsFixture(serviceWorker, {
      storage: createBaseSeed(),
      persistence: scenario.fixture(),
    })
    const requested: string[] = []
    page.on('request', (request) => requested.push(request.url()))
    await page.goto(
      getExtensionUrl(extensionId, 'app.html#/academy/domain-mode'),
    )
    await expect(
      page.getByRole('heading', { name: 'Explore Domain mode', exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('tab', { name: 'Practice with samples', exact: true }),
    ).toBeDisabled()
    await expect(page.locator('a[href*="practice.html"]')).toHaveCount(0)
    const before = await readPersistenceV2SavedTabsSnapshot(serviceWorker)
    const settingsBefore = await readStorage(serviceWorker, ['userSettings'])
    const tabsBefore = await serviceWorker.evaluate(async () =>
      (await chrome.tabs.query({}))
        .map(({ id }) => id)
        .toSorted((left, right) => (left ?? -1) - (right ?? -1)),
    )
    await page
      .getByRole('link', { name: 'Open the real screen', exact: true })
      .click()
    await expect(page).toHaveURL(/app\.html#\/saved-tabs\?mode=domain$/u)
    await expect(
      page.getByTestId('saved-tabs-page-presentation'),
    ).toHaveAttribute('data-loading', 'false')
    await expect(page.getByTestId('url-title-label')).toHaveText(
      scenario.titles,
    )
    await expect(page.getByTestId('sortable-url-item')).toHaveCount(
      scenario.titles.length,
    )
    await expect(
      page.getByRole('heading', { name: /Practice data/ }),
    ).toHaveCount(0)
    await expect(page.getByText(/academy\.test/u)).toHaveCount(0)
    expect(
      requested.filter((url) =>
        /\/(?:practice|PracticePage|createPracticeComposition)[-.]/u.test(url),
      ),
    ).toEqual([])
    expect(await readPersistenceV2SavedTabsSnapshot(serviceWorker)).toEqual(
      before,
    )
    expect(await readStorage(serviceWorker, ['userSettings'])).toEqual(
      settingsBefore,
    )
    expect(
      await serviceWorker.evaluate(async () =>
        (await chrome.tabs.query({}))
          .map(({ id }) => id)
          .toSorted((left, right) => (left ?? -1) - (right ?? -1)),
      ),
    ).toEqual(tabsBefore)
  })
}

test('Academy direct links, navigation and review preserve saved data and real tabs', async ({
  page,
  extensionId,
  serviceWorker,
}, testInfo) => {
  await seedSavedTabsFixture(serviceWorker, {
    storage: createBaseSeed(),
    persistence: createExamplePersistenceFixture(Date.now()),
  })
  const before = await readPersistenceV2SavedTabsSnapshot(serviceWorker)
  const app = getExtensionUrl(extensionId, 'app.html')
  await page.goto(`${app}#/academy/domain-mode`)
  await expect(
    page.getByRole('heading', { name: 'Explore Domain mode', exact: true }),
  ).toBeVisible()
  const tabIds = await serviceWorker.evaluate(async () =>
    (await chrome.tabs.query({}))
      .map((tab) => tab.id)
      .toSorted((a, b) => (a ?? -1) - (b ?? -1)),
  )
  await expect(
    page.getByRole('tab', { name: 'Learn by video', exact: true }),
  ).toBeDisabled()
  await expect(
    page.getByRole('tab', { name: 'Practice with samples', exact: true }),
  ).toBeDisabled()
  await page
    .getByRole('button', { name: 'Start this lesson', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Skip this lesson', exact: true })
    .click()
  await page.goto(`${app}#/academy`)
  await expect(
    page.getByRole('heading', { name: 'TABBIN Academy', exact: true }),
  ).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('academy-top-en.png'),
    fullPage: true,
  })
  await page.goto(`${app}#/options`)
  await page
    .getByRole('link', { name: 'Open TABBIN Academy', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'TABBIN Academy', exact: true }),
  ).toBeVisible()
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'TABBIN Academy', exact: true }),
  ).toBeVisible()
  expect(await readPersistenceV2SavedTabsSnapshot(serviceWorker)).toEqual(
    before,
  )
  expect(
    await serviceWorker.evaluate(async () =>
      (await chrome.tabs.query({}))
        .map((tab) => tab.id)
        .toSorted((a, b) => (a ?? -1) - (b ?? -1)),
    ),
  ).toEqual(tabIds)
})

test('Academy handles progress failure, retry and missing lesson URLs', async ({
  page,
  extensionId,
  serviceWorker,
}) => {
  await seedStorage(
    serviceWorker,
    createBaseSeed({ [academyProgressKey]: { schemaVersion: 999 } }),
  )
  const app = getExtensionUrl(extensionId, 'app.html')
  await page.goto(`${app}#/academy`)
  await expect(page.getByRole('alert')).toContainText(
    'Could not load learning progress.',
  )
  await serviceWorker.evaluate(async () =>
    chrome.storage.local.remove('academyProgressV1'),
  )
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(
    page.getByRole('link', { name: 'Pin the extension', exact: true }),
  ).toBeVisible()
  await page.goto(`${app}#/academy/unknown-lesson`)
  await expect(
    page.getByText('Lesson not found', { exact: true }),
  ).toBeVisible()
})

test('Academy Japanese narrow dark reduced-motion keyboard accessibility', async ({
  page,
  extensionId,
  serviceWorker,
}, testInfo) => {
  const seed = createBaseSeed()
  await seedStorage(serviceWorker, {
    ...seed,
    userSettings: { ...seed.userSettings, language: 'ja' },
    'tab-manager-theme': 'dark',
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' })
  await page.goto(getExtensionUrl(extensionId, 'app.html#/academy'))
  await expect(
    page.getByRole('heading', { name: 'はじめてのTABBIN', exact: true }),
  ).toBeVisible()
  const lesson = page.getByRole('link', {
    name: '拡張機能を固定',
    exact: true,
  })
  await lesson.focus()
  await page.keyboard.press('Enter')
  await expect(
    page.getByRole('heading', { name: '拡張機能を固定', exact: true }),
  ).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  await assertNoAxeViolations(page, 'Academy lesson Japanese narrow dark')
  await page.screenshot({
    path: testInfo.outputPath('academy-narrow-ja.png'),
    fullPage: true,
  })
})
