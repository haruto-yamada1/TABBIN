import { assertNoAxeViolations } from './helpers/axe'
import {
  createBaseSeed,
  defaultUserSettings,
  expect,
  getExtensionUrl,
  seedStorage,
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
    await seedStorage(
      serviceWorker,
      createBaseSeed({
        savedTabs: [
          {
            domain: 'example.com',
            id: 'group-example',
            urlIds: ['url-example'],
          },
        ],
        urls: [
          {
            id: 'url-example',
            savedAt: now,
            title: 'Example Home',
            url: 'https://example.com/',
          },
        ],
        userSettings: {
          ...defaultUserSettings,
          clickBehavior: 'saveCurrentTab',
        },
      }),
    )

    await page.goto(getExtensionUrl(extensionId, 'app.html#/options'))

    // ページ内容が描画完了したことを確認してから検査する
    await expect(page.getByRole('button', { name: /export/i })).toBeVisible()

    await assertNoAxeViolations(page, 'options')
  })
})
