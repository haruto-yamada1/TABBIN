import { expect, test } from '@playwright/test'

// eslint-disable-next-line import/no-relative-parent-imports -- test the same serialized browser callback as the production collector
import { isInitialLoadReady } from '../tools/scripts/initialLoadReport'
// eslint-disable-next-line import/no-relative-parent-imports -- production artifact measurement is shared with the CLI report
import { measureInitialLoads } from '../tools/scripts/measure-initial-load'

test('each production feature reaches readiness in fresh Chrome and Firefox profiles', async () => {
  const measurements = await measureInitialLoads()
  for (const browser of ['chrome', 'firefox'] as const) {
    const { features } = measurements.browsers[browser]
    for (const files of Object.values(features)) {
      expect(files.length).toBeGreaterThan(1)
      expect(files.some((file) => /\/app-[\w-]+\.js$/u.test(file))).toBe(true)
    }
    expect(
      features.options.some((file) => file.includes('OptionsRoute-')),
    ).toBe(true)
    expect(
      features['ai-chat'].some((file) => file.includes('AiChatRoute-')),
    ).toBe(true)
    expect(
      features.analytics.some((file) => file.includes('AnalyticsRoute-')),
    ).toBe(true)
    expect(
      features.options.some((file) => file.includes('AnalyticsRoute-')),
    ).toBe(false)
    expect(
      features['saved-tabs'].some((file) => file.includes('OptionsRoute-')),
    ).toBe(false)
  }
})

test('readiness selectors containing code-like text remain literal browser data', async ({
  page,
}) => {
  await page.setContent('<html lang="en"><body><main></main></body></html>')
  const selector = await page.evaluate((id) => {
    const target = document.querySelector('main')
    if (!target) {
      throw new Error('Readiness fixture is missing')
    }
    target.id = id
    return `#${CSS.escape(id)}`
  }, '"\'];globalThis.__readinessInjected=true;//</script>`\\\u2028\u2029')
  expect(await page.evaluate(isInitialLoadReady, selector)).toBe(true)
  expect(await page.evaluate(isInitialLoadReady, '#missing')).toBe(false)
  expect(
    await page.evaluate(() => Reflect.get(globalThis, '__readinessInjected')),
  ).toBeUndefined()
})
