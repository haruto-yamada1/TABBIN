import { createExamplePersistenceFixture } from '@/test/fixtures/persistenceBrowserFixtures'

import { assertNoAxeViolations } from './helpers/axe'
import {
  createBaseSeed,
  defaultUserSettings,
  expect,
  getExtensionUrl,
  seedSavedTabsFixture,
  test,
} from './helpers/extension'

const now = Date.now()

/**
 * options 画面の axe accessibility smoke test。
 *
 * 検査内容:
 * - 設定画面が表示された状態で
 *   WCAG 2.0/2.1 A・AA の violation が 0 件であることを確認する。
 *
 * 補足:
 * - カラーピッカーなどのカスタムコントロールは
 *   今後の拡張で個別にキーボード操作を確認する。
 */
test.describe('options accessibility', () => {
  test('設定画面で axe violation がない', async ({
    extensionId,
    page,
    serviceWorker,
  }) => {
    await seedSavedTabsFixture(serviceWorker, {
      persistence: createExamplePersistenceFixture(now),
      storage: createBaseSeed({
        userSettings: {
          ...defaultUserSettings,
          clickBehavior: 'saveCurrentTab',
        },
      }),
    })

    await page.goto(getExtensionUrl(extensionId, 'app.html#/options'))

    // ページ内容が描画完了したことを確認してから検査する
    await expect(page.getByRole('button', { name: /export/i })).toBeVisible()

    await assertNoAxeViolations(page, 'options')
  })
})
