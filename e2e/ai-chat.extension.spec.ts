import type { Worker } from '@playwright/test'

import {
  createBaseSeed,
  expect,
  getExtensionUrl,
  seedStorage,
  test,
  waitForPersistenceV2Ready,
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

type SearchConversationSeed = {
  id: string
  messages: {
    content: string
    id: string
    role: 'assistant' | 'user'
  }[]
  title: string
  updatedAt: number
}

const seedSearchConversations = async (
  serviceWorker: Worker,
  conversations: readonly SearchConversationSeed[],
) => {
  await serviceWorker.evaluate(async (value) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('tabbin-persistence-v2', 1)
      request.addEventListener('success', () => resolve(request.result))
      request.addEventListener('error', () =>
        reject(request.error ?? new Error('Failed to open persistence v2.')),
      )
    })
    try {
      const transaction = database.transaction(
        ['conversations', 'messages'],
        'readwrite',
      )
      const completed = new Promise<void>((resolve, reject) => {
        transaction.addEventListener('complete', () => resolve())
        transaction.addEventListener('abort', () =>
          reject(transaction.error ?? new Error('Conversation seed aborted.')),
        )
        transaction.addEventListener('error', () =>
          reject(transaction.error ?? new Error('Conversation seed failed.')),
        )
      })
      for (const conversation of value) {
        transaction.objectStore('conversations').put({
          id: conversation.id,
          updatedAt: conversation.updatedAt,
          value: {
            createdAt: conversation.updatedAt - 1000,
            messageIds: conversation.messages.map(({ id }) => id),
            title: conversation.title,
          },
        })
        for (const message of conversation.messages) {
          transaction.objectStore('messages').put({
            conversationId: conversation.id,
            createdAt: conversation.updatedAt,
            id: message.id,
            value: message,
          })
        }
      }
      await completed
    } finally {
      database.close()
    }
  }, conversations)
}

test.describe('extension ai-chat', () => {
  test('AIチャットページが表示できる', async ({
    extensionId,
    page,
    serviceWorker,
  }) => {
    await seedStorage(serviceWorker, createBaseSeed())

    await page.goto(getExtensionUrl(extensionId, 'app.html#/ai-chat'))
    await waitForPersistenceV2Ready(serviceWorker)

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

  test('履歴をタイトル・全文から検索し、サイドバーとポップオーバーから会話を再開できる', async ({
    extensionId,
    page,
    serviceWorker,
  }) => {
    await seedStorage(serviceWorker, createBaseSeed())
    await waitForPersistenceV2Ready(serviceWorker)

    const now = Date.now()
    await seedSearchConversations(serviceWorker, [
      {
        id: 'search-conversation-b-message',
        messages: [
          {
            content:
              'Please find the quarterly planning notes in my saved tabs.',
            id: 'search-message-user',
            role: 'user',
          },
          {
            content:
              'I found the quarterly planning notes in the research collection.',
            id: 'search-message-assistant',
            role: 'assistant',
          },
        ],
        title: 'Saved tab cleanup',
        updatedAt: now - 2_000,
      },
      {
        id: 'search-conversation-a-title',
        messages: [
          {
            content: 'The summary is attached to this conversation.',
            id: 'search-message-summary',
            role: 'assistant',
          },
        ],
        title: 'Quarterly planning summary',
        updatedAt: now - 1_000,
      },
    ])

    await page.setViewportSize({ width: 1440, height: 960 })
    await page.goto(getExtensionUrl(extensionId, 'app.html#/ai-chat'))

    const sidebarSearch = page.getByRole('searchbox', {
      name: 'Search conversation history',
    })
    await expect(sidebarSearch).toBeVisible()
    await sidebarSearch.fill('quarterly planning')

    const titleResult = page.getByTestId(
      'conversation-search-result-search-conversation-a-title',
    )
    const messageResult = page.getByTestId(
      'conversation-search-result-search-conversation-b-message',
    )
    await expect(titleResult).toContainText('Matched title')
    await expect(messageResult).toContainText('You:')
    await expect(messageResult).toContainText('AI:')
    await expect(messageResult.locator('mark').first()).toHaveText(
      'quarterly planning',
    )
    await expect(
      page
        .getByTestId('conversation-search-results')
        .getByTestId(/conversation-search-result/),
    ).toHaveCount(2)
    await page.locator('aside').screenshot({
      animations: 'disabled',
      path: 'docs/assets/issue-1046-ai-chat-history-search-sidebar.png',
    })

    await page
      .getByRole('searchbox', { name: 'Search conversation history' })
      .fill('no matching conversation')
    await expect(page.getByTestId('conversation-search-empty')).toContainText(
      'No conversations match your search',
    )

    await page.getByRole('button', { name: 'Clear search' }).click()
    await expect(page.getByTestId('conversation-search-results')).toHaveCount(0)
    await expect(
      page.getByTestId('conversation-button-search-conversation-b-message'),
    ).toBeVisible()

    await page
      .getByRole('searchbox', { name: 'Search conversation history' })
      .fill('quarterly planning')
    await expect(messageResult).toBeVisible()
    await messageResult.click()
    await expect(page.getByTestId('chat-header-title')).toContainText(
      'Saved tab cleanup',
    )

    await page.goto(getExtensionUrl(extensionId, 'app.html#/saved-tabs'))
    await page.getByRole('button', { name: 'Open AI chat' }).click()
    await page.getByRole('button', { name: 'Recent conversations' }).click()

    const popover = page.locator('[data-radix-popper-content-wrapper]')
    await expect(popover).toBeVisible()
    const popoverSearch = popover.getByRole('searchbox', {
      name: 'Search conversation history',
    })
    await popoverSearch.fill('quarterly planning')
    await expect(
      popover.getByTestId(
        'conversation-search-result-search-conversation-b-message',
      ),
    ).toContainText('quarterly planning')
    await popover.screenshot({
      animations: 'disabled',
      path: 'docs/assets/issue-1046-ai-chat-history-search-popover.png',
    })

    await popover
      .getByTestId('conversation-search-result-search-conversation-a-title')
      .click()
    await expect(popover).toBeHidden()
    await expect(page.getByTestId('chat-header-title')).toContainText(
      'Quarterly planning summary',
    )
  })
})
