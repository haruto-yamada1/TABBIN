import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

import { chromium, firefox, test as browserTest } from '@playwright/test'
import type { Page, TestInfo, Worker } from '@playwright/test'

import {
  createCustomCollectionFixture,
  createDomainCollectionFixture,
  createMembershipFixture,
  createUrlFixture,
} from '@/test/fixtures/persistenceBrowserFixtures'

import {
  createBaseSeed,
  expect,
  getExtensionUrl,
  seedSavedTabsFixture,
  test,
} from './helpers/extension'
import { verifyKeyboardUrlOrdering } from './helpers/keyboard-dnd'

// Use the shipped CSS in both engines: jsdom cannot check the CSS cascade.
for (const browserType of [chromium, firefox]) {
  browserTest(
    `${browserType.name()} respects reduced motion over inline sortable styles`,
    async () => {
      const browser = await browserType.launch()
      try {
        const page = await browser.newPage({ reducedMotion: 'no-preference' })
        const assets = path.join(process.cwd(), '.output/chrome-mv3/assets')
        const files = (await readdir(assets)).filter((file) =>
          file.endsWith('.css'),
        )
        const styles = await Promise.all(
          files.map(async (file) => readFile(path.join(assets, file), 'utf8')),
        )
        await page.setContent(
          `<style>${styles.join('\n')}</style><div class="animate-pulse saved-tabs-scroll-highlight" style="transition: transform 250ms 150ms; animation-delay: 150ms; transform: translateX(20px)">2 saved tabs</div>`,
        )
        const item = page.getByText('2 saved tabs')
        await expect(item).toHaveCSS('transition-duration', '0.25s')
        await page.emulateMedia({ reducedMotion: 'reduce' })
        const motion = await item.evaluate((node) => {
          const style = getComputedStyle(node)
          return {
            transition: Number(style.transitionDuration.replace('s', '')),
            transitionDelay: style.transitionDelay,
            animation: Number(style.animationDuration.replace('s', '')),
            animationDelay: style.animationDelay,
            transform: style.transform,
            highlight: style.boxShadow,
          }
        })
        expect(motion.transition).toBeLessThanOrEqual(0.00001)
        expect(motion.transitionDelay).toBe('0s')
        expect(motion.animation).toBeLessThanOrEqual(0.00001)
        expect(motion.animationDelay).toBe('0s')
        expect(motion.transform).toBe('matrix(1, 0, 0, 1, 20, 0)')
        expect(motion.highlight).not.toBe('none')
        await expect(item).toHaveText('2 saved tabs')
        await page.emulateMedia({ reducedMotion: 'no-preference' })
        await expect(item).toHaveCSS('transition-duration', '0.25s')
      } finally {
        await browser.close()
      }
    },
  )
}

type KeyboardScenario = {
  page: Page
  extensionId: string
  serviceWorker: Worker
  mode: 'domain' | 'custom'
  motion: 'reduce' | 'no-preference'
}

const verifyMotionOrdering = async (
  { page, extensionId, serviceWorker, mode, motion }: KeyboardScenario,
  testInfo: TestInfo,
): Promise<void> => {
  await page.emulateMedia({ reducedMotion: motion })
  await page.addInitScript(() => {
    const durations: number[] = []
    const originalAnimate = Element.prototype.animate
    Element.prototype.animate = function animate(keyframes, options) {
      durations.push(
        typeof options === 'number' ? options : Number(options?.duration ?? 0),
      )
      sessionStorage.setItem(
        'reduced-motion-durations',
        JSON.stringify(durations),
      )
      return originalAnimate.call(this, keyframes, options)
    }
  })
  await verifyKeyboardUrlOrdering(
    {
      page,
      serviceWorker,
      mode,
      appUrl: getExtensionUrl(extensionId, `app.html#/saved-tabs?mode=${mode}`),
    },
    testInfo,
  )
}

for (const { mode, motion, durations } of [
  { mode: 'domain', motion: 'reduce', durations: null },
  { mode: 'custom', motion: 'reduce', durations: null },
  { mode: 'custom', motion: 'no-preference', durations: '[250]' },
] as const) {
  test(`${mode} ${motion} preserves cancellation, announcements and durable order`, async ({
    page,
    extensionId,
    serviceWorker,
  }, testInfo) => {
    await verifyMotionOrdering(
      { page, extensionId, serviceWorker, mode, motion },
      testInfo,
    )
    expect(
      await page.evaluate(() =>
        sessionStorage.getItem('reduced-motion-durations'),
      ),
    ).toBe(durations)
  })
}

test('reduced motion keeps dialog/collapse state, counts and toast feedback', async ({
  page,
  extensionId,
  serviceWorker,
}, testInfo) => {
  await verifyMotionOrdering(
    { page, extensionId, serviceWorker, mode: 'custom', motion: 'reduce' },
    testInfo,
  )
  await page.getByRole('button', { name: 'Add project', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  expect(
    await dialog.evaluate((node) =>
      Number(getComputedStyle(node).animationDuration.replace('s', '')),
    ),
  ).toBeLessThanOrEqual(0.00001)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  const rows = page.getByTestId('project-url-item')
  await page
    .getByRole('button', { name: 'Collapse', exact: true })
    .last()
    .click()
  await expect(rows).toHaveCount(0)
  await expect(page.getByTestId('card-group-title')).toContainText('2')
  await page.getByRole('button', { name: 'Expand', exact: true }).last().click()
  await expect(rows).toHaveCount(2)
  await rows.first().hover()
  await rows
    .first()
    .getByRole('button', { name: 'Delete tab', exact: true })
    .click()
  await expect(rows).toHaveCount(1)
  const toast = page.locator('[data-sonner-toast]').filter({
    has: page.getByRole('button', { name: 'Undo', exact: true }),
  })
  await expect(toast).toBeVisible()
  await expect(toast).toHaveCSS('transition-duration', '0s')
  await expect(toast).toHaveCSS('animation-name', 'none')
  const screenshot = testInfo.outputPath('reduced-motion-feedback.png')
  await page.screenshot({ path: screenshot, fullPage: true })
  await testInfo.attach('reduced-motion-feedback', {
    path: screenshot,
    contentType: 'image/png',
  })
  await expect(
    toast.getByRole('button', { name: 'Undo', exact: true }),
  ).toBeEnabled()
  await expect(page.getByTestId('card-group-title')).toContainText('1')
})

const recordScrollBehavior = () => {
  for (const method of ['scrollTo', 'scrollBy'] as const) {
    const original = Element.prototype[method]
    Object.defineProperty(Element.prototype, method, {
      configurable: true,
      value: function value(this: Element, ...args: unknown[]) {
        const [options] = args
        if (
          typeof options === 'object' &&
          options !== null &&
          'behavior' in options
        ) {
          sessionStorage.setItem(
            'keyboard-scroll-behaviors',
            `${sessionStorage.getItem('keyboard-scroll-behaviors') ?? ''}${String(options.behavior)},`,
          )
        }
        Reflect.apply(original, this, args)
      },
    })
  }
}

for (const mode of ['domain', 'custom'] as const) {
  test(`${mode} reduced motion keyboard sorting scrolls offscreen without smooth movement`, async ({
    page,
    serviceWorker,
    extensionId,
  }) => {
    const now = Date.now()
    const collectionId = 'motion-collection'
    const urls = Array.from({ length: 30 }, (_, index) =>
      createUrlFixture(
        `motion-${index}`,
        `https://example.com/${index}`,
        `Motion tab ${index}`,
        now,
      ),
    )
    await seedSavedTabsFixture(serviceWorker, {
      storage: createBaseSeed({ viewMode: mode }),
      persistence: {
        categories: [],
        groups: [],
        collections: [
          mode === 'domain'
            ? createDomainCollectionFixture(collectionId, 'example.com', now)
            : createCustomCollectionFixture(
                collectionId,
                'Motion project',
                now,
              ),
        ],
        urls,
        memberships: urls.map((url, index) =>
          createMembershipFixture(collectionId, url.id, now, index),
        ),
      },
    })
    await page.setViewportSize({ width: 1280, height: 300 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.addInitScript(recordScrollBehavior)
    await page.goto(
      getExtensionUrl(extensionId, `app.html#/saved-tabs?mode=${mode}`),
    )
    const handle = page.getByRole('button', {
      name: 'Drag to reorder tab "Motion tab 0"',
      exact: true,
    })
    await handle.focus()
    await page.keyboard.press('Space')
    await expect(handle).toHaveAttribute('aria-pressed', 'true')
    await page.evaluate(
      async () => new Promise<void>((resolve) => setTimeout(resolve, 0)),
    )
    // Each key must observe the geometry produced by the previous scroll.
    /* eslint-disable no-await-in-loop -- simulate sequential keyboard navigation through a viewport */
    for (let step = 0; step < 16; step += 1) {
      await page.keyboard.press('ArrowDown')
      await page.evaluate(
        async () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => resolve()),
          ),
      )
    }
    /* eslint-enable no-await-in-loop */
    const calls = await page.evaluate(() =>
      sessionStorage.getItem('keyboard-scroll-behaviors'),
    )
    expect(calls).toContain('instant')
    expect(calls).not.toContain('smooth')
    await page.keyboard.press('Escape')
    await expect(handle).toBeFocused()
  })
}
