import type { Locator } from '@playwright/test'

const confirmAfterPointerDrag = async (button: Locator): Promise<void> => {
  const target = await button.elementHandle()
  if (!target) {
    throw new Error('Reorder confirmation button is missing')
  }
  await target.evaluate((element) => {
    element.addEventListener(
      'click',
      () => {
        element.setAttribute('data-confirmation-received', 'true')
      },
      { once: true },
    )
  })
  // dnd-kit briefly suppresses document clicks after pointer drop. Wait for an
  // actual click to reach the button; accepted confirmation is dispatched once.
  await expect
    .poll(async () => {
      if (
        (await target.getAttribute('data-confirmation-received')) !== 'true'
      ) {
        await target.press('Enter')
      }
      return target.getAttribute('data-confirmation-received')
    })
    .toBe('true')
}

import {
  createCustomCollectionFixture,
  createExamplePersistenceFixture,
  createDomainCollectionFixture,
  createUrlFixture,
  createMembershipFixture,
} from '@/test/fixtures/persistenceBrowserFixtures'

import {
  createBaseSeed,
  defaultUserSettings,
  expect,
  getExtensionUrl,
  readPersistenceV2Store,
  seedSavedTabsFixture,
  test,
  waitForPersistenceV2Ready,
} from './helpers/extension'

const now = Date.now()

const createSeedWithUrls = () => ({
  persistence: createExamplePersistenceFixture(now),
  storage: createBaseSeed({
    userSettings: { ...defaultUserSettings, clickBehavior: 'saveCurrentTab' },
  }),
})

const createCustomProjectSeed = () => {
  const base = createSeedWithUrls()
  return {
    ...base,
    persistence: {
      ...base.persistence,
      collections: [
        ...base.persistence.collections,
        createCustomCollectionFixture('project-1', 'Test Project', now, 1024),
      ],
      memberships: [
        ...base.persistence.memberships,
        createMembershipFixture('project-1', 'url-example', now),
      ],
    },
    storage: { ...base.storage, viewMode: 'custom' },
  }
}

const readSavedTabCounts = async (
  serviceWorker: Parameters<typeof seedSavedTabsFixture>[0],
) => {
  const [memberships, urls] = await Promise.all([
    readPersistenceV2Store(serviceWorker, 'collectionMemberships'),
    readPersistenceV2Store(serviceWorker, 'urls'),
  ])
  return { memberships: memberships.length, urls: urls.length }
}

const createDomainOrderSeed = (categorized: boolean) => {
  const groupId = categorized ? 'docs-group' : undefined
  const domains = ['first.example', 'second.example']
  return {
    storage: createBaseSeed(),
    persistence: {
      categories: [],
      collections: domains.map((domain, sortOrder) => ({
        ...createDomainCollectionFixture(domain, domain, now, sortOrder),
        ...(groupId ? { groupId } : {}),
      })),
      groups: groupId
        ? [
            {
              id: groupId,
              name: 'Docs',
              createdAt: now,
              updatedAt: now,
              sortOrder: 0,
            },
          ]
        : [],
      memberships: domains.map((domain) =>
        createMembershipFixture(domain, `${domain}:url`, now),
      ),
      urls: domains.map((domain) =>
        createUrlFixture(`${domain}:url`, `https://${domain}/`, domain, now),
      ),
    },
  }
}

const isRankedCollection = (
  value: unknown,
): value is { id: string; sortOrder: number } =>
  typeof value === 'object' &&
  value !== null &&
  'id' in value &&
  typeof value.id === 'string' &&
  'sortOrder' in value &&
  typeof value.sortOrder === 'number'

const createChildCategoryOrderSeed = () => {
  const base = createSeedWithUrls()
  const urls = ['Alpha', 'Beta', 'Uncategorized'].map((title, index) =>
    createUrlFixture(
      `child-url-${index}`,
      `https://example.com/${index}`,
      title,
      now,
    ),
  )
  const categories = ['Alpha', 'Beta'].map((name, sortOrder) => ({
    collectionId: 'group-example',
    createdAt: now,
    id: `group-example:category:${sortOrder}`,
    keywords: [],
    name,
    sortOrder,
    updatedAt: now,
  }))
  return {
    ...base,
    persistence: {
      ...base.persistence,
      categories,
      urls,
      memberships: urls.map((url, index) => ({
        ...createMembershipFixture('group-example', url.id, now, index),
        ...(categories[index] ? { categoryId: categories[index].id } : {}),
      })),
    },
  }
}

test.describe('extension saved-tabs', () => {
  for (const scenario of [
    {
      label: 'regular',
      from: 'Alpha',
      to: 'Beta',
      expected: ['Beta', 'Alpha', 'Uncategorized'],
    },
    {
      label: 'uncategorized',
      from: 'Uncategorized',
      to: 'Alpha',
      expected: ['Uncategorized', 'Alpha', 'Beta'],
    },
  ]) {
    test(`child category order survives confirmation and reload (${scenario.label})`, async ({
      page,
      extensionId,
      serviceWorker,
    }, testInfo) => {
      await seedSavedTabsFixture(serviceWorker, createChildCategoryOrderSeed())
      await page.goto(
        getExtensionUrl(extensionId, 'app.html#/saved-tabs?mode=domain'),
      )
      const sections = page.getByTestId('sortable-category-section')
      const headings = sections.getByRole('heading', { level: 3 })
      await expect(headings).toHaveText(['Alpha', 'Beta', 'Uncategorized'])
      const from = page.getByRole('button').filter({
        has: page.getByRole('heading', { name: scenario.from, exact: true }),
      })
      const to = page.getByRole('button').filter({
        has: page.getByRole('heading', { name: scenario.to, exact: true }),
      })
      await from.dragTo(to)
      await expect(headings).toHaveText(scenario.expected)
      const confirm = page.getByRole('button', {
        name: 'Confirm parent category reordering',
        exact: true,
      })
      await confirmAfterPointerDrag(confirm)
      await expect(confirm).toBeHidden()
      await page.reload()
      await expect(headings).toHaveText(scenario.expected)
      await testInfo.attach('child-category-order-after-reload', {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
      })
    })
  }

  for (const categorized of [false, true]) {
    test(`domain order survives confirmation and reload (categorized=${String(categorized)})`, async ({
      extensionId,
      page,
      serviceWorker,
    }, testInfo) => {
      const domains = ['first.example', 'second.example']
      await seedSavedTabsFixture(
        serviceWorker,
        createDomainOrderSeed(categorized),
      )
      await page.goto(
        getExtensionUrl(extensionId, 'app.html#/saved-tabs?mode=domain'),
      )
      const headings = page
        .getByTestId('domain-scroll-target')
        .getByRole('heading', { level: 2 })
      await expect(headings).toHaveText(domains)
      const sourceTitle = page.getByRole('button').filter({
        has: page.getByRole('heading', { name: 'first.example', exact: true }),
      })
      const targetTitle = page.getByRole('button').filter({
        has: page.getByRole('heading', { name: 'second.example', exact: true }),
      })
      await sourceTitle.dragTo(targetTitle)
      await expect(headings).toHaveText(domains.toReversed())
      await confirmAfterPointerDrag(
        page.getByRole('button', {
          name: 'Confirm parent category reordering',
          exact: true,
        }),
      )
      await expect
        .poll(async () => {
          const collections = await readPersistenceV2Store(
            serviceWorker,
            'collections',
          )
          return collections
            .filter(isRankedCollection)
            .toSorted((left, right) => left.sortOrder - right.sortOrder)
            .map(({ id }) => id)
        })
        .toEqual(domains.toReversed())
      await page.reload()
      await expect(headings).toHaveText(domains.toReversed())
      await page.reload()
      await expect(headings).toHaveText(domains.toReversed())
      await testInfo.attach('domain-order-after-reload', {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
      })
    })
  }

  test('extension が起動し service worker が利用可能', async ({
    serviceWorker,
    extensionId,
  }) => {
    expect(serviceWorker).toBeDefined()
    expect(serviceWorker.url()).toContain('chrome-extension://')
    expect(extensionId).toBeTruthy()
    expect(typeof extensionId).toBe('string')
  })

  test('saved-tabs ページに保存済みタブが表示される', async ({
    extensionId,
    page,
    serviceWorker,
  }) => {
    await seedSavedTabsFixture(serviceWorker, createSeedWithUrls())

    await page.goto(
      getExtensionUrl(extensionId, 'app.html#/saved-tabs?mode=domain'),
    )
    await waitForPersistenceV2Ready(serviceWorker)

    await expect(page.getByText('example.com', { exact: true })).toBeVisible()
    await expect(page.getByText('Example Home')).toBeVisible()
  })

  test('ドメインモードで保存済みURLを削除できる', async ({
    extensionId,
    page,
    serviceWorker,
  }) => {
    await seedSavedTabsFixture(serviceWorker, createSeedWithUrls())

    await page.goto(
      getExtensionUrl(extensionId, 'app.html#/saved-tabs?mode=domain'),
    )
    await waitForPersistenceV2Ready(serviceWorker)

    await expect(page.getByText('Example Home')).toBeVisible()

    await page.locator('[data-testid="sortable-url-item"]').hover()
    await page.locator('[aria-label="Delete tab"]').click()

    await expect(page.getByText('Example Home')).toBeHidden()

    await expect
      .poll(async () => readSavedTabCounts(serviceWorker))
      .toEqual({ memberships: 0, urls: 0 })
  })

  test('カスタムモードで保存済みURLを削除できる', async ({
    extensionId,
    page,
    serviceWorker,
  }) => {
    await seedSavedTabsFixture(serviceWorker, createCustomProjectSeed())

    await page.goto(
      getExtensionUrl(extensionId, 'app.html#/saved-tabs?mode=custom'),
    )
    await waitForPersistenceV2Ready(serviceWorker)

    await expect(page.getByText('Example Home')).toBeVisible()

    await page.locator('[data-testid="project-url-item"]').hover()
    await page.locator('[aria-label="Delete tab"]').click()

    await expect(page.getByText('Example Home')).toBeHidden()

    await expect
      .poll(async () => {
        const memberships = await readPersistenceV2Store<{
          collectionId: string
        }>(serviceWorker, 'collectionMemberships')
        return memberships.some(
          ({ collectionId }) => collectionId === 'project-1',
        )
      })
      .toBe(false)
  })

  test('removeUrlFromStorage メッセージでバックグラウンド経由でURLを削除できる', async ({
    extensionId,
    page,
    serviceWorker,
  }) => {
    await seedSavedTabsFixture(serviceWorker, createSeedWithUrls())

    await page.goto(
      getExtensionUrl(extensionId, 'app.html#/saved-tabs?mode=domain'),
    )
    await waitForPersistenceV2Ready(serviceWorker)

    await expect(page.getByText('Example Home')).toBeVisible()

    await page.evaluate(async () => {
      await chrome.runtime.sendMessage({
        action: 'removeUrlFromStorage',
        url: 'https://example.com/',
      })
    })

    await expect(page.getByText('Example Home')).toBeHidden()

    await expect
      .poll(async () => readSavedTabCounts(serviceWorker))
      .toEqual({ memberships: 0, urls: 0 })
  })

  test('外部ドロップシミュレーションでURLが削除される', async ({
    extensionId,
    page,
    serviceWorker,
  }) => {
    await seedSavedTabsFixture(serviceWorker, createSeedWithUrls())

    await page.goto(
      getExtensionUrl(extensionId, 'app.html#/saved-tabs?mode=domain'),
    )
    await waitForPersistenceV2Ready(serviceWorker)

    await expect(page.getByText('Example Home')).toBeVisible()

    await page.evaluate(async () => {
      await chrome.runtime.sendMessage({
        action: 'urlDragStarted',
        groupId: 'group-example',
        url: 'https://example.com/',
      })
    })

    const response = await page.evaluate(async () => {
      return chrome.runtime.sendMessage({
        action: 'urlDropped',
        fromExternal: true,
        groupId: 'group-example',
        url: 'https://example.com/',
      })
    })
    expect(response).toMatchObject({ status: 'removed' })

    await expect(page.getByText('Example Home')).toBeHidden()

    await expect
      .poll(async () => readSavedTabCounts(serviceWorker))
      .toEqual({ memberships: 0, urls: 0 })
  })
})
