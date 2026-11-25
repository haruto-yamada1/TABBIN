import { ok } from 'node:assert/strict'

import type { Page } from '@playwright/test'

import { canPracticeWithSamples } from '@/features/academy/application/services/AcademyPracticeService'
import {
  ACADEMY_LESSONS,
  ACADEMY_MESSAGES,
} from '@/features/academy/domain/academyCatalog'
import type { Lesson } from '@/features/academy/domain/academySchemas'
import { createExamplePersistenceFixture } from '@/test/fixtures/persistenceBrowserFixtures'

import { assertNoAxeViolations } from './helpers/axe'
import {
  createBaseSeed,
  expect,
  getExtensionUrl,
  readPersistenceV2SavedTabsSnapshot,
  seedSavedTabsFixture,
  test,
} from './helpers/extension'

const labels = {
  en: {
    start: 'Start this lesson',
    skip: 'Skip this lesson',
    skipped: 'Skipped',
    review: 'Review from the beginning',
    resume: 'Continue where you left off',
    back: 'All courses',
    video: 'Learn by video',
    practice: 'Practice with samples',
    safety: 'No samples are added to your saved tabs.',
  },
  ja: {
    start: 'このレッスンを始める',
    skip: 'このレッスンをスキップ',
    skipped: 'スキップ済み',
    review: '最初から見直す',
    resume: '前回の続きから',
    back: 'コース一覧へ',
    video: '動画で学ぶ',
    practice: 'サンプルで練習する',
    safety: '保存タブにサンプルを追加することはありません。',
  },
}

const verifyPracticeAvailability = async (
  page: Page,
  lesson: Lesson,
  locale: 'ja' | 'en',
) => {
  const text = labels[locale]
  const practice = page.getByRole('tab', {
    name: text.practice,
    exact: true,
  })
  if (canPracticeWithSamples(lesson)) {
    await practice.click()
    await expect(
      page.getByRole('link', { name: text.practice, exact: true }),
    ).toHaveAttribute(
      'href',
      `practice.html?lessonId=${lesson.lessonId}&lang=${locale}`,
    )
  } else {
    await expect(practice).toBeDisabled()
    await expect(page.locator('a[href*="practice.html"]')).toHaveCount(0)
    await expect(
      page
        .locator('#academy-practice-unavailable')
        .filter({ hasText: text.safety }),
    ).toBeVisible()
  }
}

for (const locale of ['en', 'ja'] as const) {
  for (const lesson of ACADEMY_LESSONS) {
    test(`Academy quality accessibility ${locale} ${lesson.lessonId}: defer, resume, review and explicit practice`, async ({
      page,
      extensionId,
      serviceWorker,
    }, testInfo) => {
      const seed = createBaseSeed()
      await seedSavedTabsFixture(serviceWorker, {
        storage: {
          ...seed,
          userSettings: { ...seed.userSettings, language: locale },
          'tab-manager-theme': locale === 'ja' ? 'dark' : 'light',
        },
        persistence: createExamplePersistenceFixture(1_800_000_000_000),
      })
      await page.setViewportSize({ width: 390, height: 844 })
      await page.emulateMedia({ reducedMotion: 'reduce' })
      const url = getExtensionUrl(
        extensionId,
        `app.html#/academy/${lesson.lessonId}`,
      )
      await page.goto(url)
      const title = ACADEMY_MESSAGES[locale][lesson.titleKey]
      ok(title, `Missing ${locale} title: ${lesson.lessonId}`)
      await expect(
        page.getByRole('heading', { level: 1, name: title, exact: true }),
      ).toBeVisible()
      const before = await readPersistenceV2SavedTabsSnapshot(serviceWorker)
      const tabs = await serviceWorker.evaluate(async () =>
        (await chrome.tabs.query({}))
          .map(({ id }) => id)
          .toSorted((left, right) => (left ?? -1) - (right ?? -1)),
      )
      const text = labels[locale]
      const start = page.getByRole('button', { name: text.start, exact: true })
      await start.focus()
      await page.keyboard.press('Enter')
      await expect(
        page.getByRole('button', { name: text.review, exact: true }),
      ).toBeEnabled()
      await page
        .getByRole('link', { name: text.back, exact: true })
        .first()
        .click()
      await page.reload()
      await page.getByRole('link', { name: text.resume, exact: true }).click()
      await expect(page).toHaveURL(url)
      await page.getByRole('button', { name: text.skip, exact: true }).click()
      await expect(page.getByText(text.skipped, { exact: true })).toBeVisible()
      await page.reload()
      await expect(page.getByText(text.skipped, { exact: true })).toBeVisible()
      const review = page.getByRole('button', {
        name: text.review,
        exact: true,
      })
      await review.focus()
      await page.keyboard.press('Enter')
      // Skipping is an independent historical fact; review preserves it.
      await expect(page.getByText(text.skipped, { exact: true })).toBeVisible()
      await expect(
        page.getByRole('tab', { name: text.video, exact: true }),
      ).toBeEnabled()
      await verifyPracticeAvailability(page, lesson, locale)
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true)
      await assertNoAxeViolations(page, `${locale} ${lesson.lessonId}`)
      expect(await readPersistenceV2SavedTabsSnapshot(serviceWorker)).toEqual(
        before,
      )
      expect(
        await serviceWorker.evaluate(async () =>
          (await chrome.tabs.query({}))
            .map(({ id }) => id)
            .toSorted((left, right) => (left ?? -1) - (right ?? -1)),
        ),
      ).toEqual(tabs)
      await page.screenshot({
        path: testInfo.outputPath(`${lesson.lessonId}-${locale}.png`),
        fullPage: true,
      })
    })
  }
}
