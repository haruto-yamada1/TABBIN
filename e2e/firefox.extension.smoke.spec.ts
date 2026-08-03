/* eslint-disable playwright/no-skipped-test -- Firefox startup smoke is gated by FIREFOX_EXTENSION_SMOKE=1 */
import {
  expect,
  isFirefoxExtensionSmokeEnabled,
  loadFirefoxTemporaryAddon,
  test,
} from './helpers/firefox-extension'

test.describe('Firefox extension startup smoke', () => {
  test.beforeAll(() => {
    test.skip(
      !isFirefoxExtensionSmokeEnabled(),
      'set FIREFOX_EXTENSION_SMOKE=1 to run the Firefox startup smoke',
    )
  })

  test('Firefox artifact loads as a temporary add-on and appears in about:debugging', async ({
    firefoxExtensionPage,
  }) => {
    await loadFirefoxTemporaryAddon(firefoxExtensionPage)

    // Firefox assigns a fresh internal UUID on each temporary install, so we
    // assert the addon is listed under the Temporary Extensions section
    // instead of matching by id. If the artifact fails to start, this
    // section never refreshes with the new addon entry.
    await expect(
      firefoxExtensionPage.getByRole('heading', {
        name: /Temporary Extensions/i,
      }),
    ).toBeVisible({ timeout: 10_000 })
    await expect(firefoxExtensionPage.getByText(/tabbin/i)).toBeVisible({
      timeout: 10_000,
    })
  })
})
