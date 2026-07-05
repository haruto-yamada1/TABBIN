import {
  expect,
  getExtensionUrl,
  readStorage,
  seedStorage,
  test,
} from './helpers/extension'

const now = Date.now()

const createSeedWithUrls = () => ({
  customProjectOrder: [],
  customProjects: [],
  domainCategoryMappings: [],
  domainCategorySettings: [],
  parentCategories: [],
  savedTabs: [
    {
      domain: 'example.com',
      id: 'group-example',
      urlIds: ['url-example'],
    },
  ],
  'tab-manager-theme': 'system',
  urls: [
    {
      id: 'url-example',
      savedAt: now,
      title: 'Example Home',
      url: 'https://example.com/',
    },
  ],
  userSettings: {
    autoDeletePeriod: 'never',
    clickBehavior: 'saveCurrentTab',
    colors: {},
    confirmDeleteAll: false,
    confirmDeleteEach: false,
    enableCategories: true,
    excludePatterns: ['chrome-extension://', 'chrome://'],
    excludePinnedTabs: true,
    language: 'en',
    ollamaModel: '',
    openAllInNewWindow: false,
    openUrlInBackground: true,
    removeTabAfterExternalDrop: true,
    removeTabAfterOpen: true,
    showSavedTime: false,
  },
  viewMode: 'domain',
})

const createCustomProjectSeed = () => {
  const base = createSeedWithUrls()
  return {
    ...base,
    customProjects: [
      {
        id: 'project-1',
        name: 'Test Project',
        urlIds: ['url-example'],
        categories: [],
        createdAt: now,
        updatedAt: now,
      },
    ],
    customProjectOrder: ['project-1'],
    viewMode: 'custom',
  }
}

test.describe('extension saved-tabs', () => {
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
    await seedStorage(serviceWorker, createSeedWithUrls())

    await page.goto(
      getExtensionUrl(extensionId, 'app.html#/saved-tabs?mode=domain'),
    )

    await expect(page.getByText('example.com', { exact: true })).toBeVisible()
    await expect(page.getByText('Example Home')).toBeVisible()
  })

  test('ドメインモードで保存済みURLを削除できる', async ({
    extensionId,
    page,
    serviceWorker,
  }) => {
    await seedStorage(serviceWorker, createSeedWithUrls())

    await page.goto(
      getExtensionUrl(extensionId, 'app.html#/saved-tabs?mode=domain'),
    )

    await expect(page.getByText('Example Home')).toBeVisible()

    await page.locator('[data-testid="sortable-url-item"]').hover()
    await page.locator('[aria-label="Delete tab"]').click()

    await expect(page.getByText('Example Home')).toBeHidden()

    await expect
      .poll(async () => {
        const data = await readStorage<{
          savedTabs: { urlIds?: string[] }[]
        }>(serviceWorker, ['savedTabs'])
        return data.savedTabs.filter((g) => g.urlIds?.length).length
      })
      .toBe(0)
  })

  test('カスタムモードで保存済みURLを削除できる', async ({
    extensionId,
    page,
    serviceWorker,
  }) => {
    await seedStorage(serviceWorker, createCustomProjectSeed())

    await page.goto(
      getExtensionUrl(extensionId, 'app.html#/saved-tabs?mode=custom'),
    )

    await expect(page.getByText('Example Home')).toBeVisible()

    await page.locator('[data-testid="project-url-item"]').hover()
    await page.locator('[aria-label="Delete tab"]').click()

    await expect(page.getByText('Example Home')).toBeHidden()

    await expect
      .poll(async () => {
        const data = await readStorage<{
          savedTabs: { urlIds?: string[] }[]
        }>(serviceWorker, ['savedTabs'])
        return data.savedTabs.filter((g) => g.urlIds?.length).length
      })
      .toBe(0)
  })

  test('removeUrlFromStorage メッセージでバックグラウンド経由でURLを削除できる', async ({
    extensionId,
    page,
    serviceWorker,
  }) => {
    await seedStorage(serviceWorker, createSeedWithUrls())

    await page.goto(
      getExtensionUrl(extensionId, 'app.html#/saved-tabs?mode=domain'),
    )

    await expect(page.getByText('Example Home')).toBeVisible()

    await page.evaluate(async () => {
      await chrome.runtime.sendMessage({
        action: 'removeUrlFromStorage',
        url: 'https://example.com/',
      })
    })

    await expect(page.getByText('Example Home')).toBeHidden()

    await expect
      .poll(async () => {
        const data = await readStorage<{
          savedTabs: { urlIds?: string[] }[]
        }>(serviceWorker, ['savedTabs'])
        return data.savedTabs.filter((g) => g.urlIds?.length).length
      })
      .toBe(0)
  })

  test('外部ドロップシミュレーションでURLが削除される', async ({
    extensionId,
    page,
    serviceWorker,
  }) => {
    await seedStorage(serviceWorker, createSeedWithUrls())

    await page.goto(
      getExtensionUrl(extensionId, 'app.html#/saved-tabs?mode=domain'),
    )

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
      .poll(async () => {
        const data = await readStorage<{
          savedTabs: { urlIds?: string[] }[]
        }>(serviceWorker, ['savedTabs'])
        return data.savedTabs.filter((g) => g.urlIds?.length).length
      })
      .toBe(0)
  })
})
