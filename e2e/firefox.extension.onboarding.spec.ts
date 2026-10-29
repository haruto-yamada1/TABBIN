/* eslint-disable playwright/expect-expect -- shared native scenario asserts real UI, keyboard, storage, and reload */
/* eslint-disable playwright/no-skipped-test -- native Firefox acceptance is gated by FIREFOX_EXTENSION_SMOKE=1 */
import path from 'node:path'

import { expect, test } from '@playwright/test'

// eslint-disable-next-line import/no-relative-parent-imports -- reuse the production-artifact native Firefox installer
import { withFirefoxExtension } from '../tools/scripts/firefoxExtensionSession'
// eslint-disable-next-line import/no-relative-parent-imports -- native transport owns the installed extension origin
import type { FirefoxExtensionSession } from '../tools/scripts/firefoxExtensionSession'
import { createBaseSeed, defaultUserSettings } from './helpers/extension'
import { isFirefoxExtensionSmokeEnabled } from './helpers/firefox-extension'

const languages = ['ja', 'en'] as const
type Language = (typeof languages)[number]
const TAB = '\uE004'
const ENTER = '\uE007'
const labels = {
  ja: {
    title: 'TABBINをはじめよう',
    options: '基本操作ガイド',
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
    options: 'Basic guide',
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

type GuideState = {
  buttons: string[]
  focused: boolean
  hasDialog: boolean
  overflows: boolean
  steps: string[]
}

const findGuideScript = `
  const guide = Array.from(document.querySelectorAll('section[aria-labelledby]'))
    .find((section) => document.getElementById(section.getAttribute('aria-labelledby'))?.textContent === arguments[0]);
`

const readGuide = async (
  session: FirefoxExtensionSession,
  title: string,
): Promise<GuideState | null> =>
  (await session.evaluate(
    `${findGuideScript}
    if (!guide) return null;
    return {
      buttons: Array.from(guide.querySelectorAll('button'), (button) => button.textContent.trim()),
      focused: guide.contains(document.activeElement),
      hasDialog: !!document.querySelector('[role="dialog"], [role="alertdialog"]'),
      overflows: guide.scrollWidth > guide.clientWidth,
      steps: Array.from(guide.querySelectorAll('h3'), (heading) => {
        const clone = heading.cloneNode(true);
        clone.querySelectorAll('[aria-hidden="true"]').forEach((node) => node.remove());
        return clone.textContent.trim();
      }),
    };`,
    [title],
  )) as GuideState | null

const tabToButton = async (
  session: FirefoxExtensionSession,
  title: string,
  name: string,
) => {
  const isFocused = async () =>
    session.evaluate(
      `${findGuideScript}
      const button = guide && Array.from(guide.querySelectorAll('button'))
        .find((candidate) => candidate.textContent.trim() === arguments[1]);
      return !!button && button === document.activeElement;`,
      [title, name],
    )
  // Traverse the real browser focus order; never synthesize keyboard events.
  /* eslint-disable no-await-in-loop -- each native key action changes focus */
  for (let index = 0; index < 100; index += 1) {
    if (await isFocused()) {
      return
    }
    await session.pressKey(TAB)
  }
  /* eslint-enable no-await-in-loop */
  expect(await isFocused()).toBe(true)
}

const waitForSavedTabs = async (
  session: FirefoxExtensionSession,
  language: Language,
) => {
  await expect
    .poll(async () =>
      session.evaluate(
        `return Array.from(document.querySelectorAll('input'))
          .some((input) => input.getAttribute('aria-label') === arguments[0]);`,
        [labels[language].search],
      ),
    )
    .toBe(true)
}

const verifyNativeOnboarding = async (
  language: Language,
  dismissal: 'completion' | 'skip',
) => {
  const text = labels[language]
  await withFirefoxExtension(
    path.join(process.cwd(), '.output', 'firefox-mv2'),
    async (session) => {
      await session.navigate('options.html')
      expect(await session.evaluate('return browser.runtime.id;')).toBe(
        'tabbin@local',
      )
      const seededLanguage = await session.evaluate(
        `return browser.storage.local.clear()
          .then(() => browser.storage.local.set(arguments[0]))
          .then(() => browser.storage.local.get('userSettings'))
          .then((stored) => stored.userSettings.language);`,
        [
          createBaseSeed({
            userSettings: { ...defaultUserSettings, language },
          }),
        ],
      )
      expect(seededLanguage).toBe(language)
      await session.navigate('saved-tabs.html?mode=domain')
      await expect
        .poll(async () => readGuide(session, text.title))
        .toMatchObject({
          buttons: [text.show, text.skip],
          focused: false,
          hasDialog: false,
          steps: [],
        })

      if (dismissal === 'completion') {
        await tabToButton(session, text.title, text.show)
        await session.pressKey(ENTER)
        await expect
          .poll(async () => readGuide(session, text.title))
          .toMatchObject({ steps: [...text.steps], buttons: [text.close] })
      }
      const dismissLabel = dismissal === 'completion' ? text.close : text.skip
      await tabToButton(session, text.title, dismissLabel)
      await session.pressKey(dismissal === 'completion' ? ' ' : ENTER)
      await expect
        .poll(async () =>
          session.evaluate(
            'return browser.storage.local.get("onboardingDismissed");',
          ),
        )
        .toEqual({ onboardingDismissed: true })
      await session.reload()
      await waitForSavedTabs(session, language)
      expect(await readGuide(session, text.title)).toBeNull()

      await session.navigate('app.html#/options')
      await expect
        .poll(async () => readGuide(session, text.options))
        .toMatchObject({ buttons: [text.show], steps: [] })
      await tabToButton(session, text.options, text.show)
      await session.pressKey(ENTER)
      // Native Firefox desktop windows have a 500px minimum width.
      // The Chromium scenario also checks the narrower 360px viewport.
      await session.resize(500, 800)
      await expect
        .poll(async () => readGuide(session, text.options))
        .toMatchObject({ steps: [...text.steps], overflows: false })
      expect(await session.evaluate('return window.innerWidth;')).toBe(500)
      expect(
        await session.evaluate(
          'return browser.storage.local.get("onboardingDismissed");',
        ),
      ).toEqual({ onboardingDismissed: true })
      await session.navigate('app.html#/saved-tabs?mode=custom')
      await waitForSavedTabs(session, language)
      expect(await readGuide(session, text.title)).toBeNull()
    },
  )
}

test.beforeAll(() => {
  test.skip(
    !isFirefoxExtensionSmokeEnabled(),
    'set FIREFOX_EXTENSION_SMOKE=1 to run native Firefox onboarding acceptance',
  )
})

for (const language of languages) {
  for (const dismissal of ['completion', 'skip'] as const) {
    test(`Firefox onboarding ${language} ${dismissal} persists and Options reopens the guide`, async () => {
      await verifyNativeOnboarding(language, dismissal)
    })
  }
}
