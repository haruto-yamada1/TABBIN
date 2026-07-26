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
 * saved-tabs 画面の axe accessibility smoke test。
 *
 * 検査内容:
 * - ドメインモードで保存済みタブが表示された状態で
 *   WCAG 2.0/2.1 A・AA の violation が 0 件であることを確認する。
 *
 * 補足:
 * - D&D や resize handle など手動操作が必要な項目は
 *   この自動検査の対象外。
 */
test.describe('saved-tabs accessibility', () => {
  test('ドメインモードで axe violation がない', async ({
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

    await page.goto(
      getExtensionUrl(extensionId, 'app.html#/saved-tabs?mode=domain'),
    )

    // ページ内容が描画完了したことを確認してから検査する
    await expect(page.getByText('Example Home')).toBeVisible()

    await assertNoAxeViolations(page, 'saved-tabs (domain mode)')
  })
})
