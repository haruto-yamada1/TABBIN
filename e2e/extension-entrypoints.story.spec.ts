import {
  expect,
  getExtensionUrl,
  readStorage,
  seedStorage,
  test,
} from './helpers/extension'

const now = 1_763_600_000_000

interface RuntimeLike {
  sendMessage?: (message: unknown) => Promise<unknown>
}

interface InitScriptPage {
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
  ...createBaseSeed(),
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

        return await originalSendMessage(message)
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
    await seedStorage(serviceWorker, createAnalyticsSeed())

    await page.goto(getExtensionUrl(extensionId, 'app.html#/analytics'))

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
