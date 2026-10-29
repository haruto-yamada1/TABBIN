import type { Locator, Page, TestInfo, Worker } from '@playwright/test'

import {
  createBaseSeed,
  defaultUserSettings,
  expect,
  readStorage,
  seedStorage,
} from './extension'
import { tabTo } from './keyboard-dnd'

export const onboardingLanguages = ['ja', 'en'] as const

type OnboardingLanguage = (typeof onboardingLanguages)[number]
type OnboardingScenario = {
  appUrl: string
  language: OnboardingLanguage
  page: Page
  serviceWorker: Pick<Worker, 'evaluate'>
}

const labels = {
  ja: {
    title: 'TABBINをはじめよう',
    optionsTitle: '基本操作ガイド',
    show: '使い方を見る',
    skip: 'スキップ',
    close: 'ガイドを閉じる',
    search: '検索',
    steps: [
      'タブを保存',
      'Domain / Customで分類',
      'タブを復元',
      'バックアップ',
    ],
  },
  en: {
    title: 'Get started with TABBIN',
    optionsTitle: 'Basic guide',
    show: 'Show guide',
    skip: 'Skip',
    close: 'Close guide',
    search: 'Search',
    steps: [
      'Save tabs',
      'Organize with Domain / Custom',
      'Restore tabs',
      'Back up',
    ],
  },
} as const

const startOnboarding = async ({
  appUrl,
  language,
  page,
  serviceWorker,
}: OnboardingScenario) => {
  await seedStorage(
    serviceWorker,
    createBaseSeed({
      userSettings: { ...defaultUserSettings, language },
    }),
  )
  await page.goto(`${appUrl}#/saved-tabs?mode=domain`)
  const guide = page.getByRole('region', { name: labels[language].title })
  await expect(guide).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(guide.locator(':focus')).toHaveCount(0)
  return guide
}

const expectAllSteps = async (guide: Locator, language: OnboardingLanguage) => {
  await Promise.all(
    labels[language].steps.map(async (title) => {
      await expect(
        guide.getByRole('heading', { name: title, exact: true }),
      ).toBeVisible()
    }),
  )
}

const expectDismissalSurvivesReload = async ({
  language,
  page,
  serviceWorker,
}: OnboardingScenario) => {
  await expect
    .poll(async () => readStorage(serviceWorker, 'onboardingDismissed'))
    .toEqual({ onboardingDismissed: true })
  await page.reload()
  await expect(
    page.getByRole('textbox', { name: labels[language].search, exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('region', { name: labels[language].title }),
  ).toHaveCount(0)
}

const expectOptionsCanReopen = async ({
  appUrl,
  language,
  page,
  serviceWorker,
}: OnboardingScenario) => {
  await page.goto(`${appUrl}#/options`)
  const guide = page.getByRole('region', {
    name: labels[language].optionsTitle,
  })
  const show = guide.getByRole('button', {
    name: labels[language].show,
    exact: true,
  })
  await tabTo(page, show)
  await page.keyboard.press('Enter')
  await expectAllSteps(guide, language)
  expect(await readStorage(serviceWorker, 'onboardingDismissed')).toEqual({
    onboardingDismissed: true,
  })
  await page.goto(`${appUrl}#/saved-tabs?mode=custom`)
  await expect(
    page.getByRole('textbox', { name: labels[language].search, exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('region', { name: labels[language].title }),
  ).toHaveCount(0)
}

export const verifyOnboardingCompletion = async (
  scenario: OnboardingScenario,
  testInfo: TestInfo,
) => {
  const { language, page } = scenario
  const guide = await startOnboarding(scenario)
  const show = guide.getByRole('button', {
    name: labels[language].show,
    exact: true,
  })
  await tabTo(page, show)
  await page.keyboard.press('Enter')
  await expectAllSteps(guide, language)
  if (language === 'ja') {
    const screenshotPath = testInfo.outputPath('onboarding-ja-desktop.png')
    await page.screenshot({ animations: 'disabled', path: screenshotPath })
    await testInfo.attach('onboarding-ja-desktop', {
      path: screenshotPath,
      contentType: 'image/png',
    })
  }
  await page.setViewportSize({ width: 360, height: 800 })
  await expectAllSteps(guide, language)
  expect(
    await guide.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true)
  if (language === 'en') {
    const screenshotPath = testInfo.outputPath('onboarding-en-narrow.png')
    await page.screenshot({ animations: 'disabled', path: screenshotPath })
    await testInfo.attach('onboarding-en-narrow', {
      path: screenshotPath,
      contentType: 'image/png',
    })
  }
  const close = guide.getByRole('button', {
    name: labels[language].close,
    exact: true,
  })
  await tabTo(page, close)
  await page.keyboard.press('Space')
  await expectDismissalSurvivesReload(scenario)
  await expectOptionsCanReopen(scenario)
}

export const verifyOnboardingSkip = async (scenario: OnboardingScenario) => {
  const guide = await startOnboarding(scenario)
  const skip = guide.getByRole('button', {
    name: labels[scenario.language].skip,
    exact: true,
  })
  await tabTo(scenario.page, skip)
  await scenario.page.keyboard.press('Enter')
  await expectDismissalSurvivesReload(scenario)
  await expectOptionsCanReopen(scenario)
}
