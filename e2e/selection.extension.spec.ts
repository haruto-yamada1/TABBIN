/* eslint-disable playwright/expect-expect -- shared scenarios assert live selection, persistence, Undo, and opened browser tabs */
import { getExtensionUrl, test } from './helpers/extension'
import {
  verifySelectionOpening,
  verifySelectionRangeAndUndo,
  verifySelectionSearchAndVisibility,
} from './helpers/selection'

test('domain selection follows rendered ranges and deletes across domains with one Undo', async ({
  extensionId,
  page,
  serviceWorker,
}, testInfo) => {
  await verifySelectionRangeAndUndo(
    {
      appUrl: getExtensionUrl(extensionId, 'app.html#/saved-tabs?mode=domain'),
      page,
      serviceWorker,
    },
    testInfo,
  )
})

test('domain selection prunes collapsed and searched tabs and can delete without confirmation', async ({
  extensionId,
  page,
  serviceWorker,
}) => {
  await verifySelectionSearchAndVisibility({
    appUrl: getExtensionUrl(extensionId, 'app.html#/saved-tabs?mode=domain'),
    page,
    serviceWorker,
  })
})

test('normal links still open and selection opens exactly the checked tabs', async ({
  extensionId,
  page,
  serviceWorker,
}) => {
  await verifySelectionOpening({
    appUrl: getExtensionUrl(extensionId, 'app.html#/saved-tabs?mode=domain'),
    page,
    serviceWorker,
  })
})
