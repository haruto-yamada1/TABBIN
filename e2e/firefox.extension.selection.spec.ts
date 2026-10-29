/* eslint-disable playwright/expect-expect -- shared scenarios assert live selection, persistence, Undo, and opened browser tabs */
import { getFirefoxExtensionUrl, test } from './helpers/firefox-extension'
import {
  verifySelectionOpening,
  verifySelectionRangeAndUndo,
  verifySelectionSearchAndVisibility,
} from './helpers/selection'

test.beforeEach(async ({ firefoxExtensionPage, firefoxExtensionUuid }) => {
  await firefoxExtensionPage.goto(
    getFirefoxExtensionUrl(firefoxExtensionUuid, 'options.html'),
  )
})

test('Firefox domain selection follows rendered ranges and restores one bulk deletion', async ({
  firefoxExtensionPage: page,
  firefoxExtensionUuid,
}, testInfo) => {
  await verifySelectionRangeAndUndo(
    {
      appUrl: getFirefoxExtensionUrl(
        firefoxExtensionUuid,
        'app.html#/saved-tabs?mode=domain',
      ),
      page,
      serviceWorker: page,
    },
    testInfo,
  )
})

test('Firefox domain selection prunes hidden results and respects no-confirmation settings', async ({
  firefoxExtensionPage: page,
  firefoxExtensionUuid,
}) => {
  await verifySelectionSearchAndVisibility({
    appUrl: getFirefoxExtensionUrl(
      firefoxExtensionUuid,
      'app.html#/saved-tabs?mode=domain',
    ),
    page,
    serviceWorker: page,
  })
})

test('Firefox normal links and opening selected tabs preserve the exact URLs', async ({
  firefoxExtensionPage: page,
  firefoxExtensionUuid,
}) => {
  await verifySelectionOpening({
    appUrl: getFirefoxExtensionUrl(
      firefoxExtensionUuid,
      'app.html#/saved-tabs?mode=domain',
    ),
    page,
    serviceWorker: page,
  })
})
