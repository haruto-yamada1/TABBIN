import {
  createCustomCollectionFixture,
  createDomainCollectionFixture,
  createMembershipFixture,
  createUrlFixture,
} from '@/test/fixtures/persistenceBrowserFixtures'

import {
  createBaseSeed,
  defaultUserSettings,
  expect,
  getExtensionUrl,
  readPersistenceV2Store,
  seedSavedTabsFixture,
  test,
} from './helpers/extension'

const DAY_MS = 86_400_000

const createHealthSeed = () => {
  const now = Date.now()
  const oldSavedAt = now - 100 * DAY_MS
  const firstSavedAt = now - 200 * DAY_MS
  const domainCollectionId = 'health-domain'
  const customCollectionId = 'health-custom'
  return {
    storage: createBaseSeed(),
    persistence: {
      categories: [
        {
          collectionId: domainCollectionId,
          createdAt: firstSavedAt,
          id: 'health-docs',
          keywords: [],
          name: 'Docs',
          sortOrder: 0,
          updatedAt: firstSavedAt,
        },
        {
          collectionId: domainCollectionId,
          createdAt: firstSavedAt,
          id: 'health-archive',
          keywords: [],
          name: 'Archive',
          sortOrder: 1024,
          updatedAt: firstSavedAt,
        },
        {
          collectionId: customCollectionId,
          createdAt: firstSavedAt,
          id: 'health-reading',
          keywords: [],
          name: 'Reading',
          sortOrder: 0,
          updatedAt: firstSavedAt,
        },
      ],
      collections: [
        {
          ...createDomainCollectionFixture(
            domainCollectionId,
            'docs.example',
            firstSavedAt,
          ),
          groupId: 'health-work',
        },
        createCustomCollectionFixture(
          customCollectionId,
          'Research',
          firstSavedAt,
          1024,
        ),
      ],
      groups: [
        {
          createdAt: firstSavedAt,
          id: 'health-work',
          name: 'Work',
          sortOrder: 0,
          updatedAt: firstSavedAt,
        },
      ],
      memberships: [
        createMembershipFixture(domainCollectionId, 'health-inbox', now),
        createMembershipFixture(
          domainCollectionId,
          'health-old',
          oldSavedAt,
          1024,
        ),
        {
          ...createMembershipFixture(
            customCollectionId,
            'health-old',
            oldSavedAt,
          ),
          categoryId: 'health-reading',
        },
        {
          ...createMembershipFixture(
            domainCollectionId,
            'health-fallback',
            oldSavedAt,
            2048,
          ),
          categoryId: 'health-archive',
        },
        {
          ...createMembershipFixture(
            domainCollectionId,
            'health-resaved',
            firstSavedAt,
            3072,
          ),
          categoryId: 'health-docs',
        },
      ],
      urls: [
        createUrlFixture(
          'health-inbox',
          'https://docs.example/inbox',
          'Recent inbox',
          now,
        ),
        createUrlFixture(
          'health-old',
          'https://docs.example/reference',
          'Old reference',
          oldSavedAt,
        ),
        {
          ...createUrlFixture(
            'health-fallback',
            'https://docs.example/legacy',
            'Legacy date',
            oldSavedAt,
          ),
          lastSavedAtProvenance: 'legacy-fallback',
        },
        {
          ...createUrlFixture(
            'health-resaved',
            'https://docs.example/resaved',
            'Recently re-saved',
            firstSavedAt,
          ),
          lastSavedAt: now,
          updatedAt: now,
        },
      ],
    },
  }
}

const readHealthPersistence = async (
  serviceWorker: Parameters<typeof seedSavedTabsFixture>[0],
) => {
  const [urls, memberships] = await Promise.all([
    readPersistenceV2Store<{ id: string }>(serviceWorker, 'urls'),
    readPersistenceV2Store<{ collectionId: string; urlId: string }>(
      serviceWorker,
      'collectionMemberships',
    ),
  ])
  return { memberships, urls }
}

test('analytics health uses canonical URLs and keeps review/delete/undo/navigation consistent', async ({
  extensionId,
  page,
  serviceWorker,
}) => {
  await seedSavedTabsFixture(serviceWorker, createHealthSeed())
  const originalPersistence = await readHealthPersistence(serviceWorker)
  await page.goto(getExtensionUrl(extensionId, 'app.html#/analytics'))

  const health = page.getByRole('region', { name: 'Saved-tab health' })
  await expect(health).toBeVisible()
  await expect(health.getByLabel('Health score')).toHaveText('90 / 100')
  await expect(health.getByText(/^All 4 saved URLs,/)).toBeVisible()
  await expect(health.getByText('25%', { exact: true })).toBeVisible()
  await expect(health.getByText('0%', { exact: true })).toBeVisible()
  await expect(health.getByText(/available for 3 of 4 URLs/)).toBeVisible()
  await expect(health.getByText(/Viewing history is not tracked/)).toBeVisible()
  await expect(
    health.getByRole('button', {
      name: 'Review duplicate candidates',
      exact: true,
    }),
  ).toHaveCount(0)
  await page.screenshot({
    fullPage: true,
    path: '/tmp/issue-362-analytics-health.png',
  })

  const drilldown = page.getByTestId('analytics-drilldown-panel')
  await health
    .getByRole('button', { name: 'Review uncategorized tabs', exact: true })
    .click()
  await expect(
    drilldown.getByText('Recent inbox', { exact: true }),
  ).toBeVisible()
  await expect(
    drilldown.getByRole('button', { name: 'Delete tab' }),
  ).toHaveCount(1)
  await expect(
    drilldown.getByText('Old reference', { exact: true }),
  ).toHaveCount(0)

  await health
    .getByRole('button', { name: 'Review docs.example', exact: true })
    .click()
  await expect(
    drilldown.getByText('Recent inbox', { exact: true }),
  ).toBeVisible()
  await expect(
    drilldown.getByRole('button', { name: 'Delete tab' }),
  ).toHaveCount(1)

  await health
    .getByRole('button', {
      name: 'Review tabs not re-saved for 90 days',
      exact: true,
    })
    .click()
  await expect(
    drilldown.getByText('Old reference', { exact: true }),
  ).toBeVisible()
  await expect(
    drilldown.getByRole('button', { name: 'Delete tab' }),
  ).toHaveCount(1)
  await expect(drilldown.getByText('Legacy date', { exact: true })).toHaveCount(
    0,
  )
  await expect(
    drilldown.getByText('Recently re-saved', { exact: true }),
  ).toHaveCount(0)
  await expect(
    drilldown.getByRole('link', { name: 'Open Old reference' }),
  ).toHaveAttribute('href', 'https://docs.example/reference')

  await drilldown.getByRole('button', { name: 'Delete tab' }).click()
  await expect
    .poll(async () => readHealthPersistence(serviceWorker))
    .toEqual({
      memberships: originalPersistence.memberships.filter(
        ({ urlId }) => urlId !== 'health-old',
      ),
      urls: originalPersistence.urls.filter(({ id }) => id !== 'health-old'),
    })
  await expect(health.getByText(/^All 3 saved URLs,/)).toBeVisible()

  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect
    .poll(async () => readHealthPersistence(serviceWorker))
    .toEqual(originalPersistence)
  await expect(health.getByLabel('Health score')).toHaveText('90 / 100')
  await expect(
    drilldown.getByText('Old reference', { exact: true }),
  ).toBeVisible()
  await page.reload()
  await expect(health.getByLabel('Health score')).toHaveText('90 / 100')
  await expect(health.getByText(/^All 4 saved URLs,/)).toBeVisible()

  const organize = health.getByRole('link', { name: 'Organize in Saved Tabs' })
  await expect(organize).toHaveAttribute(
    'href',
    'app.html#/saved-tabs?mode=domain',
  )
  await organize.click()
  await expect(page).toHaveURL(
    getExtensionUrl(extensionId, 'app.html#/saved-tabs?mode=domain'),
  )
  await expect(page.getByText('Recent inbox', { exact: true })).toBeVisible()
  await expect(page.getByText('Old reference', { exact: true })).toBeVisible()
})

test('many uncategorized health candidates leave review actions uncovered', async ({
  extensionId,
  page,
  serviceWorker,
}) => {
  const now = Date.now()
  const collectionId = 'health-large-domain'
  const urls = Array.from({ length: 30 }, (_, index) =>
    createUrlFixture(
      `health-large-${index}`,
      `https://large.example/${index}`,
      `Inbox ${String(index + 1).padStart(2, '0')}`,
      now,
    ),
  )
  await seedSavedTabsFixture(serviceWorker, {
    storage: createBaseSeed({
      userSettings: { ...defaultUserSettings, confirmDeleteAll: true },
    }),
    persistence: {
      categories: [],
      collections: [
        createDomainCollectionFixture(collectionId, 'large.example', now),
      ],
      groups: [],
      memberships: urls.map(({ id }, index) =>
        createMembershipFixture(collectionId, id, now, index * 1024),
      ),
      urls,
    },
  })
  const originalPersistence = await readHealthPersistence(serviceWorker)
  await page.goto(getExtensionUrl(extensionId, 'app.html#/analytics'))
  const health = page.getByRole('region', { name: 'Saved-tab health' })
  await expect(health.getByLabel('Health score')).toHaveText('60 / 100')
  await health
    .getByRole('button', { name: 'Review uncategorized tabs', exact: true })
    .click()

  const drilldown = page.getByTestId('analytics-drilldown-panel')
  await expect(
    drilldown.getByRole('button', { name: 'Delete tab' }),
  ).toHaveCount(30)
  const openAll = drilldown.getByRole('button', {
    name: 'Open all tabs in this item',
  })
  const deleteAll = drilldown.getByRole('button', {
    name: 'Delete all tabs in this item',
  })
  await Promise.all(
    [openAll, deleteAll].map(async (action) => {
      await expect
        .poll(async () =>
          action.evaluate((element) => {
            const bounds = element.getBoundingClientRect()
            const target = document.elementFromPoint(
              bounds.left + bounds.width / 2,
              bounds.top + bounds.height / 2,
            )
            return target !== null && element.contains(target)
          }),
        )
        .toBe(true)
    }),
  )

  await openAll.click()
  const confirmation = page.getByRole('alertdialog')
  await expect(confirmation).toBeVisible()
  await confirmation
    .getByRole('button', { name: 'Cancel', exact: true })
    .click()
  await expect(confirmation).toHaveCount(0)
  await deleteAll.click()
  await expect(confirmation).toBeVisible()
  await confirmation
    .getByRole('button', { name: 'Cancel', exact: true })
    .click()
  await expect(confirmation).toHaveCount(0)
  await expect
    .poll(async () => readHealthPersistence(serviceWorker))
    .toEqual(originalPersistence)
  await page.screenshot({
    fullPage: true,
    path: '/tmp/issue-362-analytics-health-large-list.png',
  })
})
