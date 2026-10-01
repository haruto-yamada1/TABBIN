import {
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
  waitForPersistenceV2Ready,
} from './helpers/extension'

test('domain parent navigation uses the section position while its header is sticky', async ({
  extensionId,
  page,
  serviceWorker,
}, testInfo) => {
  const now = Date.now()
  const urls = Array.from({ length: 40 }, (_, index) =>
    createUrlFixture(
      `scroll-url-${index}`,
      `https://scroll.example.com/${index}`,
      `Scroll regression tab ${index + 1}`,
      now,
    ),
  )
  await seedSavedTabsFixture(serviceWorker, {
    storage: createBaseSeed(),
    persistence: {
      categories: [],
      collections: [
        {
          ...createDomainCollectionFixture(
            'categorized-domain',
            'parent.example.com',
            now,
          ),
          groupId: 'parent-category',
        },
        createDomainCollectionFixture(
          'uncategorized-domain',
          'scroll.example.com',
          now,
          1024,
        ),
      ],
      urls: [
        createUrlFixture(
          'parent-url',
          'https://parent.example.com/',
          'Previous parent category tab',
          now,
        ),
        ...urls,
      ],
      groups: [
        {
          createdAt: now,
          id: 'parent-category',
          name: 'Previous parent category',
          domainNames: ['parent.example.com'],
          sortOrder: 0,
          updatedAt: now,
        },
      ],
      memberships: [
        createMembershipFixture('categorized-domain', 'parent-url', now),
        ...urls.map(({ id }, index) =>
          createMembershipFixture(
            'uncategorized-domain',
            id,
            now,
            index * 1024,
          ),
        ),
      ],
    },
  })
  await page.goto(
    getExtensionUrl(extensionId, 'app.html#/saved-tabs?mode=domain'),
  )
  await waitForPersistenceV2Ready(serviceWorker)

  const pane = page.getByTestId('saved-tabs-left-pane')
  const header = page.getByTestId('uncategorized-section-header')
  // content-visibility uses an intrinsic card height until its contents render.
  // Measure the section only after the preceding card has its real layout.
  await expect(
    page.getByText('Previous parent category tab', { exact: true }),
  ).toBeVisible()
  await expect(header).toBeVisible()
  const sectionTop = await header.evaluate((element) => {
    const container = element.closest('[data-testid="saved-tabs-left-pane"]')
    if (!container) {
      throw new Error('Missing saved tabs scroll container')
    }
    return (
      element.getBoundingClientRect().top -
      container.getBoundingClientRect().top
    )
  })
  await pane.evaluate((element, top) => {
    element.scrollTop = top + 700
  }, sectionTop)
  await expect
    .poll(async () => {
      const headerBox = await header.boundingBox()
      const paneBox = await pane.boundingBox()
      return (headerBox?.y ?? Infinity) - (paneBox?.y ?? 0)
    })
    .toBeLessThan(2)

  const previous = page.getByRole('button', {
    name: 'Scroll to previous parent category',
  })
  await expect(previous).toBeEnabled()
  await previous.click()
  await expect
    .poll(async () => pane.evaluate((element) => element.scrollTop))
    .toBeCloseTo(sectionTop - 96, 0)
  await expect(
    page.getByRole('alert').filter({ hasText: 'Storage recovery required' }),
  ).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('parent-scroll.png') })

  await previous.click()
  await expect
    .poll(async () => pane.evaluate((element) => element.scrollTop))
    .toBeLessThan(sectionTop - 100)
  await page
    .getByRole('button', { name: 'Scroll to next parent category' })
    .click()
  await expect
    .poll(async () => pane.evaluate((element) => element.scrollTop))
    .toBeCloseTo(sectionTop - 96, 0)
})
