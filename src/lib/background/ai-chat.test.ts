import { beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import { getAiChatToolDefinitions } from '@/constants/aiChatTools'

const mocked = vi.hoisted(() => ({
  createOllama: vi.fn(),
  generateText: vi.fn(),
  getUserSettings: vi.fn(),
  getUrlRecords: vi.fn(),
  getCustomProjects: vi.fn(),
  getParentCategories: vi.fn(),
}))

vi.mock('ai-sdk-ollama', () => ({
  createOllama: mocked.createOllama,
}))

vi.mock('ai', () => ({
  generateText: mocked.generateText,
  isStepCount: vi.fn((count: number) => count),
  tool: vi.fn((definition: unknown) => definition),
}))

vi.mock('@/lib/storage/settings', () => ({
  defaultSettings: {},
  getUserSettings: mocked.getUserSettings,
}))

vi.mock('@/lib/storage/urls', () => ({
  getUrlRecords: mocked.getUrlRecords,
}))

vi.mock('@/lib/storage/projects', () => ({
  getCustomProjects: mocked.getCustomProjects,
}))

vi.mock('@/lib/storage/categories', () => ({
  getParentCategories: mocked.getParentCategories,
}))

import {
  getAiChatUiLocale,
  getToolListSeparator,
  listLocalOllamaModels,
  runAiChatRequest,
} from './ai-chat'

type OllamaErrorLike = Error & {
  ollamaError?: {
    allowedOrigins?: string
    baseUrl: string
    downloadUrl: string
    faqUrl: string
    kind: 'forbidden' | 'notInstalledOrNotRunning'
    tagsUrl: string
  }
}

describe('listLocalOllamaModels', () => {
  beforeEach(() => {
    ;(
      globalThis as typeof globalThis & {
        chrome?: typeof chrome
      }
    ).chrome = {
      runtime: {
        id: 'test-extension-id',
      },
    } as unknown as typeof chrome
  })

  it('background locale helper は chrome がない環境では日本語に fallback する', () => {
    Reflect.deleteProperty(globalThis, 'chrome')

    expect(getAiChatUiLocale()).toBe('ja')
    expect(getToolListSeparator('en')).toBe(', ')
    expect(getToolListSeparator('ja')).toBe('、')
  })

  it('localhost の /api/tags を読んでモデル名を正規化する', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,

      json: async () =>
        JSON.parse(
          '{"models":[{"details":{"parameter_size":"8B"},"modified_at":"2026-03-01T00:00:00.000Z","name":"llama3.2"}]}',
        ),
    })

    const models = await listLocalOllamaModels(fetchMock)

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:11434/api/tags',
      expect.objectContaining({
        method: 'GET',
      }),
    )
    expect(models).toStrictEqual([
      {
        label: 'llama3.2 (8B)',
        modifiedAt: '2026-03-01T00:00:00.000Z',
        name: 'llama3.2',
      },
    ])
  })

  it('異常レスポンスは除外し、parameter_size が無ければ name をそのまま使う', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,

      json: async () => ({
        models: [
          null,
          { name: 'mistral' },
          {
            details: {},
            modified_at: 'x',
          },
        ],
      }),
    })

    const models = await listLocalOllamaModels(fetchMock)

    expect(models).toStrictEqual([
      {
        label: 'mistral',
        modifiedAt: undefined,
        name: 'mistral',
      },
    ])
  })

  it('response.ok=false なら例外を投げる', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    })

    await expect(listLocalOllamaModels(fetchMock)).rejects.toThrow(
      'Failed to fetch Ollama models',
    )
  })

  it('403 なら OLLAMA_ORIGINS の案内を含む例外を投げる', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
    })

    await expect(listLocalOllamaModels(fetchMock)).rejects.toThrow(
      'OLLAMA_ORIGINS',
    )
    await expect(listLocalOllamaModels(fetchMock)).rejects.toThrow(
      'chrome-extension://test-extension-id',
    )
    await expect(listLocalOllamaModels(fetchMock)).rejects.toThrow(
      'http://localhost:11434/api/tags',
    )
    await expect(listLocalOllamaModels(fetchMock)).rejects.toThrow(
      'Spotlight 検索で「ターミナル」と入力して開きます。',
    )
    await expect(listLocalOllamaModels(fetchMock)).rejects.toThrow(
      'launchctl setenv OLLAMA_ORIGINS "chrome-extension://test-extension-id"',
    )
    const error = (await listLocalOllamaModels(fetchMock).catch(
      (caughtError: unknown) => caughtError,
    )) as Error
    expect(error.message).not.toContain('ollama serve')
  })

  it('403 なら構造化された forbidden の Ollama エラーを持つ', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
    })

    const error = (await listLocalOllamaModels(fetchMock).catch(
      (caughtError: unknown) => caughtError,
    )) as OllamaErrorLike

    expect(error).toBeInstanceOf(Error)
    expect(error.ollamaError).toStrictEqual({
      allowedOrigins: 'chrome-extension://test-extension-id',
      baseUrl: 'http://localhost:11434',
      downloadUrl: 'https://ollama.com/download',
      faqUrl: 'https://docs.ollama.com/faq#how-do-i-configure-ollama-server',
      kind: 'forbidden',
      tagsUrl: 'http://localhost:11434/api/tags',
    })
  })

  it('拡張 root URL が取れるなら slash を除いた origin を優先する', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
    })

    ;(
      globalThis as typeof globalThis & {
        chrome?: typeof chrome
      }
    ).chrome = {
      runtime: {
        getURL: vi.fn(() => 'chrome-extension://strict-extension-id/'),
        id: 'fallback-extension-id',
      },
    } as unknown as typeof chrome

    const error = (await listLocalOllamaModels(fetchMock).catch(
      (caughtError: unknown) => caughtError,
    )) as OllamaErrorLike

    expect(error.ollamaError).toStrictEqual(
      expect.objectContaining({
        allowedOrigins: 'chrome-extension://strict-extension-id',
      }),
    )
  })

  it('拡張 root URL の host が空なら runtime.id に fallback する', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
    })

    ;(
      globalThis as typeof globalThis & {
        chrome?: typeof chrome
      }
    ).chrome = {
      runtime: {
        getURL: vi.fn(() => 'chrome-extension:///'),
        id: 'fallback-extension-id',
      },
    } as unknown as typeof chrome

    const error = (await listLocalOllamaModels(fetchMock).catch(
      (caughtError: unknown) => caughtError,
    )) as OllamaErrorLike

    expect(error.ollamaError).toStrictEqual(
      expect.objectContaining({
        allowedOrigins: 'chrome-extension://fallback-extension-id',
      }),
    )
  })

  it('拡張 ID が取れない 403 では wildcard origin の案内を返す', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
    })

    ;(
      globalThis as typeof globalThis & {
        chrome?: typeof chrome
      }
    ).chrome = {
      runtime: {},
    } as unknown as typeof chrome

    await expect(listLocalOllamaModels(fetchMock)).rejects.toThrow(
      'chrome-extension://*',
    )
  })

  it('models が配列でなければ空配列を返す', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,

      json: async () => ({
        models: 'invalid',
      }),
    })

    await expect(listLocalOllamaModels(fetchMock)).resolves.toStrictEqual([])
  })

  it('Failed to fetch なら接続先 URL と起動コマンド付きの案内を返す', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(listLocalOllamaModels(fetchMock)).rejects.toThrow(
      'http://localhost:11434',
    )
    await expect(listLocalOllamaModels(fetchMock)).rejects.toThrow(
      'http://localhost:11434/api/tags',
    )
    await expect(listLocalOllamaModels(fetchMock)).rejects.toThrow(
      'curl http://localhost:11434/api/tags',
    )
    await expect(listLocalOllamaModels(fetchMock)).rejects.toThrow(
      'Ollama.app を起動し直します。',
    )
  })

  it('Failed to fetch なら構造化された接続エラーを持つ', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValue(new TypeError('Failed to fetch'))

    const error = (await listLocalOllamaModels(fetchMock).catch(
      (caughtError: unknown) => caughtError,
    )) as OllamaErrorLike

    expect(error).toBeInstanceOf(Error)
    expect(error.ollamaError).toStrictEqual({
      allowedOrigins: 'chrome-extension://test-extension-id',
      baseUrl: 'http://localhost:11434',
      downloadUrl: 'https://ollama.com/download',
      faqUrl: 'https://docs.ollama.com/faq#how-do-i-configure-ollama-server',
      kind: 'notInstalledOrNotRunning',
      tagsUrl: 'http://localhost:11434/api/tags',
    })
  })

  it('文字列の Failed to fetch でも接続案内に変換する', async () => {
    const fetchMock = vi.fn().mockRejectedValue('Failed to fetch')

    await expect(listLocalOllamaModels(fetchMock)).rejects.toThrow(
      'curl http://localhost:11434/api/tags',
    )
  })

  it('接続エラーではない fetch 例外はそのまま再throwする', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('boom'))

    await expect(listLocalOllamaModels(fetchMock)).rejects.toThrow('boom')
  })
})

describe('runAiChatRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.createOllama.mockReturnValue((modelId: string) => ({
      modelId,
      provider: 'ollama',
    }))
    mocked.generateText.mockResolvedValue({
      steps: [
        {
          text: 'tool step',
        },
      ],
      text: '今月追加した URL は https://react.dev/learn です。',
      toolCalls: [
        {
          input: {
            page: 1,
            pageSize: 10,
            sortDirection: 'desc',
          },
          toolCallId: 'call-1',
          toolName: 'listSavedUrls',
        },
      ],
      toolResults: [
        {
          input: {
            page: 1,
            pageSize: 10,
            sortDirection: 'desc',
          },
          output: [
            {
              domain: 'react.dev',
              parentCategories: [],
              savedAt: new Date('2026-03-01T00:00:00.000Z').getTime(),
              savedInProjects: [],
              title: 'React Learn',
              url: 'https://react.dev/learn',
            },
          ],
          toolCallId: 'call-1',
          toolName: 'listSavedUrls',
        },
      ],
    })
    mocked.getUserSettings.mockResolvedValue({
      ollamaModel: 'llama3.2',
    })
    mocked.getUrlRecords.mockResolvedValue([
      {
        id: 'url-1',
        savedAt: new Date('2026-03-01T00:00:00.000Z').getTime(),
        title: 'React Learn',
        url: 'https://react.dev/learn',
      },
    ])
    mocked.getCustomProjects.mockResolvedValue([])
    mocked.getParentCategories.mockResolvedValue([])
    ;(
      globalThis as typeof globalThis & {
        chrome?: typeof chrome
      }
    ).chrome = {
      runtime: {
        id: 'test-extension-id',
      },
      storage: {
        local: {
          get: vi.fn(async (key: string) =>
            key === 'savedTabs'
              ? {
                  savedTabs: [
                    {
                      domain: 'react.dev',
                      id: 'group-1',
                      urlIds: ['url-1'],
                    },
                  ],
                }
              : {},
          ),
        },
      },
    } as unknown as typeof chrome
  })

  it('保存済みタブ文脈を組み立てて generateText を呼ぶ', async () => {
    const result = await runAiChatRequest({
      history: [
        {
          content: '最近の傾向は？',
          role: 'user',
        },
      ],
      prompt: '今月追加したタブを教えて',
    })

    expect(mocked.createOllama).toHaveBeenCalledWith({
      baseURL: 'http://localhost:11434',
    })
    expect(mocked.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            content: '最近の傾向は？',
            role: 'user',
          }),
          expect.objectContaining({
            content: '今月追加したタブを教えて',
            role: 'user',
          }),
        ]),
        model: {
          modelId: 'llama3.2',
          provider: 'ollama',
        },
        instructions: expect.stringContaining('保存済みタブ 1 件'),
        tools: expect.objectContaining({
          findUrlsByMonth: expect.any(Object),
          getCurrentDateTime: expect.any(Object),
          inferUserInterests: expect.any(Object),
          listSavedUrls: expect.any(Object),
          searchSavedUrls: expect.any(Object),
        }),
      }),
    )
    const generateArgs = mocked.generateText.mock.calls[0]?.[0] as {
      tools: Record<string, { description: string }>
    }

    for (const toolDefinition of getAiChatToolDefinitions('ja')) {
      expect(generateArgs.tools[toolDefinition.name]?.description).toBe(
        toolDefinition.description,
      )
    }
    expect(result.answer).toBe(
      '今月追加した URL は https://react.dev/learn です。',
    )
    expect(result.recordCount).toBe(1)
    expect(result.reasoning).toContain('使用ツール: 保存済みタブ一覧')
    expect(result.toolTraces).toStrictEqual([
      expect.objectContaining({
        input: {
          page: 1,
          pageSize: 10,
          sortDirection: 'desc',
        },
        output: [
          expect.objectContaining({
            url: 'https://react.dev/learn',
          }),
        ],
        state: 'output-available',
        title: '保存済みタブ一覧',
        toolCallId: 'call-1',
        toolName: 'listSavedUrls',
        type: 'dynamic-tool',
      }),
    ])
  })
  it('言語設定が en のとき AI SDK へ英語 description を渡し reasoning も英語タイトルになる', async () => {
    ;(
      globalThis as typeof globalThis & {
        chrome?: typeof chrome
      }
    ).chrome = {
      i18n: {
        getUILanguage: () => 'en-US',
      },
      runtime: {
        id: 'test-extension-id',
      },
      storage: {
        local: {
          get: vi.fn(async (key: string) =>
            key === 'savedTabs'
              ? {
                  savedTabs: [
                    {
                      domain: 'react.dev',
                      id: 'group-1',
                      urlIds: ['url-1'],
                    },
                  ],
                }
              : {},
          ),
        },
      },
    } as unknown as typeof chrome

    mocked.getUserSettings.mockResolvedValue({
      language: 'en',
      ollamaModel: 'llama3.2',
    })

    const result = await runAiChatRequest({
      history: [],
      prompt: 'What tabs did I add this month?',
    })

    const generateArgs = mocked.generateText.mock.calls[0]?.[0] as {
      tools: Record<string, { description: string }>
    }

    for (const toolDefinition of getAiChatToolDefinitions('en')) {
      expect(generateArgs.tools[toolDefinition.name]?.description).toBe(
        toolDefinition.description,
      )
    }
    expect(result.reasoning).toContain('List saved tabs')
    expect(result.toolTraces[0]?.title).toBe('List saved tabs')
  })

  it('active system prompt template を使い、placeholder に context を差し込む', async () => {
    mocked.getUserSettings.mockResolvedValue({
      activeAiSystemPromptId: 'prompt-2',
      aiSystemPrompts: [
        {
          createdAt: 1,
          id: 'prompt-1',
          name: 'Default',
          template: 'default template',
          updatedAt: 1,
        },
        {
          createdAt: 2,
          id: 'prompt-2',
          name: 'Custom',
          template: [
            '以下の前提を厳守してください。',
            '{{saved_url_context}}',
            '最後に簡潔に答えてください。',
          ].join('\n'),
          updatedAt: 2,
        },
      ],
      ollamaModel: 'llama3.2',
    })

    await runAiChatRequest({
      history: [],
      prompt: '今どんなタブがある？',
    })

    expect(mocked.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        instructions: expect.stringContaining('以下の前提を厳守してください。'),
      }),
    )
    expect(mocked.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        instructions: expect.stringContaining('保存済みタブ 1 件'),
      }),
    )
    expect(mocked.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        instructions: expect.stringContaining('最後に簡潔に答えてください。'),
      }),
    )
    expect(mocked.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        instructions: expect.not.stringContaining('{{saved_url_context}}'),
      }),
    )
  })

  it('assistant history はそのまま文字列 message として渡す', async () => {
    await runAiChatRequest({
      history: [
        {
          content: '前回の返答です',
          role: 'assistant',
        },
      ],
      prompt: '続けて教えて',
    })

    expect(mocked.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          {
            content: '前回の返答です',
            role: 'assistant',
          },
        ]),
      }),
    )
  })

  it('getCurrentDateTime tool で現在時刻を取得できる', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-07T12:34:56.000Z'))

    try {
      await runAiChatRequest({
        history: [],
        prompt: '今何時？',
      })

      const generateArgs = mocked.generateText.mock.calls.at(-1)?.[0] as {
        tools: {
          getCurrentDateTime: { execute: () => Promise<unknown> }
        }
      }

      await expect(
        generateArgs.tools.getCurrentDateTime.execute(),
      ).resolves.toStrictEqual(
        expect.objectContaining({
          iso8601: '2026-03-07T12:34:56.000Z',
          localDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
          localDateTime: expect.stringMatching(
            /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
          ),
          localTime: expect.stringMatching(/^\d{2}:\d{2}:\d{2}$/),
          timezone: expect.any(String),
          unixMs: new Date('2026-03-07T12:34:56.000Z').getTime(),
        }),
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('text 添付は text part に、image 添付は file part にして user message へ渡す', async () => {
    await runAiChatRequest({
      attachments: [
        {
          content: '添付されたテキスト本文',
          filename: 'memo.txt',
          kind: 'text',
          mediaType: 'text/plain',
        },
        {
          content: 'data:image/png;base64,AAAA',
          filename: 'image.png',
          kind: 'image',
          mediaType: 'image/png',
        },
      ],
      history: [
        {
          attachments: [
            {
              content: '以前の添付',
              filename: 'before.md',
              kind: 'text',
              mediaType: 'text/markdown',
            },
          ],
          content: '前の質問です',
          role: 'user',
        },
      ],
      prompt: 'この添付を踏まえて答えて',
    })

    expect(mocked.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          {
            content: [
              {
                text: expect.stringContaining('前の質問です'),
                type: 'text',
              },
            ],
            role: 'user',
          },
          {
            content: [
              {
                text: expect.stringContaining('この添付を踏まえて答えて'),
                type: 'text',
              },
              {
                data: 'data:image/png;base64,AAAA',
                mediaType: 'image/png',
                type: 'file',
              },
            ],
            role: 'user',
          },
        ],
      }),
    )

    const messages = mocked.generateText.mock.calls.at(-1)?.[0]?.messages as
      | {
          content: (
            | { type: 'text'; text: string }
            | { type: 'file'; data: string; mediaType: string }
          )[]
          role: string
        }[]
      | undefined

    expect(messages?.[0]?.content[0]).toStrictEqual(
      expect.objectContaining({
        text: expect.stringContaining('before.md'),
        type: 'text',
      }),
    )
    expect(messages?.[1]?.content[0]).toStrictEqual(
      expect.objectContaining({
        text: expect.stringContaining('memo.txt'),
        type: 'text',
      }),
    )
  })

  it('onStepUpdate があれば step ごとの reasoning と tool trace を返す', async () => {
    const onStepUpdate = vi.fn()
    mocked.generateText.mockImplementationOnce(
      async (options: {
        onStepEnd?: (result: {
          toolCalls?: {
            input: {
              page: number
              pageSize: number
              sortDirection: 'asc' | 'desc'
            }
            toolCallId: string
            toolName: string
          }[]
          toolResults?: {
            input: {
              page: number
              pageSize: number
              sortDirection: 'asc' | 'desc'
            }
            output: {
              url: string
            }[]
            toolCallId: string
            toolName: string
          }[]
        }) => void
      }) => {
        options.onStepEnd?.({
          toolCalls: [
            {
              input: {
                page: 1,
                pageSize: 10,
                sortDirection: 'desc',
              },
              toolCallId: 'call-1',
              toolName: 'listSavedUrls',
            },
          ],
          toolResults: [
            {
              input: {
                page: 1,
                pageSize: 10,
                sortDirection: 'desc',
              },
              output: [
                {
                  url: 'https://react.dev/learn',
                },
              ],
              toolCallId: 'call-1',
              toolName: 'listSavedUrls',
            },
          ],
        })

        return {
          text: '今月追加した URL は https://react.dev/learn です。',
          toolCalls: [
            {
              input: {
                page: 1,
                pageSize: 10,
                sortDirection: 'desc',
              },
              toolCallId: 'call-1',
              toolName: 'listSavedUrls',
            },
          ],
          toolResults: [
            {
              input: {
                page: 1,
                pageSize: 10,
                sortDirection: 'desc',
              },
              output: [
                {
                  url: 'https://react.dev/learn',
                },
              ],
              toolCallId: 'call-1',
              toolName: 'listSavedUrls',
            },
          ],
        }
      },
    )

    await runAiChatRequest(
      {
        history: [],
        prompt: 'どんな URL がある？',
      },
      {
        onStepUpdate,
      },
    )

    expect(onStepUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        reasoning: expect.stringContaining('使用ツール: 保存済みタブ一覧'),
        toolTraces: [
          expect.objectContaining({
            title: '保存済みタブ一覧',
            toolCallId: 'call-1',
          }),
        ],
      }),
    )
  })

  it('request の abort signal を generateText へ渡す', async () => {
    const controller = new AbortController()

    await runAiChatRequest(
      {
        history: [],
        prompt: 'どんな URL がある？',
      },
      {
        signal: controller.signal,
      },
    )

    expect(mocked.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        abortSignal: controller.signal,
      }),
    )
  })

  it('onStepEnd に tool 情報が無くても空 trace で更新する', async () => {
    const onStepUpdate = vi.fn()
    mocked.generateText.mockImplementationOnce(
      async (options: {
        onStepEnd?: (result: Record<string, unknown>) => void
      }) => {
        options.onStepEnd?.({})

        return {
          text: '保存済みタブを要約しました。',
          toolCalls: [],
          toolResults: [],
        }
      },
    )

    await runAiChatRequest(
      {
        history: [],
        prompt: 'どんな URL がある？',
      },
      {
        onStepUpdate,
      },
    )

    expect(onStepUpdate).toHaveBeenCalledWith({
      reasoning: expect.stringContaining('使用ツール: なし'),
      toolTraces: [],
    })
  })

  it('Ollama 設定が未完了なら実行前に失敗する', async () => {
    mocked.getUserSettings.mockResolvedValue({
      ollamaModel: '',
    })

    await expect(
      runAiChatRequest({
        history: [],
        prompt: 'test',
      }),
    ).rejects.toThrow('Ollama model is not configured')
    expect(mocked.generateText).not.toHaveBeenCalled()
  })

  it('provider 状態に関係なくモデルがあれば実行できる', async () => {
    mocked.getUserSettings.mockResolvedValue({
      ollamaModel: 'llama3.2',
    })

    await expect(
      runAiChatRequest({
        history: [],
        prompt: 'test',
      }),
    ).resolves.toStrictEqual(
      expect.objectContaining({
        answer: '今月追加した URL は https://react.dev/learn です。',
      }),
    )
  })

  it('tool を使わない回答では context 参照の reasoning を返す', async () => {
    mocked.generateText.mockResolvedValue({
      text: '保存済みタブの傾向をまとめました。',
      toolCalls: [],
      toolResults: [],
    })

    const result = await runAiChatRequest({
      history: [],
      prompt: '私が好きそうなコンテンツは？',
    })

    expect(result.reasoning).toContain('質問の解釈: 保存傾向の推定')
    expect(result.reasoning).toContain(
      '回答方針: 保存済みタブの要約コンテキストを直接参照して回答しました。',
    )
    expect(result.reasoning).toContain('使用ツール: なし')
    expect(result.toolTraces).toStrictEqual([])
  })

  it('チャート要求の質問では tool call がなくても interest chart を補助生成する', async () => {
    mocked.generateText.mockResolvedValue({
      text: '最近は Frontend 系をよく保存しています。',
      toolCalls: [],
      toolResults: [],
    })
    mocked.getParentCategories.mockResolvedValue([
      {
        domains: ['group-1'],
        domainNames: ['react.dev'],
        id: 'parent-1',
        name: 'Frontend',
      },
    ])

    const result = await runAiChatRequest({
      history: [],
      prompt: '最近よく保存しているジャンルを円グラフで教えて',
    })

    expect(result.toolTraces).toStrictEqual([])
    expect(result.charts).toStrictEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'よく保存しているジャンル',
          type: 'pie',
        }),
      ]),
    )
  })

  it('配列でない tool output は取得済みとみなし、未知の tool 名はそのまま表示する', async () => {
    mocked.generateText.mockResolvedValue({
      text: '検索結果をまとめました。',
      toolCalls: [
        {
          input: {
            query: 'react',
          },
          toolCallId: 'call-object',
          toolName: 'customLookup',
        },
      ],
      toolResults: [
        {
          input: {
            query: 'react',
          },
          output: {
            summary: 'React docs matched',
          },
          toolCallId: 'call-object',
          toolName: 'customLookup',
        },
      ],
    })

    const result = await runAiChatRequest({
      history: [],
      prompt: 'React っぽい URL を検索して',
    })

    expect(result.reasoning).toContain('質問の解釈: 保存済みタブの検索と要約')
    expect(result.reasoning).toContain('customLookup')
    expect(result.reasoning).toContain('customLookup: 結果を取得しました。')
    expect(result.toolTraces).toStrictEqual([
      expect.objectContaining({
        output: {
          summary: 'React docs matched',
        },
        state: 'output-available',
        title: 'customLookup',
      }),
    ])
  })

  it('paginated tool output では items 件数と totalItems を reasoning に反映する', async () => {
    mocked.generateText.mockResolvedValue({
      text: '保存済みタブを確認しました。',
      toolCalls: [
        {
          input: {
            page: 2,
            pageSize: 1,
            sortDirection: 'desc',
          },
          toolCallId: 'call-page-2',
          toolName: 'listSavedUrls',
        },
      ],
      toolResults: [
        {
          input: {
            page: 2,
            pageSize: 1,
            sortDirection: 'desc',
          },
          output: {
            hasNextPage: true,
            hasPreviousPage: true,
            items: [
              {
                url: 'https://react.dev/reference/react',
              },
            ],
            page: 2,
            pageSize: 1,
            sortDirection: 'desc',
            totalItems: 3,
            totalPages: 3,
          },
          toolCallId: 'call-page-2',
          toolName: 'listSavedUrls',
        },
      ],
    })

    const result = await runAiChatRequest({
      history: [],
      prompt: '保存済みタブを1件ずつ見せて',
    })

    expect(result.reasoning).toContain('保存済みタブ一覧: 1 件を取得しました。')
    expect(result.reasoning).toContain('総件数は 3 件です。')
    expect(result.toolTraces).toStrictEqual([
      expect.objectContaining({
        output: {
          hasNextPage: true,
          hasPreviousPage: true,
          items: [
            {
              url: 'https://react.dev/reference/react',
            },
          ],
          page: 2,
          pageSize: 1,
          sortDirection: 'desc',
          totalItems: 3,
          totalPages: 3,
        },
        state: 'output-available',
        title: '保存済みタブ一覧',
      }),
    ])
  })

  it('tool output の chartSpecs は有効なチャート定義だけを抽出する', async () => {
    mocked.generateText.mockResolvedValue({
      text: 'チャートを作成しました。',
      toolCalls: [
        {
          input: {},
          toolCallId: 'chart-call',
          toolName: 'generateSavedTabsAnalytics',
        },
      ],
      toolResults: [
        {
          input: {},
          output: {
            chartSpecs: [
              null,
              {
                title: 'broken chart',
              },
              {
                data: [{ count: 1, label: 'React' }],
                series: [
                  {
                    colorToken: 'chart-1',
                    dataKey: 'count',
                    label: 'Count',
                  },
                ],
                title: 'Valid chart',
                type: 'bar',
                xKey: 'label',
              },
            ],
          },
          toolCallId: 'chart-call',
          toolName: 'generateSavedTabsAnalytics',
        },
      ],
    })

    const result = await runAiChatRequest({
      history: [],
      prompt: '保存タブをグラフにして',
    })

    expect(result.charts).toStrictEqual([
      {
        data: [{ count: 1, label: 'React' }],
        series: [{ colorToken: 'chart-1', dataKey: 'count', label: 'Count' }],
        title: 'Valid chart',
        type: 'bar',
        xKey: 'label',
      },
    ])
  })

  it('chartSpecs が配列でない tool output はチャートなしとして扱う', async () => {
    mocked.generateText.mockResolvedValue({
      text: 'チャートはありません。',
      toolCalls: [],
      toolResults: [
        {
          input: {},
          output: {
            chartSpecs: 'invalid',
          },
          toolCallId: 'invalid-chart-call',
          toolName: 'generateSavedTabsAnalytics',
        },
      ],
    })

    const result = await runAiChatRequest({
      history: [],
      prompt: '保存タブをグラフにして',
    })

    expect(result.charts).toStrictEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'よく保存しているドメイン',
        }),
      ]),
    )
  })

  it('tool result が無い場合は input-available として reasoning に反映する', async () => {
    mocked.generateText.mockResolvedValue({
      text: '確認中です。',
      toolCalls: [
        {
          input: {
            page: 1,
            pageSize: 3,
            sortDirection: 'desc',
          },
          toolCallId: 'call-pending',
          toolName: 'listSavedUrls',
        },
      ],
      toolResults: [],
    })

    const result = await runAiChatRequest({
      history: [],
      prompt: 'どんな URL がある？',
    })

    expect(result.reasoning).toContain('質問の解釈: 保存済みタブの一覧確認')
    expect(result.reasoning).toContain(
      '保存済みタブ一覧: 呼び出し内容を確認しました。',
    )
    expect(result.toolTraces).toStrictEqual([
      expect.objectContaining({
        output: undefined,
        state: 'input-available',
        title: '保存済みタブ一覧',
      }),
    ])
  })

  it('top-level ではなく steps にある tool call/result も trace に含める', async () => {
    mocked.generateText.mockResolvedValue({
      steps: [
        {
          toolCalls: [
            {
              input: {
                page: 1,
                pageSize: 5,
                sortDirection: 'desc',
              },
              toolCallId: 'call-step-1',
              toolName: 'listSavedUrls',
            },
          ],
          toolResults: [
            {
              input: {
                page: 1,
                pageSize: 5,
                sortDirection: 'desc',
              },
              output: [
                {
                  url: 'https://react.dev/learn',
                },
              ],
              toolCallId: 'call-step-1',
              toolName: 'listSavedUrls',
            },
          ],
        },
      ],
      text: '保存済みタブを確認しました。',
      toolCalls: [],
      toolResults: [],
    })

    const result = await runAiChatRequest({
      history: [],
      prompt: 'どんな URL がある？',
    })

    expect(result.reasoning).toContain('使用ツール: 保存済みタブ一覧')
    expect(result.toolTraces).toStrictEqual([
      expect.objectContaining({
        output: [
          {
            url: 'https://react.dev/learn',
          },
        ],
        state: 'output-available',
        title: '保存済みタブ一覧',
        toolCallId: 'call-step-1',
        toolName: 'listSavedUrls',
      }),
    ])
  })

  it('steps と top-level に同じ toolCallId があっても trace を重複させない', async () => {
    mocked.generateText.mockResolvedValue({
      steps: [
        {
          toolCalls: [
            {
              input: {
                page: 1,
                pageSize: 5,
                sortDirection: 'desc',
              },
              toolCallId: 'call-duplicate',
              toolName: 'listSavedUrls',
            },
          ],
          toolResults: [
            {
              input: {
                page: 1,
                pageSize: 5,
                sortDirection: 'desc',
              },
              output: [
                {
                  url: 'https://react.dev/learn',
                },
              ],
              toolCallId: 'call-duplicate',
              toolName: 'listSavedUrls',
            },
          ],
        },
      ],
      text: '保存済みタブを確認しました。',
      toolCalls: [
        {
          input: {
            page: 1,
            pageSize: 5,
            sortDirection: 'desc',
          },
          toolCallId: 'call-duplicate',
          toolName: 'listSavedUrls',
        },
      ],
      toolResults: [
        {
          input: {
            page: 1,
            pageSize: 5,
            sortDirection: 'desc',
          },
          output: [
            {
              url: 'https://react.dev/learn',
            },
          ],
          toolCallId: 'call-duplicate',
          toolName: 'listSavedUrls',
        },
      ],
    })

    const result = await runAiChatRequest({
      history: [],
      prompt: 'どんな URL がある？',
    })

    expect(result.toolTraces).toHaveLength(1)
    expect(result.toolTraces[0]).toStrictEqual(
      expect.objectContaining({
        toolCallId: 'call-duplicate',
      }),
    )
  })

  it('toolCalls と toolResults が未定義でも reasoning を組み立てる', async () => {
    mocked.generateText.mockResolvedValue({
      text: '最近保存した URL を要約しました。',
    })

    const result = await runAiChatRequest({
      history: [],
      prompt: 'どんな URL がある？',
    })

    expect(result.reasoning).toContain('質問の解釈: 保存済みタブの一覧確認')
    expect(result.reasoning).toContain('使用ツール: なし')
    expect(result.toolTraces).toStrictEqual([])
  })

  it('savedTabs が配列でなくても空配列として扱い、tools execute を利用できる', async () => {
    ;(
      globalThis as typeof globalThis & {
        chrome?: typeof chrome
      }
    ).chrome = {
      runtime: {
        id: 'test-extension-id',
      },
      storage: {
        local: {
          get: vi.fn(async () => ({
            savedTabs: 'invalid',
          })),
        },
      },
    } as unknown as typeof chrome

    await runAiChatRequest({
      history: [],
      prompt: 'test',
    })

    const generateArgs = mocked.generateText.mock.calls[0]?.[0] as {
      instructions: string
      tools: {
        findUrlsByMonth: { execute: (input: unknown) => Promise<unknown> }
        inferUserInterests: { execute: () => Promise<unknown> }
        listSavedUrls: { execute: (input: unknown) => Promise<unknown> }
        searchSavedUrls: { execute: (input: unknown) => Promise<unknown> }
      }
    }

    expect(generateArgs.instructions).toContain('https://react.dev/learn')

    await expect(
      generateArgs.tools.findUrlsByMonth.execute({
        year: 2026,
        month: 3,
        page: 1,
        pageSize: 1,
        sortDirection: 'desc',
      }),
    ).resolves.toStrictEqual({
      hasNextPage: false,
      hasPreviousPage: false,
      items: [
        {
          url: 'https://react.dev/learn',
          title: 'React Learn',
          domain: 'react.dev',
          savedAt: new Date('2026-03-01T00:00:00.000Z').getTime(),
          savedInProjects: [],
          parentCategories: [],
        },
      ],
      page: 1,
      pageSize: 1,
      sortDirection: 'desc',
      totalItems: 1,
      totalPages: 1,
    })

    await expect(
      generateArgs.tools.searchSavedUrls.execute({
        query: 'react',
        page: 1,
        pageSize: 1,
        sortDirection: 'desc',
      }),
    ).resolves.toStrictEqual({
      hasNextPage: false,
      hasPreviousPage: false,
      items: [
        {
          url: 'https://react.dev/learn',
          title: 'React Learn',
          domain: 'react.dev',
          savedAt: new Date('2026-03-01T00:00:00.000Z').getTime(),
          savedInProjects: [],
          parentCategories: [],
        },
      ],
      page: 1,
      pageSize: 1,
      sortDirection: 'desc',
      totalItems: 1,
      totalPages: 1,
    })

    await expect(
      generateArgs.tools.listSavedUrls.execute({
        page: 1,
        pageSize: 1,
        sortDirection: 'desc',
      }),
    ).resolves.toStrictEqual({
      hasNextPage: false,
      hasPreviousPage: false,
      items: [
        {
          url: 'https://react.dev/learn',
          title: 'React Learn',
          domain: 'react.dev',
          savedAt: new Date('2026-03-01T00:00:00.000Z').getTime(),
          savedInProjects: [],
          parentCategories: [],
        },
      ],
      page: 1,
      pageSize: 1,
      sortDirection: 'desc',
      totalItems: 1,
      totalPages: 1,
    })

    await expect(
      generateArgs.tools.inferUserInterests.execute(),
    ).resolves.toStrictEqual(
      expect.objectContaining({
        evidence: expect.objectContaining({
          topDomains: expect.any(Array),
        }),
      }),
    )
  })

  it('Ollama から 403 が返ったら OLLAMA_ORIGINS の案内に変換する', async () => {
    mocked.generateText.mockRejectedValue(new Error('Error 403: Forbidden'))

    await expect(
      runAiChatRequest({
        history: [],
        prompt: 'test',
      }),
    ).rejects.toThrow('OLLAMA_ORIGINS')
    await expect(
      runAiChatRequest({
        history: [],
        prompt: 'test',
      }),
    ).rejects.toThrow('chrome-extension://test-extension-id')
  })

  it('Ollama から 403 が返ったら構造化された forbidden の Ollama エラーに変換する', async () => {
    mocked.generateText.mockRejectedValue(new Error('Error 403: Forbidden'))

    const error = (await runAiChatRequest({
      history: [],
      prompt: 'test',
    }).catch((caughtError: unknown) => caughtError)) as OllamaErrorLike

    expect(error).toBeInstanceOf(Error)
    expect(error.ollamaError).toStrictEqual({
      allowedOrigins: 'chrome-extension://test-extension-id',
      baseUrl: 'http://localhost:11434',
      downloadUrl: 'https://ollama.com/download',
      faqUrl: 'https://docs.ollama.com/faq#how-do-i-configure-ollama-server',
      kind: 'forbidden',
      tagsUrl: 'http://localhost:11434/api/tags',
    })
  })

  it('403 以外の generateText エラーはそのまま再throwする', async () => {
    mocked.generateText.mockRejectedValue(new Error('model unavailable'))

    await expect(
      runAiChatRequest({
        history: [],
        prompt: 'test',
      }),
    ).rejects.toThrow('model unavailable')
  })

  it('文字列の 403 エラーでも OLLAMA_ORIGINS の案内に変換する', async () => {
    mocked.generateText.mockRejectedValue('Error 403: Forbidden')

    await expect(
      runAiChatRequest({
        history: [],
        prompt: 'test',
      }),
    ).rejects.toThrow('OLLAMA_ORIGINS')
  })

  it('Failed to fetch でも接続 URL とコマンド付きの案内に変換する', async () => {
    mocked.generateText.mockRejectedValue(new Error('Failed to fetch'))

    await expect(
      runAiChatRequest({
        history: [],
        prompt: 'test',
      }),
    ).rejects.toThrow('http://localhost:11434')
    await expect(
      runAiChatRequest({
        history: [],
        prompt: 'test',
      }),
    ).rejects.toThrow('curl http://localhost:11434/api/tags')
    await expect(
      runAiChatRequest({
        history: [],
        prompt: 'test',
      }),
    ).rejects.toThrow('Spotlight 検索で「ターミナル」と入力して開きます。')
    await expect(
      runAiChatRequest({
        history: [],
        prompt: 'test',
      }),
    ).rejects.toThrow(
      'launchctl setenv OLLAMA_ORIGINS "chrome-extension://test-extension-id"',
    )
    const error = (await runAiChatRequest({
      history: [],
      prompt: 'test',
    }).catch((caughtError: unknown) => caughtError)) as Error
    expect(error.message).not.toContain('ollama serve')
  })

  it('Failed to fetch でも構造化された接続エラーに変換する', async () => {
    mocked.generateText.mockRejectedValue(new Error('Failed to fetch'))

    const error = (await runAiChatRequest({
      history: [],
      prompt: 'test',
    }).catch((caughtError: unknown) => caughtError)) as OllamaErrorLike

    expect(error).toBeInstanceOf(Error)
    expect(error.ollamaError).toStrictEqual({
      allowedOrigins: 'chrome-extension://test-extension-id',
      baseUrl: 'http://localhost:11434',
      downloadUrl: 'https://ollama.com/download',
      faqUrl: 'https://docs.ollama.com/faq#how-do-i-configure-ollama-server',
      kind: 'notInstalledOrNotRunning',
      tagsUrl: 'http://localhost:11434/api/tags',
    })
  })
})
