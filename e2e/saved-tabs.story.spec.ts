import {
  expect,
  getExtensionUrl,
  readPersistenceV2Store,
  seedStorage,
  test,
  waitForPersistenceV2Ready,
} from './helpers/extension'

const now = 1_763_600_000_000

const createSavedTabSeed = () => ({
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
    {
      domain: 'docs.example.com',
      id: 'group-docs',
      urlIds: ['url-docs'],
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
    {
      id: 'url-docs',
      savedAt: now + 1,
      title: 'Docs Guide',
      url: 'https://docs.example.com/guide',
    },
  ],
  userSettings: {
    autoDeletePeriod: 'never',
    clickBehavior: 'saveSameDomainTabs',
    colors: {},
    confirmDeleteAll: false,
    confirmDeleteEach: false,
    enableCategories: true,
    excludePatterns: ['chrome-extension://', 'chrome://'],
    excludePinnedTabs: true,
    language: 'ja',
    ollamaModel: '',
    openAllInNewWindow: false,
    openUrlInBackground: true,
    removeTabAfterExternalDrop: true,
    removeTabAfterOpen: true,
    showSavedTime: false,
  },
  viewMode: 'domain',
})

test.describe('saved-tabs stories', () => {
  test.describe.configure({ mode: 'serial' })

  test('空の saved-tabs 画面で空状態を表示する', async ({
    extensionId,
    page,
    serviceWorker,
  }) => {
    await seedStorage(serviceWorker, {
      customProjectOrder: [],
      customProjects: [],
      domainCategoryMappings: [],
      domainCategorySettings: [],
      parentCategories: [],
      savedTabs: [],
      'tab-manager-theme': 'system',
      urls: [],
      userSettings: {
        autoDeletePeriod: 'never',
        clickBehavior: 'saveSameDomainTabs',
        colors: {},
        confirmDeleteAll: false,
        confirmDeleteEach: false,
        enableCategories: true,
        excludePatterns: ['chrome-extension://', 'chrome://'],
        excludePinnedTabs: true,
        language: 'ja',
        ollamaModel: '',
        openAllInNewWindow: false,
        openUrlInBackground: true,
        removeTabAfterExternalDrop: true,
        removeTabAfterOpen: true,
        showSavedTime: false,
      },
      viewMode: 'domain',
    })

    await page.goto(
      getExtensionUrl(extensionId, 'app.html#/saved-tabs?mode=domain'),
    )
    await waitForPersistenceV2Ready(serviceWorker)

    await expect(page.getByText('保存されたタブはありません')).toBeVisible()
  })

  test('ドメインモードで検索し、タブを開くと保存一覧から取り除かれる', async ({
    extensionContext,
    extensionId,
    page,
    serviceWorker,
  }) => {
    await seedStorage(serviceWorker, createSavedTabSeed())

    await page.goto(
      getExtensionUrl(extensionId, 'app.html#/saved-tabs?mode=domain'),
    )
    await waitForPersistenceV2Ready(serviceWorker)

    await expect(page.getByText('example.com', { exact: true })).toBeVisible()
    await expect(
      page.getByText('docs.example.com', { exact: true }),
    ).toBeVisible()

    await page.getByPlaceholder('検索').fill('docs')
    await expect(
      page.getByText('docs.example.com', { exact: true }),
    ).toBeVisible()
    await expect(page.getByText('example.com', { exact: true })).toBeHidden()

    await page.getByPlaceholder('検索').fill('')

    const openedPagePromise = extensionContext.waitForEvent('page')
    await page
      .getByRole('button', { exact: true, name: 'Example Home' })
      .click()
    const openedPage = await openedPagePromise
    await openedPage.waitForLoadState()

    expect(openedPage.url()).toBe('https://example.com/')

    await expect
      .poll(async () => {
        const urls = await readPersistenceV2Store<{ id: string }>(
          serviceWorker,
          'urls',
        )
        return urls.some(({ id }) => id === 'url-example')
      })
      .toBe(false)
  })

  test('親カテゴリを作成してドメインを分類できる', async ({
    extensionId,
    page,
    serviceWorker,
  }) => {
    await seedStorage(serviceWorker, createSavedTabSeed())

    await page.goto(
      getExtensionUrl(extensionId, 'app.html#/saved-tabs?mode=domain'),
    )
    await waitForPersistenceV2Ready(serviceWorker)

    await page.getByRole('button', { name: /親カテゴリ管理/ }).click()
    await expect(page.getByRole('dialog')).toBeVisible()

    await page.getByLabel('新規親カテゴリ名').fill('仕事')
    await page.getByLabel('新規親カテゴリ名').press('Enter')

    await page.locator('#categorySelect').click()
    await page.getByRole('option', { name: '仕事' }).click()
    await page
      .getByRole('checkbox', { name: 'example.com', exact: true })
      .click()

    await page.keyboard.press('Escape')

    await expect
      .poll(async () => {
        const [collections, groups] = await Promise.all([
          readPersistenceV2Store<{
            definition: { domain?: string; type: string }
            groupId?: string
          }>(serviceWorker, 'collections'),
          readPersistenceV2Store<{ id: string; name: string }>(
            serviceWorker,
            'collectionGroups',
          ),
        ])
        const group = groups.find(({ name }) => name === '仕事')
        const domain = collections.find(
          ({ definition }) => definition.domain === 'example.com',
        )
        return {
          assigned: group !== undefined && domain?.groupId === group.id,
          groupName: group?.name,
        }
      })
      .toEqual({ assigned: true, groupName: '仕事' })

    await page.reload()
    await expect(page.getByText('仕事', { exact: true })).toBeVisible()
    await expect(page.getByText('example.com', { exact: true })).toBeVisible()
  })

  test('カスタムモードでプロジェクトを追加し、再読み込み後も保持する', async ({
    extensionId,
    page,
    serviceWorker,
  }) => {
    await seedStorage(serviceWorker, createSavedTabSeed())

    await page.goto(
      getExtensionUrl(extensionId, 'app.html#/saved-tabs?mode=domain'),
    )
    await waitForPersistenceV2Ready(serviceWorker)

    await page.getByRole('combobox').click()
    await page.getByRole('option', { name: 'カスタムモード' }).click()
    await expect(page).toHaveURL(/mode=custom/)

    await expect(
      page.getByRole('button', { name: /プロジェクト追加/ }),
    ).toBeVisible()
    await page.getByRole('button', { name: /プロジェクト追加/ }).click()
    await page.getByPlaceholder('例: 仕事、調査、後で読む').fill('調査')
    await page.getByPlaceholder('例: 仕事、調査、後で読む').press('Enter')

    await expect(page.getByText('調査', { exact: true })).toBeVisible()

    await page.reload()

    await expect(page).toHaveURL(/mode=custom/)
    await expect(page.getByText('調査', { exact: true })).toBeVisible()

    await expect
      .poll(async () => {
        const collections = await readPersistenceV2Store<{
          definition: { type: string }
          name: string
        }>(serviceWorker, 'collections')
        return collections
          .filter(({ definition }) => definition.type === 'custom')
          .map(({ name }) => name)
      })
      .toEqual(['調査'])
  })
})
