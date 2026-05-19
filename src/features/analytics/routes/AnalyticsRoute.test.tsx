// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { Children, isValidElement } from 'react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AiSavedUrlRecord } from '@/features/ai-chat/types'
import type { SavedAnalyticsView } from '@/lib/storage/analytics'
import { defaultSettings } from '@/lib/storage/settings'

import { AnalyticsRoute } from './AnalyticsRoute'

const analyticsRouteMocks = vi.hoisted(() => ({
  deleteViewMock: vi.fn(),
  language: 'en' as 'en' | 'ja',
  loadRecordsMock: vi.fn<() => Promise<AiSavedUrlRecord[]>>(),
  loadSettingsMock: vi.fn(),
  loadViewsMock: vi.fn<() => Promise<SavedAnalyticsView[]>>(),
  saveViewsMock: vi.fn(),
  sendMessageMock: vi.fn(),
  storageGetMock: vi.fn(),
  storageSetMock: vi.fn(),
  updateMessagesMock: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}))

vi.mock('@/components/ui/sonner', () => ({
  Toaster: () => <div data-testid='analytics-toaster' />,
}))

vi.mock('@/features/i18n/context/I18nProvider', async () => {
  const { getMessage } = await vi.importActual<
    typeof import('@/features/i18n/lib/language')
  >('@/features/i18n/lib/language')

  return {
    useI18n: () => ({
      language: analyticsRouteMocks.language,
      t: (key: string, fallback?: string, values?: Record<string, string>) =>
        getMessage(analyticsRouteMocks.language, key, fallback, values),
    }),
  }
})

vi.mock('@/features/analytics/lib/loadAnalyticsRecords', () => ({
  loadAnalyticsRecords: analyticsRouteMocks.loadRecordsMock,
}))

vi.mock('@/lib/storage/settings', async () => {
  const actual = await vi.importActual<typeof import('@/lib/storage/settings')>(
    '@/lib/storage/settings',
  )

  return {
    ...actual,
    getUserSettings: analyticsRouteMocks.loadSettingsMock,
  }
})

vi.mock('@/components/ui/select', () => {
  const SelectTrigger = ({ children }: { children?: ReactNode }) => (
    <>{children}</>
  )
  const SelectValue = ({
    children,
    placeholder,
  }: {
    children?: ReactNode
    placeholder?: string
  }) => <>{children ?? placeholder}</>
  const SelectContent = ({ children }: { children?: ReactNode }) => (
    <>{children}</>
  )
  const SelectItem = ({ children }: { children?: ReactNode }) => <>{children}</>

  const Select = ({
    children,
    onValueChange,
    value,
  }: {
    children?: ReactNode
    onValueChange?: (value: string) => void
    value?: string
  }) => {
    const [triggerNode, contentNode] =
      Children.toArray(children).filter(isValidElement)
    const triggerProps = isValidElement(triggerNode)
      ? (triggerNode.props as Record<string, unknown>)
      : {}
    const contentChildren = isValidElement<{ children?: ReactNode }>(
      contentNode,
    )
      ? contentNode.props.children
      : undefined
    const items = contentChildren
      ? Children.toArray(contentChildren).reduce<
          Array<{ children?: ReactNode; value: string }>
        >((values, item) => {
          if (!isValidElement(item)) {
            return values
          }
          const props = item.props as {
            children?: ReactNode
            value: string
          }

          values.push({
            children: props.children,
            value: props.value,
          })
          return values
        }, [])
      : []

    return (
      <select
        aria-label={triggerProps['aria-label'] as string | undefined}
        className={triggerProps.className as string | undefined}
        id={triggerProps.id as string | undefined}
        onChange={(event) => onValueChange?.(event.target.value)}
        value={value}
      >
        {items.map((item) => (
          <option key={item.value} value={item.value}>
            {item.children}
          </option>
        ))}
      </select>
    )
  }

  return {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  }
})

vi.mock('@/features/ai-chat/components/AiChartRenderer', () => ({
  AiChartRenderer: ({
    charts,
    onChartPointClick,
  }: {
    charts: Array<{ data?: Record<string, unknown>[]; title: string }>
    onChartPointClick?: (point: {
      label: string
      seriesKey?: string
      spec: { title: string }
      value?: number
    }) => void
  }) => (
    <div>
      {charts.map((chart) => (
        <div key={chart.title}>
          <div>{chart.title}</div>
          <div>{JSON.stringify(chart.data ?? [])}</div>
        </div>
      ))}
      <button
        onClick={() => {
          onChartPointClick?.({
            label: 'docs.example.com',
            seriesKey: 'count',
            spec: charts[0] ?? { title: '' },
            value: 1,
          })
        }}
        type='button'
      >
        emit-chart-click
      </button>
      <button
        onClick={() => {
          onChartPointClick?.({
            label: '',
            seriesKey: 'count',
            spec: charts[0] ?? { title: '' },
            value: 0,
          })
        }}
        type='button'
      >
        emit-empty-chart-click
      </button>
      <button
        onClick={() => {
          onChartPointClick?.({
            label: 'Uncategorized',
            seriesKey: 'count',
            spec: charts[0] ?? { title: '' },
            value: 1,
          })
        }}
        type='button'
      >
        emit-uncategorized-click
      </button>
      <button
        onClick={() => {
          onChartPointClick?.({
            label: 'Inbox',
            seriesKey: 'count',
            spec: charts[0] ?? { title: '' },
            value: 1,
          })
        }}
        type='button'
      >
        emit-inbox-click
      </button>
      <button
        onClick={() => {
          onChartPointClick?.({
            label: 'Catchup',
            seriesKey: 'count',
            spec: charts[0] ?? { title: '' },
            value: 1,
          })
        }}
        type='button'
      >
        emit-catchup-click
      </button>
      <button
        onClick={() => {
          onChartPointClick?.({
            label: '2026-03-13',
            seriesKey: 'count',
            spec: charts[0] ?? { title: '' },
            value: 1,
          })
        }}
        type='button'
      >
        emit-time-click
      </button>
      <button
        onClick={() => {
          onChartPointClick?.({
            label: 'news.example.net',
            seriesKey: 'domain',
            spec: charts[0] ?? { title: '' },
            value: 1,
          })
        }}
        type='button'
      >
        emit-domain-series-news-click
      </button>
      <button
        onClick={() => {
          onChartPointClick?.({
            label: 'news.example.net',
            seriesKey: 'custom',
            spec: charts[0] ?? { title: '' },
            value: 1,
          })
        }}
        type='button'
      >
        emit-custom-series-news-click
      </button>
      <button
        onClick={() => {
          onChartPointClick?.({
            label: 'news.example.net',
            seriesKey: 'other',
            spec: charts[0] ?? { title: '' },
            value: 1,
          })
        }}
        type='button'
      >
        emit-other-series-news-click
      </button>
    </div>
  ),
}))

vi.mock('@/features/ai-chat/components/SavedTabsChatWidget', () => ({
  SavedTabsChatWidget: ({
    historyVariant,
    onMessagesChange,
    onOpenChange,
    title,
  }: {
    historyVariant?: string
    onMessagesChange?: (messages: unknown[]) => void
    onOpenChange?: (isOpen: boolean) => void
    title?: string
  }) => (
    <div>
      <div>{`history-variant:${historyVariant ?? 'none'}`}</div>
      <div>{`active-title:${title ?? ''}`}</div>
      <button onClick={() => onOpenChange?.(true)} type='button'>
        open-sidebar
      </button>
      <button onClick={() => onOpenChange?.(false)} type='button'>
        close-sidebar
      </button>
      <button
        onClick={() =>
          onMessagesChange?.([
            {
              charts: [
                {
                  data: [{ count: 2, label: 'AI Domain' }],
                  series: [
                    {
                      colorToken: 'chart-1',
                      dataKey: 'count',
                      label: 'Saved count',
                    },
                  ],
                  title: 'AI-generated chart',
                  type: 'bar',
                  xKey: 'label',
                },
              ],
              content: 'AI result',
              id: 'assistant-1',
              role: 'assistant',
              toolTraces: [
                {
                  input: {},
                  output: {
                    query: {
                      chartType: 'bar',
                      compareBy: 'none',
                      filters: {
                        excludedDomains: [],
                        excludedParentCategories: [],
                        excludedProjectCategories: [],
                        excludedProjects: [],
                        excludedSubCategories: [],
                        includedDomains: [],
                        includedParentCategories: [],
                        includedProjectCategories: [],
                        includedProjects: [],
                        includedSubCategories: [],
                      },
                      groupBy: 'domain',
                      limit: 8,
                      mode: 'both',
                      normalize: false,
                      sort: 'value-desc',
                      stacked: false,
                      timeBucket: 'day',
                      timeRange: '30d',
                    },
                  },
                  state: 'output-available',
                  title: 'Saved analytics',
                  toolCallId: 'tool-1',
                  toolName: 'generateSavedTabsAnalytics',
                  type: 'dynamic-tool',
                },
              ],
            },
          ])
        }
        type='button'
      >
        emit-ai-chart
      </button>
      <button
        onClick={() =>
          onMessagesChange?.([
            {
              charts: [
                {
                  data: [{ count: 1, label: 'AI Only' }],
                  series: [
                    {
                      colorToken: 'chart-1',
                      dataKey: 'count',
                      label: 'Saved count',
                    },
                  ],
                  title: 'AI chart without query',
                  type: 'bar',
                  xKey: 'label',
                },
              ],
              content: 'AI result without query',
              id: 'assistant-2',
              role: 'assistant',
            },
          ])
        }
        type='button'
      >
        emit-chart-only
      </button>
      <button onClick={() => onMessagesChange?.([])} type='button'>
        emit-empty-messages
      </button>
      <button
        onClick={() =>
          onMessagesChange?.([
            {
              charts: [],
              content: 'user message',
              id: 'user-1',
              role: 'user',
            },
          ])
        }
        type='button'
      >
        emit-user-only
      </button>
      <button
        onClick={() =>
          onMessagesChange?.([
            {
              charts: [
                {
                  data: [{ count: 1, label: 'Invalid query' }],
                  series: [
                    {
                      colorToken: 'chart-1',
                      dataKey: 'count',
                      label: 'Saved count',
                    },
                  ],
                  title: 'Invalid query chart',
                  type: 'bar',
                  xKey: 'label',
                },
              ],
              content: 'AI result with invalid query',
              id: 'assistant-invalid',
              role: 'assistant',
              toolTraces: [
                {
                  input: {},
                  output: {
                    query: {
                      groupBy: 'domain',
                    },
                  },
                  state: 'output-available',
                  title: 'Saved analytics',
                  toolCallId: 'tool-invalid',
                  toolName: 'generateSavedTabsAnalytics',
                  type: 'dynamic-tool',
                },
                {
                  input: {},
                  output: null,
                  state: 'output-available',
                  title: 'Other tool',
                  toolCallId: 'tool-other',
                  toolName: 'otherTool',
                  type: 'dynamic-tool',
                },
                {
                  input: {},
                  output: {
                    query: null,
                  },
                  state: 'output-available',
                  title: 'Saved analytics with null query',
                  toolCallId: 'tool-null-query',
                  toolName: 'generateSavedTabsAnalytics',
                  type: 'dynamic-tool',
                },
                {
                  input: {},
                  output: null,
                  state: 'output-available',
                  title: 'Saved analytics without output',
                  toolCallId: 'tool-null-output',
                  toolName: 'generateSavedTabsAnalytics',
                  type: 'dynamic-tool',
                },
              ],
            },
          ])
        }
        type='button'
      >
        emit-invalid-query-chart
      </button>
    </div>
  ),
}))

vi.mock('@/features/ai-chat/hooks/useSharedAiChatHistory', () => ({
  useSharedAiChatHistory: () => ({
    activeConversation: {
      id: 'conversation-1',
      messages: [],
      title: 'Analytics Chat',
    },
    createConversation: vi.fn(),
    deleteConversation: vi.fn(),
    historyItems: [],
    isLoading: false,
    selectConversation: vi.fn(),
    updateMessages: analyticsRouteMocks.updateMessagesMock,
  }),
}))

vi.mock('@/lib/storage/analytics', () => ({
  createSavedAnalyticsView: ({
    name,
    now = 100,
    query,
  }: {
    name: string
    now?: number
    query: unknown
  }) => ({
    createdAt: now,
    id: `view-${name}`,
    name,
    query,
    updatedAt: now,
  }),
  deleteSavedAnalyticsView: analyticsRouteMocks.deleteViewMock,
  loadSavedAnalyticsViews: analyticsRouteMocks.loadViewsMock,
  saveSavedAnalyticsViews: analyticsRouteMocks.saveViewsMock,
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

const records: AiSavedUrlRecord[] = [
  {
    id: '1',
    url: 'https://docs.example.com/a',
    title: 'Example Docs',
    domain: 'docs.example.com',
    savedAt: Date.UTC(2026, 2, 13),
    savedInTabGroups: ['docs.example.com'],
    savedInProjects: ['Research'],
    subCategories: ['Docs'],
    projectCategories: ['Reading'],
    parentCategories: ['Work'],
  },
  {
    id: '2',
    url: 'https://news.example.net/a',
    title: 'News Entry',
    domain: 'news.example.net',
    savedAt: Date.UTC(2026, 2, 12),
    savedInTabGroups: [],
    savedInProjects: ['Inbox'],
    subCategories: [],
    projectCategories: ['Catchup'],
    parentCategories: [],
  },
]

const bulkDeleteRecords: AiSavedUrlRecord[] = [
  records[0],
  {
    id: '3',
    url: 'https://docs.example.com/b',
    title: 'Example Docs B',
    domain: 'docs.example.com',
    savedAt: Date.UTC(2026, 2, 11),
    savedInTabGroups: ['docs.example.com'],
    savedInProjects: ['Research'],
    subCategories: ['Docs'],
    projectCategories: ['Reading'],
    parentCategories: ['Work'],
  },
  records[1],
]

describe('AnalyticsRoute', () => {
  beforeEach(() => {
    vi.useFakeTimers({
      shouldAdvanceTime: true,
    })
    vi.setSystemTime(new Date(Date.UTC(2026, 2, 14, 0, 0, 0)))

    analyticsRouteMocks.language = 'en'
    analyticsRouteMocks.deleteViewMock.mockReset()
    analyticsRouteMocks.loadRecordsMock.mockReset()
    analyticsRouteMocks.loadSettingsMock.mockReset()
    analyticsRouteMocks.loadViewsMock.mockReset()
    analyticsRouteMocks.saveViewsMock.mockReset()
    analyticsRouteMocks.sendMessageMock.mockReset()
    analyticsRouteMocks.storageGetMock.mockReset()
    analyticsRouteMocks.storageSetMock.mockReset()
    analyticsRouteMocks.updateMessagesMock.mockReset()
    analyticsRouteMocks.loadRecordsMock.mockResolvedValue(records)
    analyticsRouteMocks.loadSettingsMock.mockResolvedValue(defaultSettings)
    analyticsRouteMocks.loadViewsMock.mockResolvedValue([])
    analyticsRouteMocks.storageGetMock.mockResolvedValue({
      customProjectOrder: ['project-1'],
      customProjects: [
        {
          id: 'project-1',
          name: 'Project A',
          urlIds: ['url-1'],
          categories: [],
          createdAt: 1,
          updatedAt: 2,
        },
      ],
      parentCategories: [],
      savedTabs: [
        {
          id: 'group-1',
          domain: 'docs.example.com',
          urlIds: ['url-1'],
        },
      ],
      urls: [
        {
          id: 'url-1',
          savedAt: 1,
          title: 'Example Docs',
          url: 'https://docs.example.com/a',
        },
      ],
    })
    analyticsRouteMocks.sendMessageMock.mockImplementation(
      (
        _message: unknown,
        callback?: (response: { status: string }) => void,
      ) => {
        callback?.({ status: 'removed' })
      },
    )

    const chromeGlobal = globalThis as unknown as { chrome: typeof chrome }
    chromeGlobal.chrome = {
      runtime: {
        sendMessage: analyticsRouteMocks.sendMessageMock,
      },
      storage: {
        local: {
          get: analyticsRouteMocks.storageGetMock,
          set: analyticsRouteMocks.storageSetMock,
        },
      },
    } as unknown as typeof chrome
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('shared ui コンポーネントを利用する実装になっている', () => {
    const source = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), './AnalyticsRoute.tsx'),
      {
        encoding: 'utf8',
      },
    )

    expect(source).toContain("from '@/components/ui/button'")
    expect(source).toContain("from '@/components/ui/card'")
    expect(source).toContain("from '@/components/ui/input'")
    expect(source).toContain("from '@/components/ui/label'")
    expect(source).toContain("from '@/components/ui/select'")
    expect(source).toContain("from '@/components/ui/scroll-area'")
    expect(source).toContain("from '@/components/ui/badge'")
    expect(source).toContain("contentVisibility: 'auto'")
    expect(source).toContain("containIntrinsicSize: '96px'")
  })

  it('Undo トーストを表示するための Toaster を配置する', async () => {
    render(<AnalyticsRoute />)

    expect(await screen.findByTestId('analytics-toaster')).toBeTruthy()
  })

  it('初期ロード中に unmount されても state 更新しない', async () => {
    let resolveRecords: ((value: AiSavedUrlRecord[]) => void) | undefined
    analyticsRouteMocks.loadRecordsMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRecords = resolve
      }),
    )

    const { unmount } = render(<AnalyticsRoute />)

    unmount()
    resolveRecords?.(records)
    await Promise.resolve()

    expect(screen.queryByText('Analysis conditions')).toBeNull()
  })

  it('初期条件でチャートを表示する', async () => {
    render(<AnalyticsRoute />)

    expect(await screen.findByText('Analysis conditions')).toBeTruthy()
    expect(await screen.findByText('Saved count by domain')).toBeTruthy()
    expect(
      screen.getByText('Created Saved count by domain from 2 saved records.'),
    ).toBeTruthy()
    expect(screen.queryByText('Date range')).toBeNull()
    expect(screen.queryByText('Current range: All time')).toBeNull()
    expect(
      screen.queryByRole('button', { name: 'Select range on calendar' }),
    ).toBeNull()
    expect(screen.queryByLabelText('Included domains')).toBeNull()
    expect(screen.queryByLabelText('Excluded domains')).toBeNull()
    expect(screen.queryByLabelText('Mode')).toBeNull()
    expect(screen.queryByText('Mode')).toBeNull()
    expect(screen.queryByLabelText('Comparison series')).toBeNull()
    expect(screen.queryByText('Comparison series')).toBeNull()
    expect(
      screen.queryByRole('option', { name: 'Project category' }),
    ).toBeNull()
    expect(screen.queryByText('Analytics presets')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Top domains' })).toBeNull()
    expect(screen.getByText('history-variant:dropdown')).toBeTruthy()
    expect(screen.getByText('active-title:Analytics Chat')).toBeTruthy()
  })

  it('日本語表示では分析 UI を日本語で描画する', async () => {
    analyticsRouteMocks.language = 'ja'

    render(<AnalyticsRoute />)

    expect(await screen.findByText('分析条件')).toBeTruthy()
    expect(screen.getByText('分析キャンバス')).toBeTruthy()
    expect(
      screen.getByText(
        '2 件の保存データから「ドメインごとの保存数」を作成しました。',
      ),
    ).toBeTruthy()
    expect(screen.getByLabelText('ビュー名')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'リセット' })).toBeTruthy()
  })

  it('分析条件と分析キャンバスを個別スクロールする固定レイアウトで描画する', async () => {
    render(<AnalyticsRoute />)

    await screen.findByText('Analysis conditions')

    const layout = screen.getByTestId('analytics-page-layout')
    const sidebarPane = screen.getByTestId('analytics-sidebar-pane')
    const canvasPane = screen.getByTestId('analytics-canvas-pane')
    const stickyChartPanel = screen.getByTestId('analytics-sticky-chart-panel')

    expect(layout.className.includes('h-screen')).toBe(true)
    expect(layout.className.includes('overflow-hidden')).toBe(true)
    expect(sidebarPane.className.includes('overflow-y-auto')).toBe(true)
    expect(sidebarPane.className.includes('overscroll-contain')).toBe(true)
    expect(canvasPane.className.includes('overflow-y-auto')).toBe(true)
    expect(canvasPane.className.includes('overscroll-contain')).toBe(true)
    expect(stickyChartPanel.className.includes('-top-5')).toBe(true)
    expect(stickyChartPanel.className.includes('-mx-5')).toBe(true)
  })

  it('分析条件の操作ボタンを1:1幅の2カラムで表示する', async () => {
    render(<AnalyticsRoute />)

    await screen.findByText('Analysis conditions')

    const saveButton = screen.getByRole('button', { name: 'Save' })
    const resetButton = screen.getByRole('button', { name: 'Reset' })
    const buttonRow = saveButton.parentElement

    expect(buttonRow?.className.includes('grid')).toBe(true)
    expect(buttonRow?.className.includes('grid-cols-2')).toBe(true)
    expect(saveButton.className.includes('w-full')).toBe(true)
    expect(resetButton.className.includes('w-full')).toBe(true)
  })

  it('左側の手動フィルタ変更でチャートを更新する', async () => {
    render(<AnalyticsRoute />)

    expect((await screen.findAllByText('Saved count by domain')).length).toBe(1)

    fireEvent.change(screen.getByLabelText('Group by'), {
      target: { value: 'project' },
    })

    expect(await screen.findByText('Saved count by project')).toBeTruthy()
  })

  it('チャート種別・表示件数・リセット操作で分析条件を更新する', async () => {
    render(<AnalyticsRoute />)

    expect((await screen.findAllByText('Saved count by domain')).length).toBe(1)

    fireEvent.change(screen.getByLabelText('Chart type'), {
      target: { value: 'pie' },
    })
    fireEvent.change(screen.getByLabelText('Top count'), {
      target: { value: '0' },
    })

    const limitInput = screen.getByLabelText('Top count') as HTMLInputElement
    expect(limitInput.value).toBe('1')

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))

    expect(limitInput.value).toBe('8')
  })

  it('shows both time-series group-by options', async () => {
    render(<AnalyticsRoute />)

    await screen.findByText('Analysis conditions')

    expect(
      screen.getByRole('option', { name: 'Time series (recent)' }),
    ).toBeTruthy()
    expect(
      screen.getByRole('option', { name: 'Time series (top counts)' }),
    ).toBeTruthy()
  })

  it('保存済みビューの旧 time は時系列（直近）として読み込む', async () => {
    analyticsRouteMocks.loadViewsMock.mockResolvedValue([
      {
        createdAt: 1,
        id: 'view-legacy-time',
        name: 'Legacy Time View',
        query: {
          chartType: 'line',
          compareBy: 'none',
          filters: {
            excludedDomains: [],
            excludedParentCategories: [],
            excludedProjectCategories: [],
            excludedProjects: [],
            excludedSubCategories: [],
            includedDomains: [],
            includedParentCategories: [],
            includedProjectCategories: [],
            includedProjects: [],
            includedSubCategories: [],
          },
          groupBy: 'time',
          limit: 1,
          mode: 'both',
          normalize: false,
          sort: 'value-desc',
          stacked: false,
          timeBucket: 'day',
          timeRange: '30d',
        } as never,
        updatedAt: 1,
      },
    ])

    render(<AnalyticsRoute />)

    expect(
      await screen.findByRole('button', { name: 'Legacy Time View' }),
    ).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Legacy Time View' }))

    await waitFor(() => {
      expect(
        screen.getByText('[{"count":1,"label":"2026-03-13"}]'),
      ).toBeTruthy()
    })

    const groupBySelect = screen.getByLabelText('Group by') as HTMLSelectElement
    expect(groupBySelect.value).toBe('timeRecent')
  })

  it('現在の条件を保存できる', async () => {
    render(<AnalyticsRoute />)

    expect((await screen.findAllByText('Saved count by domain')).length).toBe(1)
    fireEvent.change(screen.getByLabelText('View name'), {
      target: { value: 'My Analytics' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(analyticsRouteMocks.saveViewsMock).toHaveBeenCalledTimes(1)
    })
  })

  it('保存成功後にビュー名をクリアする', async () => {
    render(<AnalyticsRoute />)

    await screen.findByText('Analysis conditions')

    const viewNameInput = screen.getByLabelText('View name') as HTMLInputElement

    fireEvent.change(viewNameInput, {
      target: { value: 'My Analytics' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(analyticsRouteMocks.saveViewsMock).toHaveBeenCalledTimes(1)
    })

    expect(viewNameInput.value).toBe('')
  })

  it('ビュー名が空のまま保存するとエラーを表示する', async () => {
    render(<AnalyticsRoute />)

    await screen.findByText('Analysis conditions')

    const viewNameInput = screen.getByLabelText('View name')

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(analyticsRouteMocks.saveViewsMock).not.toHaveBeenCalled()
    expect(viewNameInput.getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByText('Enter a view name')).toBeTruthy()

    fireEvent.change(viewNameInput, {
      target: { value: 'My Analytics' },
    })

    expect(viewNameInput.getAttribute('aria-invalid')).toBe('false')
    expect(screen.queryByText('Enter a view name')).toBeNull()
  })

  it('既存ビューと同名では保存できず重複エラーを表示する', async () => {
    analyticsRouteMocks.loadViewsMock.mockResolvedValue([
      {
        createdAt: 1,
        id: 'view-existing',
        name: 'My Analytics',
        query: {
          chartType: 'bar',
          compareBy: 'none',
          filters: {
            excludedDomains: [],
            excludedParentCategories: [],
            excludedProjectCategories: [],
            excludedProjects: [],
            excludedSubCategories: [],
            includedDomains: [],
            includedParentCategories: [],
            includedProjectCategories: [],
            includedProjects: [],
            includedSubCategories: [],
          },
          groupBy: 'domain',
          limit: 8,
          mode: 'both',
          normalize: false,
          sort: 'value-desc',
          stacked: false,
          timeBucket: 'day',
          timeRange: '30d',
        },
        updatedAt: 1,
      },
    ])

    render(<AnalyticsRoute />)

    await screen.findByRole('button', { name: 'My Analytics' })

    const viewNameInput = screen.getByLabelText('View name')

    fireEvent.change(viewNameInput, {
      target: { value: '  My Analytics  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(analyticsRouteMocks.saveViewsMock).not.toHaveBeenCalled()
    expect(viewNameInput.getAttribute('aria-invalid')).toBe('true')
    expect(
      screen.getByText('A view with this name already exists'),
    ).toBeTruthy()

    fireEvent.change(viewNameInput, {
      target: { value: 'My Analytics 2' },
    })

    expect(viewNameInput.getAttribute('aria-invalid')).toBe('false')
    expect(
      screen.queryByText('A view with this name already exists'),
    ).toBeNull()
  })

  it('大文字小文字だけが異なるビュー名は別名として保存できる', async () => {
    analyticsRouteMocks.loadViewsMock.mockResolvedValue([
      {
        createdAt: 1,
        id: 'view-existing',
        name: 'My Analytics',
        query: {
          chartType: 'bar',
          compareBy: 'none',
          filters: {
            excludedDomains: [],
            excludedParentCategories: [],
            excludedProjectCategories: [],
            excludedProjects: [],
            excludedSubCategories: [],
            includedDomains: [],
            includedParentCategories: [],
            includedProjectCategories: [],
            includedProjects: [],
            includedSubCategories: [],
          },
          groupBy: 'domain',
          limit: 8,
          mode: 'both',
          normalize: false,
          sort: 'value-desc',
          stacked: false,
          timeBucket: 'day',
          timeRange: '30d',
        },
        updatedAt: 1,
      },
    ])

    render(<AnalyticsRoute />)

    await screen.findByRole('button', { name: 'My Analytics' })

    fireEvent.change(screen.getByLabelText('View name'), {
      target: { value: 'my analytics' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(analyticsRouteMocks.saveViewsMock).toHaveBeenCalledTimes(1)
    })
    expect(
      screen.queryByText('A view with this name already exists'),
    ).toBeNull()
  })

  it('保存済みビューを読み込み、削除できる', async () => {
    analyticsRouteMocks.loadViewsMock.mockResolvedValue([
      {
        createdAt: 1,
        id: 'view-1',
        name: 'Saved View',
        query: {
          chartType: 'bar',
          compareBy: 'none',
          filters: {
            excludedDomains: [],
            excludedParentCategories: [],
            excludedProjectCategories: [],
            excludedProjects: [],
            excludedSubCategories: [],
            includedDomains: [],
            includedParentCategories: [],
            includedProjectCategories: [],
            includedProjects: [],
            includedSubCategories: [],
          },
          groupBy: 'domain',
          limit: 8,
          mode: 'both',
          normalize: false,
          sort: 'value-desc',
          stacked: false,
          timeBucket: 'day',
          timeRange: '30d',
        },
        updatedAt: 1,
      },
    ])

    render(<AnalyticsRoute />)

    expect(
      await screen.findByRole('button', { name: 'Delete Saved View' }),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Delete Saved View' }))

    await waitFor(() => {
      expect(analyticsRouteMocks.deleteViewMock).toHaveBeenCalledWith('view-1')
    })
  })

  it('保存済みビューを読み込んでもモードは両方固定になる', async () => {
    analyticsRouteMocks.loadViewsMock.mockResolvedValue([
      {
        createdAt: 1,
        id: 'view-1',
        name: 'Domain Only View',
        query: {
          chartType: 'bar',
          compareBy: 'none',
          filters: {
            excludedDomains: [],
            excludedParentCategories: [],
            excludedProjectCategories: [],
            excludedProjects: [],
            excludedSubCategories: [],
            includedDomains: [],
            includedParentCategories: [],
            includedProjectCategories: [],
            includedProjects: [],
            includedSubCategories: [],
          },
          groupBy: 'domain',
          limit: 8,
          mode: 'domain',
          normalize: false,
          sort: 'value-desc',
          stacked: false,
          timeBucket: 'day',
          timeRange: '30d',
        },
        updatedAt: 1,
      },
    ])

    render(<AnalyticsRoute />)

    expect(
      await screen.findByRole('button', { name: 'Delete Domain Only View' }),
    ).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Domain Only View' }))

    await waitFor(() => {
      expect(
        screen.getByText(
          '[{"count":1,"label":"docs.example.com"},{"count":1,"label":"news.example.net"}]',
        ),
      ).toBeTruthy()
    })
  })

  it('AIチャットから渡されたチャートを左側に反映する', async () => {
    render(<AnalyticsRoute />)

    expect((await screen.findAllByText('Saved count by domain')).length).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: 'emit-ai-chart' }))

    expect(await screen.findByText('AI-generated chart')).toBeTruthy()
    expect(analyticsRouteMocks.updateMessagesMock).toHaveBeenCalledTimes(1)
  })

  it('分析クエリが無い AI チャートでも左側に反映する', async () => {
    render(<AnalyticsRoute />)

    expect((await screen.findAllByText('Saved count by domain')).length).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: 'emit-chart-only' }))

    expect(await screen.findByText('AI chart without query')).toBeTruthy()
  })

  it('AI メッセージに有効なチャートがない場合は現在のチャートを維持する', async () => {
    render(<AnalyticsRoute />)

    expect((await screen.findAllByText('Saved count by domain')).length).toBe(1)

    fireEvent.click(screen.getByRole('button', { name: 'emit-empty-messages' }))
    fireEvent.click(screen.getByRole('button', { name: 'emit-user-only' }))

    expect(screen.getByText('Saved count by domain')).toBeTruthy()
    expect(analyticsRouteMocks.updateMessagesMock).toHaveBeenCalledTimes(2)
  })

  it('AI ツール出力の query が不正でもチャートだけを反映する', async () => {
    render(<AnalyticsRoute />)

    expect((await screen.findAllByText('Saved count by domain')).length).toBe(1)
    fireEvent.click(
      screen.getByRole('button', { name: 'emit-invalid-query-chart' }),
    )

    expect(await screen.findByText('Invalid query chart')).toBeTruthy()
  })

  it('チャートクリックで項目に含まれる保存タブを表示する', async () => {
    render(<AnalyticsRoute />)

    expect((await screen.findAllByText('Saved count by domain')).length).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: 'emit-chart-click' }))

    expect(await screen.findByText('Saved tabs in this item')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull()
    expect(screen.getByText('Example Docs')).toBeTruthy()
    expect(screen.queryByText('https://docs.example.com/a')).toBeNull()
    const savedAtText = new Date(records[0].savedAt).toLocaleString('en-US')
    expect(screen.getByText(savedAtText)).toBeTruthy()
    const openLink = screen.getByRole('link', { name: 'Open Example Docs' })
    const deleteButton = screen.getByRole('button', { name: 'Delete tab' })
    const source = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), './AnalyticsRoute.tsx'),
      {
        encoding: 'utf8',
      },
    )
    expect(openLink).toBeTruthy()
    expect(openLink.className.includes('size-8')).toBe(true)
    expect(deleteButton.className.includes('size-8')).toBe(true)
    expect(source).toContain("from '@/components/ui/tooltip'")
    expect(source).toContain("t('analytics.open')")
    expect(source).toContain("t('common.delete')")
    expect(
      openLink.closest('div')?.parentElement?.className.includes('shrink-0'),
    ).toBe(true)
  })

  it('ドリルダウンは現在の分析条件で絞り込まれた保存タブだけを表示する', async () => {
    analyticsRouteMocks.loadRecordsMock.mockResolvedValue([
      ...records,
      {
        id: '3',
        url: 'https://docs.example.com/old',
        title: 'Old Docs',
        domain: 'docs.example.com',
        savedAt: Date.UTC(2025, 0, 1),
        savedInTabGroups: ['docs.example.com'],
        savedInProjects: [],
        subCategories: ['Docs'],
        projectCategories: [],
        parentCategories: ['Work'],
      },
    ])

    render(<AnalyticsRoute />)

    expect((await screen.findAllByText('Saved count by domain')).length).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: 'emit-ai-chart' }))
    fireEvent.click(screen.getByRole('button', { name: 'emit-chart-click' }))

    expect(await screen.findByText('Saved tabs in this item')).toBeTruthy()
    expect(screen.getByText('Example Docs')).toBeTruthy()
    expect(screen.queryByText('Old Docs')).toBeNull()
  })

  it('空ラベルのドリルダウンは一致なし表示にする', async () => {
    render(<AnalyticsRoute />)

    expect((await screen.findAllByText('Saved count by domain')).length).toBe(1)
    fireEvent.click(
      screen.getByRole('button', { name: 'emit-empty-chart-click' }),
    )

    expect(
      await screen.findByText('No matching saved tabs were found.'),
    ).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: 'Open all tabs in this item' }),
    ).toBeNull()
    expect(
      screen.queryByRole('button', { name: 'Delete all tabs in this item' }),
    ).toBeNull()
  })

  it('親カテゴリ・子カテゴリ・プロジェクト条件で未分類ドリルダウンを表示する', async () => {
    render(<AnalyticsRoute />)

    expect((await screen.findAllByText('Saved count by domain')).length).toBe(1)

    fireEvent.change(screen.getByLabelText('Group by'), {
      target: { value: 'parentCategory' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'emit-uncategorized-click' }),
    )
    expect(await screen.findByText('News Entry')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Group by'), {
      target: { value: 'subCategory' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'emit-uncategorized-click' }),
    )
    expect(await screen.findByText('News Entry')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Group by'), {
      target: { value: 'project' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'emit-inbox-click' }))
    expect(await screen.findByText('News Entry')).toBeTruthy()
  })

  it('時系列とプロジェクトカテゴリ条件でドリルダウンラベルを解決する', async () => {
    analyticsRouteMocks.loadViewsMock.mockResolvedValue([
      {
        createdAt: 1,
        id: 'view-project-category',
        name: 'Project Category View',
        query: {
          chartType: 'bar',
          compareBy: 'none',
          filters: {
            excludedDomains: [],
            excludedParentCategories: [],
            excludedProjectCategories: [],
            excludedProjects: [],
            excludedSubCategories: [],
            includedDomains: [],
            includedParentCategories: [],
            includedProjectCategories: [],
            includedProjects: [],
            includedSubCategories: [],
          },
          groupBy: 'projectCategory',
          limit: 8,
          mode: 'both',
          normalize: false,
          sort: 'value-desc',
          stacked: false,
          timeBucket: 'day',
          timeRange: '30d',
        },
        updatedAt: 1,
      },
    ])

    render(<AnalyticsRoute />)

    expect(
      await screen.findByRole('button', { name: 'Project Category View' }),
    ).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Group by'), {
      target: { value: 'timeRecent' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'emit-time-click' }))
    expect(await screen.findByText('Example Docs')).toBeTruthy()

    fireEvent.click(
      screen.getByRole('button', { name: 'Project Category View' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'emit-catchup-click' }))
    expect(await screen.findByText('News Entry')).toBeTruthy()
  })

  it('モード比較ドリルダウンは seriesKey に合う保存元だけを残す', async () => {
    analyticsRouteMocks.loadViewsMock.mockResolvedValue([
      {
        createdAt: 1,
        id: 'view-compare-mode',
        name: 'Compare Mode View',
        query: {
          chartType: 'bar',
          compareBy: 'mode',
          filters: {
            excludedDomains: [],
            excludedParentCategories: [],
            excludedProjectCategories: [],
            excludedProjects: [],
            excludedSubCategories: [],
            includedDomains: [],
            includedParentCategories: [],
            includedProjectCategories: [],
            includedProjects: [],
            includedSubCategories: [],
          },
          groupBy: 'domain',
          limit: 8,
          mode: 'both',
          normalize: false,
          sort: 'value-desc',
          stacked: false,
          timeBucket: 'day',
          timeRange: '30d',
        },
        updatedAt: 1,
      },
    ])

    render(<AnalyticsRoute />)

    fireEvent.click(
      await screen.findByRole('button', { name: 'Compare Mode View' }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'emit-domain-series-news-click' }),
    )

    expect(
      await screen.findByText('No matching saved tabs were found.'),
    ).toBeTruthy()

    fireEvent.click(
      screen.getByRole('button', { name: 'emit-custom-series-news-click' }),
    )

    expect(await screen.findByText('News Entry')).toBeTruthy()

    fireEvent.click(
      screen.getByRole('button', { name: 'emit-other-series-news-click' }),
    )

    expect(await screen.findByText('News Entry')).toBeTruthy()
  })

  it('長いタイトルでもドリルダウンの操作列が見切れないレイアウトを使う', async () => {
    analyticsRouteMocks.loadRecordsMock.mockResolvedValue([
      {
        ...records[0],
        title:
          'Extremely long analytics drilldown title that should never push the action area out of view even when the canvas is narrow',
      },
      records[1],
    ])

    render(<AnalyticsRoute />)

    expect((await screen.findAllByText('Saved count by domain')).length).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: 'emit-chart-click' }))

    const openLink = await screen.findByRole('link', {
      name: 'Open Extremely long analytics drilldown title that should never push the action area out of view even when the canvas is narrow',
    })
    const deleteButton = screen.getByRole('button', { name: 'Delete tab' })

    const buttonRow = openLink.closest('div')
    const actionColumn = buttonRow?.parentElement
    const cardLayout = actionColumn?.parentElement

    expect(cardLayout?.className.includes('grid')).toBe(true)
    expect(
      cardLayout?.className.includes('sm:grid-cols-[minmax(0,1fr)_auto]'),
    ).toBe(true)
    expect(buttonRow?.className.includes('items-center')).toBe(true)
    expect(buttonRow?.className.includes('justify-end')).toBe(true)
    expect(deleteButton.parentElement).toBe(buttonRow)
    expect(actionColumn?.className.includes('sm:items-end')).toBe(true)
  })

  it('ドリルダウン各行に削除ボタンを表示する', async () => {
    render(<AnalyticsRoute />)

    expect((await screen.findAllByText('Saved count by domain')).length).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: 'emit-chart-click' }))

    expect(
      await screen.findByRole('button', { name: 'Delete tab' }),
    ).toBeTruthy()
  })

  it('ドリルダウン見出しにすべて開く・すべて削除ボタンを表示する', async () => {
    render(<AnalyticsRoute />)

    expect((await screen.findAllByText('Saved count by domain')).length).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: 'emit-chart-click' }))

    expect(
      await screen.findByRole('button', { name: 'Open all tabs in this item' }),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Delete all tabs in this item' }),
    ).toBeTruthy()
  })

  it('ドリルダウンのすべて開くで対象URLを一括で開く', async () => {
    const openSpy = vi
      .spyOn(window, 'open')
      .mockImplementation(vi.fn() as never)

    render(<AnalyticsRoute />)

    expect((await screen.findAllByText('Saved count by domain')).length).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: 'emit-chart-click' }))
    openSpy.mockClear()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Open all tabs in this item' }),
    )

    expect(openSpy).toHaveBeenCalledTimes(1)
    expect(openSpy).toHaveBeenCalledWith(
      'https://docs.example.com/a',
      '_blank',
      'noopener,noreferrer',
    )
  })

  it('ドリルダウンのすべて開くは10件以上で確認ダイアログを経由する', async () => {
    const manyRecords = Array.from({ length: 10 }, (_, index) => ({
      ...records[0],
      id: `docs-${index}`,
      title: `Docs ${index}`,
      url: `https://docs.example.com/${index}`,
    }))
    analyticsRouteMocks.loadRecordsMock.mockResolvedValue(manyRecords)
    const openSpy = vi
      .spyOn(window, 'open')
      .mockImplementation(vi.fn() as never)

    render(<AnalyticsRoute />)

    expect(
      await screen.findByText(
        'Created Saved count by domain from 10 saved records.',
      ),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'emit-chart-click' }))
    openSpy.mockClear()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Open all tabs in this item' }),
    )

    expect(await screen.findByText('Open all tabs?')).toBeTruthy()
    expect(openSpy).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Open' }))

    expect(openSpy).toHaveBeenCalledTimes(10)
  })

  it('confirmDeleteAll=false のときドリルダウンのすべて削除で対象URL IDを一括削除する', async () => {
    analyticsRouteMocks.loadRecordsMock
      .mockResolvedValueOnce(bulkDeleteRecords)
      .mockResolvedValueOnce([records[1]])

    render(<AnalyticsRoute />)

    expect((await screen.findAllByText('Saved count by domain')).length).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: 'emit-chart-click' }))
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Delete all tabs in this item',
      }),
    )

    await waitFor(() => {
      expect(analyticsRouteMocks.sendMessageMock).toHaveBeenCalledWith(
        {
          action: 'removeUrlRecordsFromStorage',
          urlIds: ['1', '3'],
        },
        expect.any(Function),
      )
    })
    expect(analyticsRouteMocks.sendMessageMock).toHaveBeenCalledTimes(1)
    expect(toast.info).toHaveBeenCalledWith(
      'You can restore 2 deleted tabs to saved data',
      expect.objectContaining({
        action: expect.objectContaining({
          label: 'Undo',
        }),
      }),
    )
  })

  it('confirmDeleteAll=true のときドリルダウンのすべて削除は確認ダイアログを経由する', async () => {
    analyticsRouteMocks.loadSettingsMock.mockResolvedValue({
      ...defaultSettings,
      confirmDeleteAll: true,
    })
    analyticsRouteMocks.loadRecordsMock
      .mockResolvedValueOnce(bulkDeleteRecords)
      .mockResolvedValueOnce([records[1]])

    render(<AnalyticsRoute />)

    expect((await screen.findAllByText('Saved count by domain')).length).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: 'emit-chart-click' }))
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Delete all tabs in this item',
      }),
    )

    expect(await screen.findByText('Delete all tabs?')).toBeTruthy()
    expect(analyticsRouteMocks.sendMessageMock).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => {
      expect(analyticsRouteMocks.sendMessageMock).toHaveBeenCalledWith(
        {
          action: 'removeUrlRecordsFromStorage',
          urlIds: ['1', '3'],
        },
        expect.any(Function),
      )
    })
    expect(analyticsRouteMocks.sendMessageMock).toHaveBeenCalledTimes(1)
  })

  it('一括削除確認はキャンセルできる', async () => {
    analyticsRouteMocks.loadSettingsMock.mockResolvedValue({
      ...defaultSettings,
      confirmDeleteAll: true,
    })
    analyticsRouteMocks.loadRecordsMock.mockResolvedValue(bulkDeleteRecords)

    render(<AnalyticsRoute />)

    expect((await screen.findAllByText('Saved count by domain')).length).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: 'emit-chart-click' }))
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Delete all tabs in this item',
      }),
    )

    expect(await screen.findByText('Delete all tabs?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => {
      expect(screen.queryByText('Delete all tabs?')).toBeNull()
    })
    expect(analyticsRouteMocks.sendMessageMock).not.toHaveBeenCalled()
  })

  it('confirmDeleteEach=false のとき即時削除して一覧を再読込する', async () => {
    analyticsRouteMocks.loadRecordsMock
      .mockResolvedValueOnce(records)
      .mockResolvedValueOnce([records[1]])

    render(<AnalyticsRoute />)

    expect((await screen.findAllByText('Saved count by domain')).length).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: 'emit-chart-click' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete tab' }))

    await waitFor(() => {
      expect(analyticsRouteMocks.sendMessageMock).toHaveBeenCalledWith(
        {
          action: 'removeUrlFromStorage',
          url: 'https://docs.example.com/a',
        },
        expect.any(Function),
      )
    })

    await waitFor(() => {
      expect(screen.queryByText('Example Docs')).toBeNull()
    })
    expect(screen.queryByRole('link', { name: 'Open Example Docs' })).toBeNull()
    expect(
      screen.getByText('Created Saved count by domain from 1 saved records.'),
    ).toBeTruthy()
    expect(toast.info).toHaveBeenCalledWith(
      'You can restore 1 deleted tabs to saved data',
      expect.objectContaining({
        action: expect.objectContaining({
          label: 'Undo',
        }),
      }),
    )

    const undoOptions = vi.mocked(toast.info).mock.calls.at(-1)?.[1] as
      | {
          action?: {
            onClick?: () => Promise<void>
          }
        }
      | undefined
    await undoOptions?.action?.onClick?.()

    expect(analyticsRouteMocks.storageSetMock).toHaveBeenCalledWith(
      await analyticsRouteMocks.storageGetMock.mock.results[0]?.value,
    )
  })

  it('削除 Undo の復元失敗はトーストで通知する', async () => {
    analyticsRouteMocks.loadRecordsMock
      .mockResolvedValueOnce(records)
      .mockResolvedValueOnce([records[1]])
    analyticsRouteMocks.storageSetMock.mockRejectedValueOnce(
      new Error('restore failed'),
    )

    render(<AnalyticsRoute />)

    expect((await screen.findAllByText('Saved count by domain')).length).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: 'emit-chart-click' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete tab' }))

    await waitFor(() => {
      expect(toast.info).toHaveBeenCalled()
    })

    const undoOptions = vi.mocked(toast.info).mock.calls.at(-1)?.[1] as
      | {
          action?: {
            onClick?: () => Promise<void>
          }
        }
      | undefined
    await undoOptions?.action?.onClick?.()

    expect(toast.error).toHaveBeenCalledWith('Could not restore saved data')
  })

  it('単体削除と一括削除の background エラーを処理する', async () => {
    analyticsRouteMocks.sendMessageMock.mockImplementation(
      (
        _message: unknown,
        callback?: (response: { error?: string; status: string }) => void,
      ) => {
        callback?.({ error: 'background failed', status: 'error' })
      },
    )

    render(<AnalyticsRoute />)

    expect((await screen.findAllByText('Saved count by domain')).length).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: 'emit-chart-click' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete tab' }))

    await waitFor(() => {
      expect(analyticsRouteMocks.sendMessageMock).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(
      screen.getByRole('button', { name: 'Delete all tabs in this item' }),
    )

    await waitFor(() => {
      expect(analyticsRouteMocks.sendMessageMock).toHaveBeenCalledTimes(2)
    })
  })

  it('confirmDeleteEach=true のとき確認ダイアログ経由で削除する', async () => {
    analyticsRouteMocks.loadSettingsMock.mockResolvedValue({
      ...defaultSettings,
      confirmDeleteEach: true,
    })
    analyticsRouteMocks.loadRecordsMock
      .mockResolvedValueOnce(records)
      .mockResolvedValueOnce([records[1]])

    render(<AnalyticsRoute />)

    expect((await screen.findAllByText('Saved count by domain')).length).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: 'emit-chart-click' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete tab' }))

    expect(await screen.findByText('Delete this tab?')).toBeTruthy()
    expect(analyticsRouteMocks.sendMessageMock).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => {
      expect(analyticsRouteMocks.sendMessageMock).toHaveBeenCalledTimes(1)
    })
  })

  it('単体削除確認はキャンセルできる', async () => {
    analyticsRouteMocks.loadSettingsMock.mockResolvedValue({
      ...defaultSettings,
      confirmDeleteEach: true,
    })

    render(<AnalyticsRoute />)

    expect((await screen.findAllByText('Saved count by domain')).length).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: 'emit-chart-click' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete tab' }))

    expect(await screen.findByText('Delete this tab?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => {
      expect(screen.queryByText('Delete this tab?')).toBeNull()
    })
    expect(analyticsRouteMocks.sendMessageMock).not.toHaveBeenCalled()
  })

  it('削除中は二重送信しない', async () => {
    let resolveRemoval: ((value: { status: string }) => void) | undefined
    analyticsRouteMocks.sendMessageMock.mockImplementation(
      (
        _message: unknown,
        callback?: (response: { status: string }) => void,
      ) => {
        resolveRemoval = callback
      },
    )

    render(<AnalyticsRoute />)

    expect((await screen.findAllByText('Saved count by domain')).length).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: 'emit-chart-click' }))

    const deleteButton = await screen.findByRole('button', {
      name: 'Delete tab',
    })
    fireEvent.click(deleteButton)
    fireEvent.click(deleteButton)

    await waitFor(() => {
      expect(analyticsRouteMocks.sendMessageMock).toHaveBeenCalledTimes(1)
    })

    resolveRemoval?.({ status: 'removed' })
  })
})
