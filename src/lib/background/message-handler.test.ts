import { beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

const mocked = vi.hoisted(() => ({
  checkAndRemoveExpiredTabs: vi.fn(),
  getAlarm: vi.fn(),
  getExpirationPeriodMs: vi.fn(),
  handleUrlDragStarted: vi.fn(),
  handleUrlDropped: vi.fn(),
  isAutoDeletePeriod: vi.fn(),
  listLocalOllamaModels: vi.fn(),
  removeUrlRecordsFromStorage: vi.fn(),
  removeUrlFromStorage: vi.fn(),
  runAiChatRequest: vi.fn(),
  updateTabTimestamps: vi.fn(),
}))

vi.mock('./expired-tabs', () => ({
  checkAndRemoveExpiredTabs: mocked.checkAndRemoveExpiredTabs,
  getExpirationPeriodMs: mocked.getExpirationPeriodMs,
  isAutoDeletePeriod: mocked.isAutoDeletePeriod,
  updateTabTimestamps: mocked.updateTabTimestamps,
}))

vi.mock('./url-storage', () => ({
  handleUrlDragStarted: mocked.handleUrlDragStarted,
  handleUrlDropped: mocked.handleUrlDropped,
  removeUrlRecordsFromStorage: mocked.removeUrlRecordsFromStorage,
  removeUrlFromStorage: mocked.removeUrlFromStorage,
}))

vi.mock('./ai-chat', () => ({
  listLocalOllamaModels: mocked.listLocalOllamaModels,
  runAiChatRequest: mocked.runAiChatRequest,
}))

import { setupMessageListener } from './message-handler'

type ChromeMessageListener = (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void,
) => boolean

type ChromePortListener = (port: chrome.runtime.Port) => void

describe('setupMessageListener', () => {
  const setupListener = () => {
    let listener: ChromeMessageListener | undefined
    let portListener: ChromePortListener | undefined

    ;(
      globalThis as typeof globalThis & {
        chrome?: typeof chrome
      }
    ).chrome = {
      alarms: {
        get: vi.fn((_name, callback) => callback?.(null)), // eslint-disable-line
      },
      runtime: {
        onConnect: {
          addListener: vi.fn((callback) => {
            // eslint-disable-line
            portListener = callback
          }),
        },
        onMessage: {
          addListener: vi.fn((callback) => {
            // eslint-disable-line
            listener = callback
          }),
        },
      },
      storage: {
        local: {
          get: vi.fn((_keys, callback) => callback?.({ userSettings: {} })), // eslint-disable-line
        },
      },
    } as unknown as typeof chrome

    setupMessageListener()

    if (!listener) {
      throw new Error('listener not registered')
    }

    if (!portListener) {
      throw new Error('port listener not registered')
    }

    return {
      listener,
      portListener,
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('listOllamaModels を受けたらモデル一覧を返す', async () => {
    const { listener } = setupListener()
    mocked.listLocalOllamaModels.mockResolvedValue([
      {
        label: 'llama3.2 (8B)',
        name: 'llama3.2',
      },
    ])

    const sendResponse = vi.fn()
    const shouldKeepChannel = listener(
      {
        action: 'listOllamaModels',
      },
      {} as chrome.runtime.MessageSender,
      sendResponse,
    )

    expect(shouldKeepChannel).toBe(true)
    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        models: [
          {
            label: 'llama3.2 (8B)',
            name: 'llama3.2',
          },
        ],
        status: 'ok',
      })
    })
  })

  it('runAiChat を受けたら回答 payload を返す', async () => {
    const { listener } = setupListener()
    mocked.runAiChatRequest.mockResolvedValue({
      answer: 'assistant answer',
      charts: [
        {
          data: [{ count: 4, label: 'Frontend' }],
          series: [
            {
              colorToken: 'chart-1',
              dataKey: 'count',
              label: '保存数',
            },
          ],
          title: 'よく保存しているジャンル',
          type: 'pie',
        },
      ],
      recordCount: 4,
      reasoning: '- 使用ツール: 保存済み URL 一覧',
      toolTraces: [
        {
          input: {
            page: 1,
            pageSize: 10,
            sortDirection: 'desc',
          },
          output: [
            {
              url: 'https://example.com',
            },
          ],
          state: 'output-available',
          title: '保存済み URL 一覧',
          toolCallId: 'call-1',
          toolName: 'listSavedUrls',
          type: 'dynamic-tool',
        },
      ],
    })

    const sendResponse = vi.fn()
    const shouldKeepChannel = listener(
      {
        action: 'runAiChat',
        history: [],
        prompt: 'test',
      },
      {} as chrome.runtime.MessageSender,
      sendResponse,
    )

    expect(shouldKeepChannel).toBe(true)
    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        answer: 'assistant answer',
        charts: [
          {
            data: [{ count: 4, label: 'Frontend' }],
            series: [
              {
                colorToken: 'chart-1',
                dataKey: 'count',
                label: '保存数',
              },
            ],
            title: 'よく保存しているジャンル',
            type: 'pie',
          },
        ],
        recordCount: 4,
        reasoning: '- 使用ツール: 保存済み URL 一覧',
        status: 'ok',
        toolTraces: [
          {
            input: {
              page: 1,
              pageSize: 10,
              sortDirection: 'desc',
            },
            output: [
              {
                url: 'https://example.com',
              },
            ],
            state: 'output-available',
            title: '保存済み URL 一覧',
            toolCallId: 'call-1',
            toolName: 'listSavedUrls',
            type: 'dynamic-tool',
          },
        ],
      })
    })
  })

  it('不正メッセージと未知 action を弾く', () => {
    const { listener } = setupListener()
    const invalidResponse = vi.fn()
    const invalidRemoveResponse = vi.fn()
    const invalidBulkRemoveResponse = vi.fn()
    const invalidAiChatPromptResponse = vi.fn()
    const invalidAiChatHistoryResponse = vi.fn()
    const unknownResponse = vi.fn()

    expect(
      listener(null, {} as chrome.runtime.MessageSender, invalidResponse),
    ).toBe(false)
    expect(invalidResponse).toHaveBeenCalledWith({
      status: 'invalid_message',
    })

    expect(
      listener(
        { action: 'removeUrlFromStorage', url: 1 },
        {} as chrome.runtime.MessageSender,
        invalidRemoveResponse,
      ),
    ).toBe(false)
    expect(invalidRemoveResponse).toHaveBeenCalledWith({
      status: 'invalid_message',
    })
    expect(mocked.removeUrlFromStorage).not.toHaveBeenCalled()

    expect(
      listener(
        { action: 'removeUrlRecordsFromStorage', urlIds: 'invalid' },
        {} as chrome.runtime.MessageSender,
        invalidBulkRemoveResponse,
      ),
    ).toBe(false)
    expect(invalidBulkRemoveResponse).toHaveBeenCalledWith({
      status: 'invalid_message',
    })
    expect(mocked.removeUrlRecordsFromStorage).not.toHaveBeenCalled()

    expect(
      listener(
        {
          action: 'runAiChat',
          history: [],
          prompt: 1,
        },
        {} as chrome.runtime.MessageSender,
        invalidAiChatPromptResponse,
      ),
    ).toBe(false)
    expect(invalidAiChatPromptResponse).toHaveBeenCalledWith({
      status: 'invalid_message',
    })
    expect(mocked.runAiChatRequest).not.toHaveBeenCalled()

    expect(
      listener(
        {
          action: 'runAiChat',
          history: 'invalid',
          prompt: 'test',
        },
        {} as chrome.runtime.MessageSender,
        invalidAiChatHistoryResponse,
      ),
    ).toBe(false)
    expect(invalidAiChatHistoryResponse).toHaveBeenCalledWith({
      status: 'invalid_message',
    })
    expect(mocked.runAiChatRequest).not.toHaveBeenCalled()

    expect(
      listener(
        { action: 'unknown' },
        {} as chrome.runtime.MessageSender,
        unknownResponse,
      ),
    ).toBe(false)
    expect(unknownResponse).toHaveBeenCalledWith({
      status: 'unknown_action',
    })
  })

  it('urlDragStarted, urlDropped, removeUrlFromStorage を処理する', async () => {
    const { listener } = setupListener()
    const dragStartedResponse = vi.fn()
    const droppedResponse = vi.fn()
    const internalResponse = vi.fn()
    const removeResponse = vi.fn()
    mocked.handleUrlDropped.mockResolvedValue('removed')
    mocked.removeUrlFromStorage.mockResolvedValue(undefined)

    expect(
      listener(
        { action: 'urlDragStarted', url: 'https://example.com' },
        {} as chrome.runtime.MessageSender,
        dragStartedResponse,
      ),
    ).toBe(true)
    expect(mocked.handleUrlDragStarted).toHaveBeenCalledWith(
      'https://example.com',
    )
    expect(dragStartedResponse).toHaveBeenCalledWith({ status: 'ok' })

    listener(
      {
        action: 'urlDropped',
        fromExternal: true,
        url: 'https://example.com',
      },
      {} as chrome.runtime.MessageSender,
      droppedResponse,
    )
    await vi.waitFor(() => {
      expect(droppedResponse).toHaveBeenCalledWith({
        status: 'removed',
      })
    })

    listener(
      {
        action: 'urlDropped',
        fromExternal: false,
        url: 'https://example.com',
      },
      {} as chrome.runtime.MessageSender,
      internalResponse,
    )
    expect(internalResponse).toHaveBeenCalledWith({
      status: 'internal_operation',
    })

    listener(
      {
        action: 'removeUrlFromStorage',
        url: 'https://example.com',
      },
      {} as chrome.runtime.MessageSender,
      removeResponse,
    )
    await vi.waitFor(() => {
      expect(removeResponse).toHaveBeenCalledWith({
        status: 'removed',
      })
    })

    mocked.handleUrlDropped.mockRejectedValueOnce('drop failed')
    const dropErrorResponse = vi.fn()
    listener(
      {
        action: 'urlDropped',
        fromExternal: true,
        url: 'https://example.com',
      },
      {} as chrome.runtime.MessageSender,
      dropErrorResponse,
    )
    await vi.waitFor(() => {
      expect(dropErrorResponse).toHaveBeenCalledWith({
        error: 'drop failed',
        status: 'error',
      })
    })

    mocked.removeUrlFromStorage.mockRejectedValueOnce('remove failed')
    const removeErrorResponse = vi.fn()
    listener(
      {
        action: 'removeUrlFromStorage',
        url: 'https://example.com',
      },
      {} as chrome.runtime.MessageSender,
      removeErrorResponse,
    )
    await vi.waitFor(() => {
      expect(removeErrorResponse).toHaveBeenCalledWith({
        error: 'remove failed',
        status: 'error',
      })
    })
  })

  it('removeUrlRecordsFromStorage を処理する', async () => {
    const { listener } = setupListener()
    const bulkRemoveResponse = vi.fn()
    const emptyBulkRemoveResponse = vi.fn()
    const bulkRemoveErrorResponse = vi.fn()
    const errorObjectResponse = vi.fn()
    mocked.removeUrlRecordsFromStorage.mockResolvedValueOnce(2)
    mocked.removeUrlRecordsFromStorage.mockResolvedValueOnce(0)
    mocked.removeUrlRecordsFromStorage.mockRejectedValueOnce('bulk failed')
    mocked.removeUrlRecordsFromStorage.mockRejectedValueOnce(
      new Error('bulk object failed'),
    )

    listener(
      {
        action: 'removeUrlRecordsFromStorage',
        urlIds: ['url-1', 'url-2'],
      },
      {} as chrome.runtime.MessageSender,
      bulkRemoveResponse,
    )
    await vi.waitFor(() => {
      expect(bulkRemoveResponse).toHaveBeenCalledWith({
        removedCount: 2,
        status: 'removed',
      })
    })
    expect(mocked.removeUrlRecordsFromStorage).toHaveBeenCalledWith([
      'url-1',
      'url-2',
    ])

    listener(
      {
        action: 'removeUrlRecordsFromStorage',
        urlIds: [],
      },
      {} as chrome.runtime.MessageSender,
      emptyBulkRemoveResponse,
    )
    await vi.waitFor(() => {
      expect(emptyBulkRemoveResponse).toHaveBeenCalledWith({
        removedCount: 0,
        status: 'removed',
      })
    })

    listener(
      {
        action: 'removeUrlRecordsFromStorage',
        urlIds: ['url-1'],
      },
      {} as chrome.runtime.MessageSender,
      bulkRemoveErrorResponse,
    )
    await vi.waitFor(() => {
      expect(bulkRemoveErrorResponse).toHaveBeenCalledWith({
        error: 'bulk failed',
        status: 'error',
      })
    })

    listener(
      {
        action: 'removeUrlRecordsFromStorage',
        urlIds: ['url-2'],
      },
      {} as chrome.runtime.MessageSender,
      errorObjectResponse,
    )
    await vi.waitFor(() => {
      expect(errorObjectResponse).toHaveBeenCalledWith({
        error: 'bulk object failed',
        status: 'error',
      })
    })
  })

  it('calculateTimeRemaining の null/success/error 分岐を返す', () => {
    const { listener } = setupListener()
    const nullResponse = vi.fn()
    const invalidResponse = vi.fn()
    const successResponse = vi.fn()
    const errorResponse = vi.fn()

    listener(
      {
        action: 'calculateTimeRemaining',
        autoDeletePeriod: 'never',
        savedAt: 10,
      },
      {} as chrome.runtime.MessageSender,
      nullResponse,
    )
    expect(nullResponse).toHaveBeenCalledWith({
      timeRemaining: null,
    })

    mocked.isAutoDeletePeriod.mockReturnValue(false)
    listener(
      {
        action: 'calculateTimeRemaining',
        autoDeletePeriod: 'custom',
        savedAt: 10,
      },
      {} as chrome.runtime.MessageSender,
      invalidResponse,
    )
    expect(invalidResponse).toHaveBeenCalledWith({
      timeRemaining: null,
    })

    mocked.isAutoDeletePeriod.mockReturnValue(true)
    mocked.getExpirationPeriodMs.mockReturnValue(1_000)
    vi.spyOn(Date, 'now').mockReturnValue(100)
    listener(
      {
        action: 'calculateTimeRemaining',
        autoDeletePeriod: '1day',
        savedAt: 10,
      },
      {} as chrome.runtime.MessageSender,
      successResponse,
    )
    expect(successResponse).toHaveBeenCalledWith({
      expirationTime: 1010,
      timeRemaining: 910,
    })

    mocked.getExpirationPeriodMs.mockReturnValue(0)
    const zeroResponse = vi.fn()
    listener(
      {
        action: 'calculateTimeRemaining',
        autoDeletePeriod: '1day',
        savedAt: 10,
      },
      {} as chrome.runtime.MessageSender,
      zeroResponse,
    )
    expect(zeroResponse).toHaveBeenCalledWith({
      timeRemaining: null,
    })

    mocked.getExpirationPeriodMs.mockImplementation(() => {
      throw new Error('boom')
    })
    listener(
      {
        action: 'calculateTimeRemaining',
        autoDeletePeriod: '1day',
        savedAt: 10,
      },
      {} as chrome.runtime.MessageSender,
      errorResponse,
    )
    expect(errorResponse).toHaveBeenCalledWith({
      error: 'Error: boom',
      timeRemaining: null,
    })
  })

  it('期限切れチェックと時刻更新の success/error を返す', async () => {
    const { listener } = setupListener()
    const checkResponse = vi.fn()
    const updateResponse = vi.fn()
    const checkErrorResponse = vi.fn()
    const updateErrorResponse = vi.fn()

    mocked.updateTabTimestamps.mockResolvedValue('updated')
    mocked.checkAndRemoveExpiredTabs.mockResolvedValue(undefined)

    listener(
      {
        action: 'checkExpiredTabs',
        updateTimestamps: true,
        period: '1day',
      },
      {} as chrome.runtime.MessageSender,
      checkResponse,
    )
    await vi.waitFor(() => {
      expect(checkResponse).toHaveBeenCalledWith({
        status: 'completed',
        success: true,
      })
    })

    listener(
      {
        action: 'updateTabTimestamps',
        period: '1day',
      },
      {} as chrome.runtime.MessageSender,
      updateResponse,
    )
    await vi.waitFor(() => {
      expect(updateResponse).toHaveBeenCalledWith({
        result: 'updated',
        status: 'completed',
      })
    })

    const checkOnlySuccessResponse = vi.fn()
    mocked.checkAndRemoveExpiredTabs.mockResolvedValueOnce(undefined)
    listener(
      {
        action: 'checkExpiredTabs',
      },
      {} as chrome.runtime.MessageSender,
      checkOnlySuccessResponse,
    )
    await vi.waitFor(() => {
      expect(checkOnlySuccessResponse).toHaveBeenCalledWith({
        status: 'completed',
      })
    })

    const checkWithoutPeriodResponse = vi.fn()
    mocked.updateTabTimestamps.mockResolvedValueOnce('updated')
    mocked.checkAndRemoveExpiredTabs.mockResolvedValueOnce(undefined)
    listener(
      {
        action: 'checkExpiredTabs',
        updateTimestamps: true,
      },
      {} as chrome.runtime.MessageSender,
      checkWithoutPeriodResponse,
    )
    await vi.waitFor(() => {
      expect(mocked.updateTabTimestamps).toHaveBeenCalledWith(undefined)
      expect(checkWithoutPeriodResponse).toHaveBeenCalledWith({
        status: 'completed',
        success: true,
      })
    })

    const checkNestedErrorResponse = vi.fn()
    mocked.updateTabTimestamps.mockResolvedValueOnce('updated')
    mocked.checkAndRemoveExpiredTabs.mockRejectedValueOnce(new Error('nested'))
    listener(
      {
        action: 'checkExpiredTabs',
        updateTimestamps: true,
        period: '1day',
      },
      {} as chrome.runtime.MessageSender,
      checkNestedErrorResponse,
    )
    await vi.waitFor(() => {
      expect(checkNestedErrorResponse).toHaveBeenCalledWith({
        error: 'Error: nested',
        status: 'error',
      })
    })

    const updateTimestampsErrorResponse = vi.fn()
    mocked.updateTabTimestamps.mockRejectedValueOnce(new Error('timestamp'))
    listener(
      {
        action: 'checkExpiredTabs',
        updateTimestamps: true,
        period: '1day',
      },
      {} as chrome.runtime.MessageSender,
      updateTimestampsErrorResponse,
    )
    await vi.waitFor(() => {
      expect(updateTimestampsErrorResponse).toHaveBeenCalledWith({
        error: 'Error: timestamp',
        status: 'error',
      })
    })

    mocked.checkAndRemoveExpiredTabs.mockRejectedValue(
      new Error('check failed'),
    )
    listener(
      {
        action: 'checkExpiredTabs',
      },
      {} as chrome.runtime.MessageSender,
      checkErrorResponse,
    )
    await vi.waitFor(() => {
      expect(checkErrorResponse).toHaveBeenCalledWith({
        error: 'Error: check failed',
        status: 'error',
      })
    })

    mocked.updateTabTimestamps.mockRejectedValue(new Error('update failed'))
    listener(
      {
        action: 'updateTabTimestamps',
        period: '1day',
      },
      {} as chrome.runtime.MessageSender,
      updateErrorResponse,
    )
    await vi.waitFor(() => {
      expect(updateErrorResponse).toHaveBeenCalledWith({
        error: 'Error: update failed',
        status: 'error',
      })
    })
  })

  it('アラーム状態と AI エラー系も返す', async () => {
    let listener: ChromeMessageListener | undefined

    ;(
      globalThis as typeof globalThis & {
        chrome?: typeof chrome
      }
    ).chrome = {
      alarms: {
        get: vi.fn((name, callback) =>
          // eslint-disable-line
          callback?.({
            name,
            scheduledTime: 123,
          } as chrome.alarms.Alarm),
        ),
      },
      runtime: {
        onMessage: {
          addListener: vi.fn((callback) => {
            // eslint-disable-line
            listener = callback
          }),
        },
      },
      storage: {
        local: {
          get: vi.fn(),
        },
      },
    } as unknown as typeof chrome

    setupMessageListener()

    if (!listener) {
      throw new Error('listener not registered')
    }

    mocked.listLocalOllamaModels.mockRejectedValue(new Error('ollama down'))
    mocked.runAiChatRequest.mockRejectedValue(new Error('ai down'))

    const alarmResponse = vi.fn()
    const listResponse = vi.fn()
    const aiResponse = vi.fn()

    listener(
      { action: 'getAlarmStatus' },
      {} as chrome.runtime.MessageSender,
      alarmResponse,
    )
    expect(alarmResponse).toHaveBeenCalledWith({
      exists: true,
      scheduledTime: 123,
    })

    listener(
      { action: 'listOllamaModels' },
      {} as chrome.runtime.MessageSender,
      listResponse,
    )
    listener(
      { action: 'runAiChat', history: [], prompt: 'test' },
      {} as chrome.runtime.MessageSender,
      aiResponse,
    )

    await vi.waitFor(() => {
      expect(listResponse).toHaveBeenCalledWith({
        error: 'ollama down',
        status: 'error',
      })
      expect(aiResponse).toHaveBeenCalledWith({
        error: 'ai down',
        status: 'error',
      })
    })
  })

  it('アラーム未登録と非 Error の AI エラーも返す', async () => {
    const { listener } = setupListener()
    const alarmsGetMock = vi.fn(
      (_name?: string, callback?: (alarm?: chrome.alarms.Alarm) => void) =>
        callback?.(undefined),
    ) as unknown as typeof chrome.alarms.get

    ;(
      globalThis as typeof globalThis & {
        chrome?: typeof chrome
      }
    ).chrome.alarms.get = alarmsGetMock

    mocked.listLocalOllamaModels.mockRejectedValueOnce('plain-model-error')
    mocked.runAiChatRequest.mockRejectedValueOnce('plain-ai-error')

    const alarmResponse = vi.fn()
    const modelsResponse = vi.fn()
    const aiResponse = vi.fn()

    listener(
      { action: 'getAlarmStatus' },
      {} as chrome.runtime.MessageSender,
      alarmResponse,
    )
    expect(alarmResponse).toHaveBeenCalledWith({
      exists: false,
    })

    listener(
      { action: 'listOllamaModels' },
      {} as chrome.runtime.MessageSender,
      modelsResponse,
    )
    listener(
      { action: 'runAiChat', history: [], prompt: 'test' },
      {} as chrome.runtime.MessageSender,
      aiResponse,
    )

    await vi.waitFor(() => {
      expect(modelsResponse).toHaveBeenCalledWith({
        error: 'plain-model-error',
        status: 'error',
      })
      expect(aiResponse).toHaveBeenCalledWith({
        error: 'plain-ai-error',
        status: 'error',
      })
    })
  })

  it('Ollama 構造化エラーを listOllamaModels と runAiChat の応答に含める', async () => {
    const { listener } = setupListener()
    const modelError = Object.assign(new Error('ollama down'), {
      ollamaError: {
        baseUrl: 'http://localhost:11434',
        downloadUrl: 'https://ollama.com/download',
        faqUrl: 'https://docs.ollama.com/faq#how-do-i-configure-ollama-server',
        kind: 'notInstalledOrNotRunning',
        tagsUrl: 'http://localhost:11434/api/tags',
      },
    })
    const chatError = Object.assign(new Error('forbidden'), {
      ollamaError: {
        allowedOrigins: 'chrome-extension://test-extension-id',
        baseUrl: 'http://localhost:11434',
        downloadUrl: 'https://ollama.com/download',
        faqUrl: 'https://docs.ollama.com/faq#how-do-i-configure-ollama-server',
        kind: 'forbidden',
        tagsUrl: 'http://localhost:11434/api/tags',
      },
    })

    mocked.listLocalOllamaModels.mockRejectedValueOnce(modelError)
    mocked.runAiChatRequest.mockRejectedValueOnce(chatError)

    const modelsResponse = vi.fn()
    const aiResponse = vi.fn()

    listener(
      { action: 'listOllamaModels' },
      {} as chrome.runtime.MessageSender,
      modelsResponse,
    )
    listener(
      { action: 'runAiChat', history: [], prompt: 'test' },
      {} as chrome.runtime.MessageSender,
      aiResponse,
    )

    await vi.waitFor(() => {
      expect(modelsResponse).toHaveBeenCalledWith({
        error: 'ollama down',
        ollamaError: {
          baseUrl: 'http://localhost:11434',
          downloadUrl: 'https://ollama.com/download',
          faqUrl:
            'https://docs.ollama.com/faq#how-do-i-configure-ollama-server',
          kind: 'notInstalledOrNotRunning',
          tagsUrl: 'http://localhost:11434/api/tags',
        },
        status: 'error',
      })
      expect(aiResponse).toHaveBeenCalledWith({
        error: 'forbidden',
        ollamaError: {
          allowedOrigins: 'chrome-extension://test-extension-id',
          baseUrl: 'http://localhost:11434',
          downloadUrl: 'https://ollama.com/download',
          faqUrl:
            'https://docs.ollama.com/faq#how-do-i-configure-ollama-server',
          kind: 'forbidden',
          tagsUrl: 'http://localhost:11434/api/tags',
        },
        status: 'error',
      })
    })
  })

  it('ai-chat-stream port では step ごとに進捗を返してから完了を返す', async () => {
    const { portListener } = setupListener()
    let onPortMessage: ((message: unknown) => void) | undefined
    const port = {
      disconnect: vi.fn(),
      name: 'ai-chat-stream',
      onDisconnect: {
        addListener: vi.fn(),
      },
      onMessage: {
        addListener: vi.fn((listener) => {
          // eslint-disable-line
          onPortMessage = listener
        }),
      },
      postMessage: vi.fn(),
    } as unknown as chrome.runtime.Port

    mocked.runAiChatRequest.mockImplementation(
      async (
        _request: unknown,
        options?: {
          onStepUpdate?: (step: {
            reasoning: string
            toolTraces: unknown[]
          }) => void
        },
      ) => {
        options?.onStepUpdate?.({
          reasoning: '- 使用ツール: 保存済み URL 一覧',
          toolTraces: [
            {
              input: {
                page: 1,
                pageSize: 10,
                sortDirection: 'desc',
              },
              output: [
                {
                  url: 'https://example.com',
                },
              ],
              state: 'output-available',
              title: '保存済み URL 一覧',
              toolCallId: 'call-1',
              toolName: 'listSavedUrls',
              type: 'dynamic-tool',
            },
          ],
        })

        return {
          answer: 'assistant answer',
          recordCount: 4,
          reasoning: '- 使用ツール: 保存済み URL 一覧',
          toolTraces: [
            {
              input: {
                page: 1,
                pageSize: 10,
                sortDirection: 'desc',
              },
              output: [
                {
                  url: 'https://example.com',
                },
              ],
              state: 'output-available',
              title: '保存済み URL 一覧',
              toolCallId: 'call-1',
              toolName: 'listSavedUrls',
              type: 'dynamic-tool',
            },
          ],
        }
      },
    )

    portListener(port)
    onPortMessage?.({
      history: [],
      prompt: 'test',
      type: 'run',
    })

    await vi.waitFor(() => {
      expect(port.postMessage).toHaveBeenNthCalledWith(1, {
        reasoning: '- 使用ツール: 保存済み URL 一覧',
        toolTraces: [
          {
            input: {
              page: 1,
              pageSize: 10,
              sortDirection: 'desc',
            },
            output: [
              {
                url: 'https://example.com',
              },
            ],
            state: 'output-available',
            title: '保存済み URL 一覧',
            toolCallId: 'call-1',
            toolName: 'listSavedUrls',
            type: 'dynamic-tool',
          },
        ],
        type: 'step',
      })
      expect(port.postMessage).toHaveBeenNthCalledWith(2, {
        answer: 'assistant answer',
        reasoning: '- 使用ツール: 保存済み URL 一覧',
        recordCount: 4,
        toolTraces: [
          {
            input: {
              page: 1,
              pageSize: 10,
              sortDirection: 'desc',
            },
            output: [
              {
                url: 'https://example.com',
              },
            ],
            state: 'output-available',
            title: '保存済み URL 一覧',
            toolCallId: 'call-1',
            toolName: 'listSavedUrls',
            type: 'dynamic-tool',
          },
        ],
        type: 'complete',
      })
    })
  })

  it('ai-chat-stream 以外の port は無視し、stream error は error payload を返す', async () => {
    const { portListener } = setupListener()
    const ignoredPort = {
      name: 'other-port',
      onMessage: {
        addListener: vi.fn(),
      },
    } as unknown as chrome.runtime.Port

    portListener(ignoredPort)

    expect(ignoredPort.onMessage.addListener).not.toHaveBeenCalled()

    let onPortMessage: ((message: unknown) => void) | undefined
    const streamPort = {
      disconnect: vi.fn(),
      name: 'ai-chat-stream',
      onDisconnect: {
        addListener: vi.fn(),
      },
      onMessage: {
        addListener: vi.fn((listener) => {
          // eslint-disable-line
          onPortMessage = listener
        }),
      },
      postMessage: vi.fn(),
    } as unknown as chrome.runtime.Port

    mocked.runAiChatRequest.mockRejectedValueOnce(new Error('stream failed'))

    portListener(streamPort)
    onPortMessage?.({
      type: 'noop',
    })
    expect(mocked.runAiChatRequest).not.toHaveBeenCalled()

    onPortMessage?.({
      history: [],
      prompt: 'test',
      type: 'run',
    })

    await vi.waitFor(() => {
      expect(streamPort.postMessage).toHaveBeenCalledWith({
        error: 'stream failed',
        type: 'error',
      })
    })
  })

  it('ai-chat-stream では非 Error の stream error も文字列化して返す', async () => {
    const { portListener } = setupListener()
    let onPortMessage: ((message: unknown) => void) | undefined
    const streamPort = {
      disconnect: vi.fn(),
      name: 'ai-chat-stream',
      onDisconnect: {
        addListener: vi.fn(),
      },
      onMessage: {
        addListener: vi.fn((listener) => {
          // eslint-disable-line
          onPortMessage = listener
        }),
      },
      postMessage: vi.fn(),
    } as unknown as chrome.runtime.Port

    mocked.runAiChatRequest.mockRejectedValueOnce('plain-stream-error')

    portListener(streamPort)
    onPortMessage?.({
      history: [],
      prompt: 'test',
      type: 'run',
    })

    await vi.waitFor(() => {
      expect(streamPort.postMessage).toHaveBeenCalledWith({
        error: 'plain-stream-error',
        type: 'error',
      })
    })
  })

  it('ai-chat-stream では構造化された Ollama エラーも error payload に含める', async () => {
    const { portListener } = setupListener()
    let onPortMessage: ((message: unknown) => void) | undefined
    const streamPort = {
      disconnect: vi.fn(),
      name: 'ai-chat-stream',
      onDisconnect: {
        addListener: vi.fn(),
      },
      onMessage: {
        addListener: vi.fn((listener) => {
          // eslint-disable-line
          onPortMessage = listener
        }),
      },
      postMessage: vi.fn(),
    } as unknown as chrome.runtime.Port

    mocked.runAiChatRequest.mockRejectedValueOnce(
      Object.assign(new Error('forbidden'), {
        ollamaError: {
          allowedOrigins: 'chrome-extension://test-extension-id',
          baseUrl: 'http://localhost:11434',
          downloadUrl: 'https://ollama.com/download',
          faqUrl:
            'https://docs.ollama.com/faq#how-do-i-configure-ollama-server',
          kind: 'forbidden',
          tagsUrl: 'http://localhost:11434/api/tags',
        },
      }),
    )

    portListener(streamPort)
    onPortMessage?.({
      history: [],
      prompt: 'test',
      type: 'run',
    })

    await vi.waitFor(() => {
      expect(streamPort.postMessage).toHaveBeenCalledWith({
        error: 'forbidden',
        ollamaError: {
          allowedOrigins: 'chrome-extension://test-extension-id',
          baseUrl: 'http://localhost:11434',
          downloadUrl: 'https://ollama.com/download',
          faqUrl:
            'https://docs.ollama.com/faq#how-do-i-configure-ollama-server',
          kind: 'forbidden',
          tagsUrl: 'http://localhost:11434/api/tags',
        },
        type: 'error',
      })
    })
  })
})
