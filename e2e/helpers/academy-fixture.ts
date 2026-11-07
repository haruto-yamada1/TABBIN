import { createAcademyFixture } from '#academy-fixture'
import type { AcademyScenario } from '#academy-fixture'
import type { BrowserContext, Page, Worker } from '@playwright/test'

import {
  createBaseSeed,
  getExtensionUrl,
  seedSavedTabsFixture,
} from './extension'

// Only call from the extension fixture, which owns a disposable test profile.
// Reopen the real app after replacement so mounted views cannot retain old data.
export const resetAcademyFixture = async (
  {
    extensionContext,
    extensionId,
    page,
    serviceWorker,
  }: {
    extensionContext: BrowserContext
    extensionId: string
    page: Page
    serviceWorker: Worker
  },
  scenario: AcademyScenario = 'minimal',
) => {
  await page.goto('about:blank')
  await Promise.all(
    extensionContext
      .pages()
      .filter((other) => other !== page)
      .map(async (other) => other.close()),
  )
  await seedSavedTabsFixture(serviceWorker, {
    storage: createBaseSeed({ 'tab-manager-theme': 'light' }),
    persistence: createAcademyFixture(scenario),
  })
  await page.goto(
    getExtensionUrl(extensionId, 'app.html#/saved-tabs?mode=domain'),
  )
}
