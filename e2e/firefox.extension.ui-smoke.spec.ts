/* eslint-disable playwright/no-skipped-test -- Firefox extension UI smoke is gated by FIREFOX_EXTENSION_SMOKE=1 */
import {
  expect,
  getFirefoxExtensionUrl,
  isFirefoxExtensionSmokeEnabled,
  test,
} from './helpers/firefox-extension'

test.describe('Firefox extension UI smoke', () => {
  test.beforeAll(() => {
    test.skip(
      !isFirefoxExtensionSmokeEnabled(),
      'set FIREFOX_EXTENSION_SMOKE=1 to run the Firefox UI smoke',
    )
  })

  test('TABBIN options page renders in Firefox', async ({
    firefoxExtensionPage,
    firefoxExtensionUuid,
  }) => {
    const optionsUrl = getFirefoxExtensionUrl(
      firefoxExtensionUuid,
      'options.html',
    )
    await firefoxExtensionPage.goto(optionsUrl)
    // TABBIN mounts the options app at app.html#/options and links from the
    // options.html shell. Either the shell or the React app exposes a
    // document title derived from the localized extension name, so a
    // non-empty title is the smallest stable signal that the artifact's
    // HTML and JS bundle parsed.
    await expect
      .poll(async () => firefoxExtensionPage.title(), { timeout: 10_000 })
      .not.toHaveLength(0)
  })

  test('TABBIN saved-tabs page renders in Firefox', async ({
    firefoxExtensionPage,
    firefoxExtensionUuid,
  }) => {
    const savedTabsUrl = getFirefoxExtensionUrl(
      firefoxExtensionUuid,
      'app.html#/saved-tabs',
    )
    await firefoxExtensionPage.goto(savedTabsUrl)
    // The saved-tabs view mounts the same React root as options. Waiting for
    // a non-empty title confirms the page loaded without a runtime crash;
    // the smoke does not seed storage because storage read/write contract
    // has its own test below.
    await expect
      .poll(async () => firefoxExtensionPage.title(), { timeout: 10_000 })
      .not.toHaveLength(0)
  })

  test('extension storage read/write contract survives under Firefox', async ({
    firefoxExtensionPage,
    firefoxExtensionUuid,
  }) => {
    // Open any extension page first: chrome.storage / browser.storage is only
    // available from extension contexts, so load the options shell before
    // evaluating.
    const optionsUrl = getFirefoxExtensionUrl(
      firefoxExtensionUuid,
      'options.html',
    )
    await firefoxExtensionPage.goto(optionsUrl)

    const result = await firefoxExtensionPage.evaluate(async () => {
      // Both `chrome.*` (Polyfill alias) and `browser.*` resolve to the
      // same API on Firefox. We use the polyfill alias deliberately to
      // exercise the same code path TABBIN's production code uses.
      const api = (
        globalThis as {
          chrome?: {
            storage?: {
              local?: {
                set: (entries: Record<string, unknown>) => Promise<void>
                get: (
                  keys?: string | string[] | null,
                ) => Promise<Record<string, unknown>>
                clear: () => Promise<void>
              }
            }
          }
        }
      ).chrome

      if (!api?.storage?.local) {
        return { kind: 'unavailable' as const }
      }

      await api.storage.local.clear()
      await api.storage.local.set({
        'tabbin-smoke-read-write': 'written',
      })
      const read = await api.storage.local.get('tabbin-smoke-read-write')
      await api.storage.local.clear()
      return {
        kind: 'ok' as const,
        value: read['tabbin-smoke-read-write'],
      }
    })

    expect(result).toEqual({ kind: 'ok', value: 'written' })
  })
})
