import assert from 'node:assert/strict'

import { expect, getExtensionUrl, test } from './helpers/extension'
import { verifySavedUrlDetails } from './helpers/saved-url-details'

test('saved URL details support keyboard, copying and narrow screens in both modes', async ({
  extensionId,
  page,
}, testInfo) => {
  const appUrl = getExtensionUrl(extensionId, 'app.html')
  await verifySavedUrlDetails(page, appUrl, testInfo)

  // The persistent extension fixture starts with hasTouch=false. CDP dispatches
  // real touch input without changing that shared fixture for other scenarios.
  const cdp = await page.context().newCDPSession(page)
  try {
    await cdp.send('Emulation.setTouchEmulationEnabled', {
      enabled: true,
      maxTouchPoints: 1,
    })
    const verifyTouch = async (mode: 'domain' | 'custom') => {
      await page.goto(`${appUrl}#/saved-tabs?mode=${mode}`)
      const trigger = page.getByRole('button', { name: /^View URL:/u })
      await expect(trigger).toBeVisible()
      await trigger.scrollIntoViewIfNeeded()
      const bounds = await trigger.boundingBox()
      assert.ok(bounds)
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [
          {
            x: bounds.x + bounds.width / 2,
            y: bounds.y + bounds.height / 2,
          },
        ],
      })
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      })
      const dialog = page.getByRole('dialog', { name: 'Full URL', exact: true })
      await expect(
        dialog.getByRole('textbox', { name: 'Full URL' }),
      ).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()
      await expect(trigger).toBeFocused()
    }
    await verifyTouch('domain')
    await verifyTouch('custom')
  } finally {
    await cdp.detach()
  }
})
