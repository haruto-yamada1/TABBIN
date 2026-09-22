import {
  createBaseSeed,
  expect,
  getExtensionUrl,
  seedStorage,
  test,
  waitForPersistenceV2Ready,
} from './helpers/extension'

test('domain parent navigation uses the section position while its header is sticky', async ({
  extensionId,
  page,
  serviceWorker,
}, testInfo) => {
  const urls = Array.from({ length: 40 }, (_, index) => ({
    id: `scroll-url-${index}`,
    savedAt: Date.now(),
    title: `Scroll regression tab ${index + 1}`,
    url: `https://scroll.example.com/${index}`,
  }))
  await seedStorage(
    serviceWorker,
    createBaseSeed({
      savedTabs: [
        {
          id: 'categorized-domain',
          domain: 'parent.example.com',
          parentCategoryId: 'parent-category',
          urlIds: ['parent-url'],
        },
        {
          id: 'uncategorized-domain',
          domain: 'scroll.example.com',
          urlIds: urls.map(({ id }) => id),
        },
      ],
      urls: [
        {
          id: 'parent-url',
          savedAt: Date.now(),
          title: 'Previous parent category tab',
          url: 'https://parent.example.com/',
        },
        ...urls,
      ],
      parentCategories: [
        {
          id: 'parent-category',
          name: 'Previous parent category',
          domains: ['categorized-domain'],
          domainNames: ['parent.example.com'],
        },
      ],
      domainCategoryMappings: [
        { domain: 'parent.example.com', categoryId: 'parent-category' },
      ],
    }),
  )
  await page.goto(
    getExtensionUrl(extensionId, 'app.html#/saved-tabs?mode=domain'),
  )
  await waitForPersistenceV2Ready(serviceWorker)

  const pane = page.getByTestId('saved-tabs-left-pane')
  const header = page.getByTestId('uncategorized-section-header')
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
