/* eslint-disable playwright/expect-expect -- shared keyboard scenarios assert live UI, focus, committed storage, and reload */
import { getFirefoxExtensionUrl, test } from './helpers/firefox-extension'
import {
  recordKeyboardState,
  verifyKeyboardCustomCategories,
  verifyKeyboardCustomHierarchy,
  verifyKeyboardDomainCategories,
  verifyKeyboardUrlOrdering,
} from './helpers/keyboard-dnd'

test.describe('Firefox keyboard drag and drop accessibility', () => {
  test.beforeEach(async ({ firefoxExtensionPage, firefoxExtensionUuid }) => {
    await firefoxExtensionPage.goto(
      getFirefoxExtensionUrl(firefoxExtensionUuid, 'options.html'),
    )
  })

  test.afterEach(async ({ firefoxExtensionPage }, testInfo) => {
    await recordKeyboardState(
      firefoxExtensionPage,
      testInfo,
      'final-keyboard-state',
    )
  })

  for (const mode of ['domain', 'custom'] as const) {
    test(`${mode} URL keyboard order survives cancellation, drop and reload`, async ({
      firefoxExtensionPage: page,
      firefoxExtensionUuid,
    }, testInfo) => {
      await verifyKeyboardUrlOrdering(
        {
          page,
          serviceWorker: page,
          mode,
          appUrl: getFirefoxExtensionUrl(
            firefoxExtensionUuid,
            `app.html#/saved-tabs?mode=${mode}`,
          ),
        },
        testInfo,
      )
    })
  }

  for (const parent of [false, true]) {
    test(`domain ${parent ? 'parent' : 'child'} category keyboard preview can be canceled and saved`, async ({
      firefoxExtensionPage: page,
      firefoxExtensionUuid,
    }, testInfo) => {
      await verifyKeyboardDomainCategories(
        {
          page,
          serviceWorker: page,
          parent,
          appUrl: getFirefoxExtensionUrl(
            firefoxExtensionUuid,
            'app.html#/saved-tabs?mode=domain',
          ),
        },
        testInfo,
      )
    })
  }

  test('custom category keyboard order survives cancellation and reload', async ({
    firefoxExtensionPage: page,
    firefoxExtensionUuid,
  }) => {
    await verifyKeyboardCustomCategories({
      page,
      serviceWorker: page,
      appUrl: getFirefoxExtensionUrl(
        firefoxExtensionUuid,
        'app.html#/saved-tabs?mode=custom',
      ),
    })
  })

  test('custom URL keyboard moves through an empty category, uncategorized area, and another project', async ({
    firefoxExtensionPage: page,
    firefoxExtensionUuid,
  }) => {
    await verifyKeyboardCustomHierarchy({
      page,
      serviceWorker: page,
      appUrl: getFirefoxExtensionUrl(
        firefoxExtensionUuid,
        'app.html#/saved-tabs?mode=custom',
      ),
    })
  })
})
