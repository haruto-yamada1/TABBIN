/* eslint-disable playwright/expect-expect -- shared keyboard scenarios assert live UI, focus, committed storage, and reload */
import { getExtensionUrl, test } from './helpers/extension'
import {
  recordKeyboardState,
  verifyKeyboardCustomCategories,
  verifyKeyboardCustomHierarchy,
  verifyKeyboardDomainCategories,
  verifyKeyboardUrlOrdering,
} from './helpers/keyboard-dnd'

test.describe('keyboard drag and drop accessibility', () => {
  test.afterEach(async ({ page }, testInfo) => {
    await recordKeyboardState(page, testInfo, 'final-keyboard-state')
  })

  for (const mode of ['domain', 'custom'] as const) {
    test(`${mode} URL handles support Tab, cancel, drop and durable ordering`, async ({
      extensionId,
      page,
      serviceWorker,
    }, testInfo) => {
      await verifyKeyboardUrlOrdering(
        {
          page,
          serviceWorker,
          mode,
          appUrl: getExtensionUrl(
            extensionId,
            `app.html#/saved-tabs?mode=${mode}`,
          ),
        },
        testInfo,
      )
    })
  }

  for (const parent of [false, true]) {
    test(`domain ${parent ? 'parent' : 'child'} categories keep changes provisional until keyboard confirmation`, async ({
      extensionId,
      page,
      serviceWorker,
    }, testInfo) => {
      await verifyKeyboardDomainCategories(
        {
          page,
          serviceWorker,
          parent,
          appUrl: getExtensionUrl(
            extensionId,
            'app.html#/saved-tabs?mode=domain',
          ),
        },
        testInfo,
      )
    })
  }

  test('custom categories support keyboard cancellation and persisted reordering', async ({
    extensionId,
    page,
    serviceWorker,
  }) => {
    await verifyKeyboardCustomCategories({
      page,
      serviceWorker,
      appUrl: getExtensionUrl(extensionId, 'app.html#/saved-tabs?mode=custom'),
    })
  })

  test('custom URL keyboard moves through an empty category, uncategorized area, and another project', async ({
    extensionId,
    page,
    serviceWorker,
  }) => {
    await verifyKeyboardCustomHierarchy({
      page,
      serviceWorker,
      appUrl: getExtensionUrl(extensionId, 'app.html#/saved-tabs?mode=custom'),
    })
  })
})
