import { readFile } from 'node:fs/promises'

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

test.describe('extension options', () => {
  test('設定をエクスポートしてエクスポートデータの内容を確認できる', async ({
    extensionId,
    page,
    serviceWorker,
  }) => {
    await seedStorage(serviceWorker, createSeedWithUrls())

    await page.goto(getExtensionUrl(extensionId, 'app.html#/options'))

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: /export/i }).click()
    const download = await downloadPromise

    const downloadPath = await download.path()
    expect(downloadPath).toBeTruthy()

    const fileContent = await readFile(downloadPath!, 'utf-8')
    const backupData = JSON.parse(fileContent)

    expect(backupData.version).toBeDefined()
    expect(backupData.urls).toHaveLength(1)
    expect(backupData.urls[0].url).toBe('https://example.com/')
    expect(backupData.savedTabs).toHaveLength(1)
    expect(backupData.savedTabs[0].domain).toBe('example.com')
  })

  test('エクスポートした設定からインポート相当のストレージ復元ができる', async ({
    extensionId,
    page,
    serviceWorker,
  }) => {
    await seedStorage(serviceWorker, createSeedWithUrls())

    await page.goto(getExtensionUrl(extensionId, 'app.html#/options'))

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: /export/i }).click()
    const download = await downloadPromise
    const downloadPath = await download.path()
    expect(downloadPath).toBeTruthy()

    const fileContent = await readFile(downloadPath!, 'utf-8')
    const backupData = JSON.parse(fileContent)
    expect(backupData.urls).toHaveLength(1)
    expect(backupData.savedTabs).toHaveLength(1)

    await serviceWorker.evaluate(async () => {
      await chrome.storage.local.clear()
      await chrome.storage.local.set({
        userSettings: {
          autoDeletePeriod: 'never',
          clickBehavior: 'saveSameDomainTabs',
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
      })
    })

    await serviceWorker.evaluate(async (data: {
      savedTabs: unknown[]
      urls: unknown[]
      customProjects: unknown[]
      parentCategories: unknown[]
      customProjectOrder: unknown[]
    }) => {
      await chrome.storage.local.set({
        savedTabs: data.savedTabs,
        urls: data.urls,
        customProjects: data.customProjects,
        parentCategories: data.parentCategories,
        customProjectOrder: data.customProjectOrder,
      })
    }, {
      savedTabs: backupData.savedTabs,
      urls: backupData.urls,
      customProjects: backupData.customProjects ?? [],
      parentCategories: backupData.parentCategories ?? [],
      customProjectOrder: backupData.customProjectOrder ?? [],
    })

    await page.goto(
      getExtensionUrl(extensionId, 'app.html#/saved-tabs?mode=domain'),
    )

    await expect(page.getByText('Example Home')).toBeVisible()

    const data = await readStorage<{
      savedTabs: { domain: string }[]
      urls: { url: string }[]
    }>(serviceWorker, ['savedTabs', 'urls'])
    expect(data.savedTabs[0].domain).toBe('example.com')
    expect(data.urls[0].url).toBe('https://example.com/')
  })
})
