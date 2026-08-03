/* eslint-disable typescript/no-misused-promises, typescript/no-floating-promises */
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { expect, test as base, firefox } from '@playwright/test'
import type { BrowserContext, Page } from '@playwright/test'

const manifestPath = path.join(
  process.cwd(),
  '.output',
  'firefox-mv2',
  'manifest.json',
)

const SMOKE_FLAG = 'FIREFOX_EXTENSION_SMOKE'

export const isFirefoxExtensionSmokeEnabled = (): boolean =>
  process.env[SMOKE_FLAG] === '1'

type FirefoxExtensionSmokeFixtures = {
  firefoxExtensionContext: BrowserContext
  firefoxExtensionPage: Page
}

// The skip decision is made at the spec level via `test.skip(condition)`
// inside `test.beforeAll`. Calling `base.skip` inside fixture setup is not an
// officially supported Playwright pattern (see microsoft/playwright#15071,
// #31425, #29229) and is avoided here. If a spec forgets the guard, the
// fixture will run only when `FIREFOX_EXTENSION_SMOKE=1` is set by the caller.
export const test = base.extend<FirefoxExtensionSmokeFixtures>({
  firefoxExtensionContext: async ({}, runFixture) => {
    const userDataDir = await mkdtemp(
      path.join(os.tmpdir(), 'tabbin-firefox-smoke-'),
    )
    let context: BrowserContext | undefined
    try {
      context = await firefox.launchPersistentContext(userDataDir, {
        handleSIGINT: true,
        handleSIGTERM: true,
      })
      await runFixture(context)
    } finally {
      await context?.close()
      await rm(userDataDir, { force: true, recursive: true })
    }
  },
  firefoxExtensionPage: async ({ firefoxExtensionContext }, runFixture) => {
    const page = await firefoxExtensionContext.newPage()
    await runFixture(page).finally(async () => {
      await page.close()
    })
  },
})

// Load TABBIN's Firefox artifact as a temporary add-on. Firefox generates the
// internal UUID for a temporary install, so callers detect startup by
// asserting the extension appears in the Temporary Extensions section rather
// than by a stable id.
export const loadFirefoxTemporaryAddon = async (page: Page): Promise<void> => {
  await page.goto('about:debugging#/runtime/this-firefox')
  const loadButton = page.getByRole('button', {
    name: /Load Temporary Add-on/i,
  })
  await loadButton.click()
  const fileChooser = await page.waitForEvent('filechooser')
  await fileChooser.setFiles(manifestPath)
}

export { expect }
