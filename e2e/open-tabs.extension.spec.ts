/* eslint-disable playwright/expect-expect -- shared scenario asserts live browser state, query count, exact URL matching, and persistence */
import { getExtensionUrl, test } from './helpers/extension'
import { verifyOpenTabs } from './helpers/open-tabs'

for (const mode of ['domain', 'custom'] as const) {
  test(`${mode} saved URLs follow live tabs without repeated full queries or persistence changes`, async ({
    extensionContext,
    extensionId,
    page,
  }) => {
    await verifyOpenTabs({
      page,
      context: extensionContext,
      appUrl: getExtensionUrl(extensionId, 'app.html'),
      mode,
      screenshots: {
        desktop: `/tmp/tabbin-911-${mode}-en-desktop.png`,
        narrow: `/tmp/tabbin-911-${mode}-ja-narrow.png`,
      },
    })
  })
}
