/* eslint-disable typescript/method-signature-style */
import {
  expect,
  getExtensionUrl,
  readStorage,
  seedPersistenceV2SavedTabs,
  seedStorage,
  test,
  waitForPersistenceV2Ready,
} from './helpers/extension'

const now = 1_763_600_000_000

type RuntimeLike = {
  sendMessage?: (message: unknown) => Promise<unknown>
}

type InitScriptPage = {
  addInitScript(script: () => void): Promise<unknown>
}

const createBaseSettings = () => ({
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
})

const createBaseSeed = () => ({
  customProjectOrder: [],
  customProjects: [],
  domainCategoryMappings: [],
  domainCategorySettings: [],
  parentCategories: [],
  savedTabs: [],
  'tab-manager-theme': 'system',
  urls: [],
  userSettings: createBaseSettings(),
  viewMode: 'domain',
})

const createAnalyticsSeed = () => ({
  categories: [],
  collections: [
    {
      createdAt: now,
      definition: { domain: 'example.com', type: 'domain' },
      id: 'collection-example',
      name: 'example.com',
      sortOrder: 1024,
      updatedAt: now,
    },
    {
      createdAt: now + 1,
      definition: { domain: 'docs.example.com', type: 'domain' },
      id: 'collection-docs',
      name: 'docs.example.com',
      sortOrder: 2048,
      updatedAt: now + 1,
    },
  ],
  groups: [],
  memberships: [
    {
      addedAt: now,
      addedAtProvenance: 'exact',
      collectionId: 'collection-example',
      sortOrder: 1024,
      updatedAt: now,
      urlId: 'url-example',
    },
    {
      addedAt: now + 1,
      addedAtProvenance: 'exact',
      collectionId: 'collection-docs',
      sortOrder: 1024,
      updatedAt: now + 1,
      urlId: 'url-docs',
    },
  ],
  urls: [
    {
      firstSavedAt: now,
      firstSavedAtProvenance: 'exact',
      id: 'url-example',
      lastSavedAt: now + 10,
      lastSavedAtProvenance: 'exact',
      normalizedUrl: 'https://example.com/',
      title: 'Example Home',
      updatedAt: now + 10,
      url: 'https://example.com/',
    },
    {
      firstSavedAt: now + 1,
      firstSavedAtProvenance: 'exact',
      id: 'url-docs',
      lastSavedAt: now + 20,
      lastSavedAtProvenance: 'exact',
      normalizedUrl: 'https://docs.example.com/guide',
      title: 'Docs Guide',
      updatedAt: now + 20,
      url: 'https://docs.example.com/guide',
    },
  ],
})

const installOllamaListFailureMock = async (page: InitScriptPage) => {
  await page.addInitScript(() => {
    const install = (runtime?: {
      sendMessage?: (message: unknown) => Promise<unknown>
    }) => {
      if (!runtime?.sendMessage) {
        return
      }

      const originalSendMessage = runtime.sendMessage.bind(runtime)
      const nextSendMessage = async (message: unknown) => {
        if (
          typeof message === 'object' &&
          message !== null &&
          'action' in message &&
          message.action === 'listOllamaModels'
        ) {
          return {
            error: 'Could not connect to Ollama.',
            ollamaError: {
              allowedOrigins: 'chrome-extension://test-extension-id',
              baseUrl: 'http://localhost:11434',
              downloadUrl: 'https://ollama.com/download',
              faqUrl:
                'https://docs.ollama.com/faq#how-do-i-configure-ollama-server',
              kind: 'notInstalledOrNotRunning',
              tagsUrl: 'http://localhost:11434/api/tags',
            },
            status: 'error',
          }
        }

        return originalSendMessage(message)
      }

      try {
        runtime.sendMessage = nextSendMessage
      } catch {
        Object.defineProperty(runtime, 'sendMessage', {
          configurable: true,
          value: nextSendMessage,
        })
      }
    }

    const runtimeGlobals = globalThis as typeof globalThis & {
      browser?: {
        runtime?: RuntimeLike
      }
      chrome?: {
        runtime?: RuntimeLike
      }
    }

    install(runtimeGlobals.browser?.runtime)
    install(runtimeGlobals.chrome?.runtime)
  })
}

test.describe('extension entrypoint stories', () => {
  test('options で設定を変更すると再読み込み後も保持される', async ({
    extensionId,
    page,
    serviceWorker,
  }) => {
    await seedStorage(serviceWorker, createBaseSeed())

    await page.goto(getExtensionUrl(extensionId, 'app.html#/options'))

    await page.locator('#click-behavior').click()
    await page.getByRole('option', { name: 'Save current tab' }).click()
    await page.locator('label[for="remove-after-open"]').click()
    await page.locator('#excludePatterns').fill('about:')
    await page.getByRole('button', { name: 'Add' }).click()

    await expect
      .poll(async () => {
        const data = await readStorage<{
          userSettings?: {
            clickBehavior?: string
            excludePatterns?: string[]
            removeTabAfterOpen?: boolean
          }
        }>(serviceWorker, 'userSettings')
        return {
          clickBehavior: data.userSettings?.clickBehavior,
          excludePatterns: data.userSettings?.excludePatterns ?? [],
          removeTabAfterOpen: data.userSettings?.removeTabAfterOpen,
        }
      })
      .toMatchObject({
        clickBehavior: 'saveCurrentTab',
        removeTabAfterOpen: false,
      })

    await expect
      .poll(async () => {
        const data = await readStorage<{
          userSettings?: {
            excludePatterns?: string[]
          }
        }>(serviceWorker, 'userSettings')
        return data.userSettings?.excludePatterns ?? []
      })
      .toContain('about:')

    await page.reload()

    await expect(page.locator('#click-behavior')).toContainText(
      'Save current tab',
    )
    await expect(page.locator('#remove-after-open')).toHaveAttribute(
      'data-state',
      'unchecked',
    )
    await expect(page.getByText('about:')).toBeVisible()
  })

  test('analytics でチャートをクリックするとドリルダウンを表示する', async ({
    extensionId,
    page,
    serviceWorker,
  }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await seedStorage(serviceWorker, createBaseSeed())
    await page.goto(getExtensionUrl(extensionId, 'app.html#/analytics'))
    await expect(
      page.getByRole('heading', { name: 'Analytics canvas' }),
    ).toBeVisible()
    await expect(
      readStorage(serviceWorker, 'tabbin:persistenceControlState:v2'),
    ).resolves.toEqual({
      'tabbin:persistenceControlState:v2': {
        migrationId: 'persistence-v2-production',
        persistenceGeneration: 2,
        status: 'indexeddb',
      },
    })
    await seedPersistenceV2SavedTabs(serviceWorker, createAnalyticsSeed())
    const seededUrlIds = await page.evaluate(async () => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('tabbin-persistence-v2', 1)
        request.addEventListener('success', () => resolve(request.result))
        request.addEventListener('error', () =>
          reject(request.error ?? new Error('Failed to open persistence v2.')),
        )
      })
      const transaction = database.transaction('urls', 'readonly')
      const request = transaction.objectStore('urls').getAllKeys()
      const ids = await new Promise<IDBValidKey[]>((resolve, reject) => {
        request.addEventListener('success', () => resolve(request.result))
        request.addEventListener('error', () =>
          reject(request.error ?? new Error('Failed to read URL IDs.')),
        )
      })
      database.close()
      return ids
    })
    expect(seededUrlIds).toEqual(['url-docs', 'url-example'])
    await page.reload()
    const reloadedUrlCount = await page.evaluate(async () => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('tabbin-persistence-v2', 1)
        request.addEventListener('success', () => resolve(request.result))
        request.addEventListener('error', () =>
          reject(request.error ?? new Error('Failed to open persistence v2.')),
        )
      })
      const transaction = database.transaction('urls', 'readonly')
      const request = transaction.objectStore('urls').count()
      const count = await new Promise<number>((resolve, reject) => {
        request.addEventListener('success', () => resolve(request.result))
        request.addEventListener('error', () =>
          reject(request.error ?? new Error('Failed to count URLs.')),
        )
      })
      database.close()
      return count
    })
    expect(reloadedUrlCount).toBe(2)

    await expect(page.getByRole('combobox', { name: 'Metric' })).toHaveText(
      'First saved URLs',
    )
    expect(pageErrors).toEqual([])
    await expect(
      page.getByText('Some historical dates come from legacy'),
    ).toHaveCount(0)
    await expect(
      page.getByRole('heading', { name: 'Saved count by domain' }),
    ).toBeVisible()
    await page
      .locator('[data-testid="analytics-canvas-pane"]')
      .getByText('docs.example.com')
      .click()

    await expect(page.getByText('Saved tabs in this item')).toBeVisible()
    await expect(page.getByText('Docs Guide')).toBeVisible()
    await expect(
      page.getByRole('link', { name: 'Open Docs Guide' }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Delete all tabs in this item' }),
    ).toBeVisible()
  })

  test('ai-chat でモデル一覧取得失敗時の Ollama ガイダンスを表示する', async ({
    extensionId,
    page,
    serviceWorker,
  }) => {
    await seedStorage(serviceWorker, createBaseSeed())
    await installOllamaListFailureMock(page)

    await page.goto(getExtensionUrl(extensionId, 'app.html#/ai-chat'))
    await waitForPersistenceV2Ready(serviceWorker)

    await expect(page.getByLabel('Ask AI')).toBeDisabled()
    await page.getByRole('combobox', { name: 'Select a model' }).click()

    await expect(page.getByText('Could not connect to Ollama.')).toBeVisible()
    await expect(
      page.getByText('If you have not installed Ollama yet, download it.'),
    ).toBeVisible()
    await expect(
      page.getByRole('textbox', { name: 'Copy command value' }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Copy command' }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Copy check command' }),
    ).toBeVisible()
  })
})
