import {
  expect,
  getFirefoxExtensionUrl,
  test,
} from './helpers/firefox-extension'
import { verifyRelativeSavedTime } from './helpers/relative-saved-time'

test('Firefox saved time options persist all combinations and localize relative timestamps', async ({
  firefoxExtensionPage,
  firefoxExtensionUuid,
}, testInfo) => {
  const absoluteTime = await verifyRelativeSavedTime(
    firefoxExtensionPage,
    getFirefoxExtensionUrl(firefoxExtensionUuid, 'app.html'),
    {
      options: testInfo.outputPath('relative-saved-time-options-en.png'),
      savedTabs: testInfo.outputPath('relative-saved-time-tabs-ja.png'),
    },
  )
  await expect(
    firefoxExtensionPage.getByText('5 分前', { exact: true }),
  ).toHaveAttribute('title', absoluteTime)
})
