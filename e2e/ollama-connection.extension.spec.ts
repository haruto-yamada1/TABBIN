import {
  createBaseSeed,
  expect,
  getExtensionUrl,
  readStorage,
  seedStorage,
  test,
  waitForPersistenceV2Ready,
} from './helpers/extension'

const connectionChanges = [
  ['http://localhost:11434', 'http://127.0.0.1:11434'],
  ['http://127.0.0.1:11434', 'http://localhost:11434'],
] as const

test.describe('extension Ollama connection settings', () => {
  for (const [initialBaseUrl, baseUrl] of connectionChanges) {
    test(`${baseUrl} を保存・再読み込みし、モデル一覧とチャットに反映する`, async ({
      extensionId,
      page,
      serviceWorker,
    }, testInfo) => {
      const seed = createBaseSeed()
      await seedStorage(serviceWorker, {
        ...seed,
        userSettings: { ...seed.userSettings, ollamaBaseUrl: initialBaseUrl },
      })
      await waitForPersistenceV2Ready(serviceWorker)
      // Mock only the Ollama HTTP boundary; use the actual UI, storage,
      // background handlers and installed provider SDK.
      await serviceWorker.evaluate(() => {
        const requests: string[] = []
        Reflect.set(globalThis, '__ollamaTestRequests', requests)
        const originalFetch = globalThis.fetch
        globalThis.fetch = async (input, init) => {
          const url = getRequestUrl(input)
          if (!/^http:\/\/(localhost|127\.0\.0\.1):11434\/api\//u.test(url)) {
            return originalFetch(input, init)
          }
          requests.push(url)
          if (url.endsWith('/api/tags')) {
            return Response.json({ models: [{ name: 'e2e-model' }] })
          }
          return Response.json({
            created_at: '2026-10-07T00:00:00Z',
            done: true,
            done_reason: 'stop',
            eval_count: 3,
            message: {
              content: 'Ollama connection verified.',
              role: 'assistant',
            },
            model: 'e2e-model',
            prompt_eval_count: 2,
          })
        }
        function getRequestUrl(input: RequestInfo | URL): string {
          if (typeof input === 'string') {
            return input
          }
          return input instanceof Request ? input.url : input.href
        }
      })

      await page.goto(getExtensionUrl(extensionId, 'app.html#/options'))
      const select = page.getByRole('combobox', {
        name: 'Ollama connection URL',
      })
      await expect(select).toHaveText(initialBaseUrl)
      await select.click()
      await page.getByRole('option', { name: baseUrl, exact: true }).click()
      await expect
        .poll(async () => {
          const stored = await readStorage<{
            userSettings: { ollamaBaseUrl?: string }
          }>(serviceWorker, 'userSettings')
          return stored.userSettings.ollamaBaseUrl
        })
        .toBe(baseUrl)
      await page.reload()
      await expect(select).toHaveText(baseUrl)
      await select.scrollIntoViewIfNeeded()
      await page.screenshot({ path: testInfo.outputPath('ollama-options.png') })

      await page.goto(getExtensionUrl(extensionId, 'app.html#/ai-chat'))
      await page.getByRole('combobox', { name: 'Select a model' }).click()
      await page.getByRole('option', { name: 'e2e-model', exact: true }).click()
      await expect(page.getByLabel('Ask AI')).toBeEnabled()
      await page.getByLabel('Ask AI').fill('Hello')
      await page.getByRole('button', { name: 'Submit', exact: true }).click()
      await expect(
        page.getByText('Ollama connection verified.', { exact: true }).first(),
      ).toBeVisible()

      const requests = await serviceWorker.evaluate(() => {
        const value: unknown = Reflect.get(globalThis, '__ollamaTestRequests')
        return Array.isArray(value)
          ? value.filter(
              (item: unknown): item is string => typeof item === 'string',
            )
          : []
      })
      expect(requests).toContain(`${baseUrl}/api/tags`)
      expect(requests).toContain(`${baseUrl}/api/chat`)
      expect(requests.every((url) => url.startsWith(`${baseUrl}/`))).toBe(true)
    })
  }

  test('選択した接続先を接続エラーの確認コマンドに表示する', async ({
    extensionId,
    page,
    serviceWorker,
  }) => {
    const seed = createBaseSeed()
    await seedStorage(serviceWorker, {
      ...seed,
      userSettings: {
        ...seed.userSettings,
        ollamaBaseUrl: 'http://127.0.0.1:11434',
      },
    })
    await serviceWorker.evaluate(() => {
      globalThis.fetch = async () => {
        throw new TypeError('Failed to fetch')
      }
    })
    await page.goto(getExtensionUrl(extensionId, 'app.html#/ai-chat'))
    await waitForPersistenceV2Ready(serviceWorker)
    await page.getByRole('combobox', { name: 'Select a model' }).click()
    await expect(
      page.getByText('http://127.0.0.1:11434', { exact: true }),
    ).toBeVisible()
    await expect(
      page.getByText('http://127.0.0.1:11434/api/tags', { exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('textbox', { name: 'Copy check command value' }),
    ).toHaveValue('curl http://127.0.0.1:11434/api/tags')
  })
})
