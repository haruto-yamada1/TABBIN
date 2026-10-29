import { expect, getExtensionUrl, test } from './helpers/extension'
import { verifyRelativeSavedTime } from './helpers/relative-saved-time'

test('saved time options persist all combinations and localize relative timestamps', async ({
  extensionId,
  page,
}, testInfo) => {
  const absoluteTime = await verifyRelativeSavedTime(
    page,
    getExtensionUrl(extensionId, 'app.html'),
    {
      options: testInfo.outputPath('relative-saved-time-options-en.png'),
      savedTabs: testInfo.outputPath('relative-saved-time-tabs-ja.png'),
    },
  )
  await expect(page.getByText('5 分前', { exact: true })).toHaveAttribute(
    'title',
    absoluteTime,
  )
})
