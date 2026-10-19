import { expect, getExtensionUrl, test } from './helpers/extension'
import { benchmarkSavedTabsRendering } from './helpers/rendering-performance'

for (const size of [1_000, 10_000]) {
  for (const mode of ['domain', 'custom'] as const) {
    test(`${mode} rendering with ${size} synthetic URLs`, async ({
      extensionId,
      page,
    }, testInfo) => {
      test.setTimeout(300_000)
      const result = await benchmarkSavedTabsRendering(
        page,
        getExtensionUrl(extensionId, 'app.html'),
        size,
        mode,
        testInfo,
      )
      expect(result.retainedUrls).toBe(size)
      expect(result.retainedMemberships).toBe(size * 2)
    })
  }
}
