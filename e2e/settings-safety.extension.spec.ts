import { AxeBuilder } from '@axe-core/playwright'

import { createExamplePersistenceFixture } from '@/test/fixtures/persistenceBrowserFixtures'

import {
  createBaseSeed,
  expect,
  getExtensionUrl,
  readPersistenceV2SavedTabsSnapshot,
  readStorage,
  seedSavedTabsFixture,
  test,
} from './helpers/extension'

const recoveryLabels = {
  en: {
    title: 'Settings could not be loaded',
    retry: 'Retry loading settings',
    reset: 'Reset settings to defaults',
  },
  ja: {
    title: '設定を読み込めませんでした',
    retry: '設定を再読み込み',
    reset: '設定を初期値に戻す',
  },
}

for (const language of ['en', 'ja'] as const) {
  test(`settings safety ${language}: invalid settings are preserved until explicit recovery`, async ({
    extensionId,
    page,
    serviceWorker,
  }, testInfo) => {
    const labels = recoveryLabels[language]
    const invalidSettings = {
      language,
      removeTabAfterOpen: 'private-invalid-setting',
      aiSystemPrompts: [{ template: 'private-prompt-never-show' }],
    }
    await seedSavedTabsFixture(serviceWorker, {
      persistence: createExamplePersistenceFixture(Date.now()),
      storage: createBaseSeed({ userSettings: invalidSettings }),
    })
    const before = await readPersistenceV2SavedTabsSnapshot(serviceWorker)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(getExtensionUrl(extensionId, 'app.html#/options'))
    const alert = page.getByRole('alert').filter({ hasText: labels.title })
    await expect(alert).toBeVisible()
    await expect(page.locator('body')).not.toContainText('private-')
    await alert.getByRole('button', { name: labels.retry }).click()
    await expect(alert).toBeVisible()
    expect(
      (await readStorage<{ userSettings: unknown }>(serviceWorker))
        .userSettings,
    ).toEqual(invalidSettings)
    const accessibility = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze()
    expect(accessibility.violations).toEqual([])
    await alert.getByRole('button', { name: labels.retry }).focus()
    await page.keyboard.press('Tab')
    await expect(
      alert.getByRole('button', { name: labels.reset }),
    ).toBeFocused()
    const screenshot = testInfo.outputPath(`settings-recovery-${language}.png`)
    await page.screenshot({ path: screenshot, fullPage: true })
    await testInfo.attach(`settings-recovery-${language}`, {
      path: screenshot,
      contentType: 'image/png',
    })
    await alert.getByRole('button', { name: labels.reset }).click()
    await expect(alert).toHaveCount(0)
    expect(await readPersistenceV2SavedTabsSnapshot(serviceWorker)).toEqual(
      before,
    )
    const recovered = (
      await readStorage<{ userSettings: unknown }>(serviceWorker)
    ).userSettings
    expect(recovered).toMatchObject({
      removeTabAfterOpen: true,
      autoDeletePeriod: 'never',
      excludePinnedTabs: true,
    })
    await page.reload()
    await expect(
      page.getByRole('alert').filter({ hasText: labels.title }),
    ).toHaveCount(0)
  })
}

test('settings safety: first use and old settings retain defaults and explicit policies', async ({
  extensionId,
  page,
  serviceWorker,
}) => {
  await seedSavedTabsFixture(serviceWorker, {
    persistence: createExamplePersistenceFixture(Date.now()),
    storage: createBaseSeed(),
  })
  await serviceWorker.evaluate(async () =>
    chrome.storage.local.remove('userSettings'),
  )
  await page.goto(getExtensionUrl(extensionId, 'app.html#/options'))
  await expect(page.locator('#exclude-pinned-tabs')).toBeChecked()
  await expect(
    page.getByRole('alert').filter({
      hasText: /Settings could not be loaded|設定を読み込めませんでした/u,
    }),
  ).toHaveCount(0)
  await serviceWorker.evaluate(async () => {
    await chrome.storage.local.set({
      userSettings: {
        aiProvider: 'legacy',
        language: 'en',
        removeTabAfterOpen: false,
        excludePinnedTabs: false,
        excludePatterns: ['private.example'],
      },
    })
  })
  await page.reload()
  await expect(page.locator('#exclude-pinned-tabs')).not.toBeChecked()
  await expect(
    page.getByRole('alert').filter({
      hasText: /Settings could not be loaded|設定を読み込めませんでした/u,
    }),
  ).toHaveCount(0)
  await expect
    .poll(
      async () =>
        (await readStorage<{ userSettings: unknown }>(serviceWorker))
          .userSettings,
    )
    .toMatchObject({
      removeTabAfterOpen: false,
      excludePinnedTabs: false,
      excludePatterns: expect.arrayContaining(['about:', 'private.example']),
    })
})
