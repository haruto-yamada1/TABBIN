import { expect, test } from '@playwright/test'

const variants = [
  { name: 'light-en', theme: 'light', locale: 'en', width: 1280 },
  { name: 'dark-en', theme: 'dark', locale: 'en', width: 1280 },
  { name: 'narrow-en', theme: 'light', locale: 'en', width: 390 },
  { name: 'light-ja', theme: 'light', locale: 'ja', width: 1280 },
] as const

const screens = ['saved-tabs', 'options', 'import', 'ai-chat'] as const

for (const screen of screens) {
  for (const variant of variants) {
    test(`${screen} / ${variant.name}`, async ({ page }) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      // Synthetic stories must never contact Ollama, favicon hosts, or analytics.
      await page.route('**/*', async (route) => {
        const { origin } = new URL(route.request().url())
        if (origin === 'http://127.0.0.1:6007') {
          await route.continue()
        } else {
          await route.abort('blockedbyclient')
        }
      })
      await page.clock.setFixedTime(new Date('2026-10-01T12:00:00Z'))
      await page.setViewportSize({ width: variant.width, height: 900 })
      await page.emulateMedia({ colorScheme: variant.theme })
      const query = new URLSearchParams({
        id: `app-visual-regression--${screen}`,
        viewMode: 'story',
        globals: `theme:${variant.theme};locale:${variant.locale}`,
      })
      await page.goto(`/iframe.html?${query}`)
      const ready = page.locator(
        `#storybook-root[data-visual-ready="${screen}"]`,
      )
      // Initial lazy chunks and story play belong to the navigation lifecycle,
      // bounded by the test deadline rather than the 5s assertion default.
      await ready.waitFor({ state: 'visible' })
      await expect(ready).toBeVisible()
      await expect(page.locator('html')).toHaveClass(
        new RegExp(`\\b${variant.theme}\\b`),
      )
      // Font readiness plus Playwright's consecutive stable screenshots avoids
      // fixed sleeps; the whole viewport includes portal dialogs and popovers.
      await page.evaluate(async () => {
        await document.fonts.ready
      })
      await expect(page).toHaveScreenshot(`${screen}-${variant.name}.png`)
      expect(errors).toEqual([])
    })
  }
}
