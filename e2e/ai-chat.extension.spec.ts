import {
  createBaseSeed,
  expect,
  getExtensionUrl,
  seedStorage,
  test,
} from './helpers/extension'

type RuntimeLike = {
  sendMessage?: (message: unknown) => Promise<unknown>
}

type InitScriptPage = {
  addInitScript: (script: () => void) => Promise<unknown>
}

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
        try {
          Object.defineProperty(runtime, 'sendMessage', {
            configurable: true,
            value: nextSendMessage,
          })
        } catch {
          // Both assignment and defineProperty failed; silently continue
        }
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

test.describe('extension ai-chat', () => {
  test('AIチャットページが表示できる', async ({
    extensionId,
    page,
    serviceWorker,
  }) => {
    await seedStorage(serviceWorker, createBaseSeed())

    await page.goto(getExtensionUrl(extensionId, 'app.html#/ai-chat'))

    await expect(
      page.getByRole('combobox', { name: 'Select a model' }),
    ).toBeVisible()
  })

  test('Ollama が未設定の状態でエラーガイダンスを表示する', async ({
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
