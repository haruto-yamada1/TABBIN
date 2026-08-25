/* eslint-disable playwright/no-skipped-test -- Firefox startup smoke is gated by FIREFOX_EXTENSION_SMOKE=1 */
import {
  expect,
  isFirefoxExtensionSmokeEnabled,
  getFirefoxExtensionUrl,
  test,
} from './helpers/firefox-extension'

test.describe('Firefox extension startup smoke', () => {
  test.beforeAll(() => {
    test.skip(
      !isFirefoxExtensionSmokeEnabled(),
      'set FIREFOX_EXTENSION_SMOKE=1 to run the Firefox startup smoke',
    )
  })

  test('Firefox artifact installs from profile directory and exposes its internal UUID', async ({
    firefoxExtensionPage,
    firefoxExtensionUuid,
  }) => {
    // The UUID fixture throws before the test reaches the assertion if
    // Firefox failed to install TABBIN during profile launch. Opening an
    // extension page through that UUID is the simplest smoke: if the
    // artifact shipped an invalid manifest, missing background script, or a
    // startup error, the page render will fail.
    const optionsUrl = getFirefoxExtensionUrl(
      firefoxExtensionUuid,
      'options.html',
    )
    const response = await firefoxExtensionPage.goto(optionsUrl)
    expect(response?.ok()).toBe(true)
    expect(firefoxExtensionPage.url()).toContain('moz-extension://')
  })
})
