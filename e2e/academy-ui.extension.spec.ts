import { ok } from 'node:assert/strict'

import type { Page } from '@playwright/test'

import { createExamplePersistenceFixture } from '@/test/fixtures/persistenceBrowserFixtures'

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

const dismissWelcome = {
  later: async (page: Page) =>
    page
      .getByRole('dialog')
      .getByRole('button', { name: 'Later', exact: true })
      .click(),
  skip: async (page: Page) =>
    page
      .getByRole('dialog')
      .getByRole('button', { name: 'Skip', exact: true })
      .click(),
  escape: async (page: Page) => page.keyboard.press('Escape'),
  start: async (page: Page) =>
    page
      .getByRole('dialog')
      .getByRole('button', { name: 'Start the guide', exact: true })
      .click(),
}

const academyProgressKey = 'academyProgressV1'

test('Academy is offered on a real fresh install without saving tabs', async ({
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
  await expect(
    installed.getByRole('dialog', { name: 'Welcome to TABBIN' }),
  ).toBeVisible()
  const before = await readPersistenceV2SavedTabsSnapshot(serviceWorker)
  await installed.getByRole('button', { name: 'Later', exact: true }).click()
  await installed.reload()
  await expect(installed.getByRole('dialog')).toBeHidden()
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
    page.getByRole('tab', { name: 'Try it yourself', exact: true }),
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

for (const action of ['later', 'skip', 'escape', 'start'] as const) {
  test(`Academy first-install ${action} stays dismissed after reload and manual revisit`, async ({
    page,
    extensionId,
    serviceWorker,
  }) => {
    await seedStorage(
      serviceWorker,
      createBaseSeed({ academyWelcomeV1: 'pending' }),
    )
    const app = getExtensionUrl(extensionId, 'app.html')
    await page.goto(`${app}#/academy`)
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dismissWelcome[action](page)
    await expect(dialog).toBeHidden()
    expect(
      (
        await readStorage<{ academyWelcomeV1: string }>(serviceWorker, [
          'academyWelcomeV1',
        ])
      ).academyWelcomeV1,
    ).toBe('presented')
    await page.reload()
    await expect(
      page.getByRole('heading', { name: 'TABBIN Academy', exact: true }),
    ).toBeVisible()
    await expect(dialog).toBeHidden()
    await page.goto(`${app}#/academy/install-extension`)
    await expect(
      page.getByRole('heading', { name: 'Install TABBIN', exact: true }),
    ).toBeVisible()
    await expect(dialog).toBeHidden()
  })
}

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
    page.getByRole('link', { name: 'Install TABBIN', exact: true }),
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
    name: 'TABBINをインストール',
    exact: true,
  })
  await lesson.focus()
  await page.keyboard.press('Enter')
  await expect(
    page.getByRole('heading', { name: 'TABBINをインストール', exact: true }),
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
