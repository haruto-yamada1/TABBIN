/* eslint-disable max-lines-per-function, typescript/no-misused-promises */
// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import type { CustomProjectSectionProps } from '@/features/saved-tabs/types/CustomProjectSection.types'
import type { UserSettings } from '@/types/storage'

const customProjectSectionI18nState = vi.hoisted(() => ({
  language: 'ja' as 'en' | 'ja',
}))

const { dndContextPropsRef, customProjectCardSpy, arrayMoveMock } = vi.hoisted(
  () => ({
    dndContextPropsRef: {
      current: {} as {
        onDragStart?: (event: unknown) => void
        onDragOver?: (event: unknown) => void
        onDragEnd?: (event: unknown) => void
      },
    },
    customProjectCardSpy: vi.fn(),
    arrayMoveMock: vi.fn((arr: string[], from: number, to: number) => {
      const next = [...arr]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    }),
  }),
)

vi.mock('@dnd-kit/core', () => ({
  closestCenter: 'closestCenter',
  KeyboardSensor: vi.fn(),
  PointerSensor: vi.fn(),
  DndContext: ({
    children,
    onDragStart,
    onDragOver,
    onDragEnd,
  }: {
    children: React.ReactNode
    onDragStart?: (event: unknown) => void
    onDragOver?: (event: unknown) => void
    onDragEnd?: (event: unknown) => void
  }) => {
    dndContextPropsRef.current = { onDragStart, onDragOver, onDragEnd }
    return <div data-testid='dnd-context'>{children}</div>
  },
  DragOverlay: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='drag-overlay'>{children}</div>
  ),
  useSensor: vi.fn(() => 'sensor'),
  useSensors: vi.fn(() => ['sensor']),
}))

vi.mock('@dnd-kit/sortable', () => ({
  arrayMove: arrayMoveMock,
  SortableContext: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='sortable-context'>{children}</div>
  ),
  sortableKeyboardCoordinates: vi.fn(),
  verticalListSortingStrategy: 'verticalListSortingStrategy',
}))

vi.mock('./CustomProjectCard', () => ({
  CustomProjectCard: (props: {
    project: { id: string; name: string }
    draggedItem?: { url: string; projectId: string; title: string } | null
    isDropTarget?: boolean
    isProjectReorderMode?: boolean
    isCrossProjectUrlDragActive?: boolean
  }) => {
    customProjectCardSpy(props)
    return (
      <div
        data-testid={`project-card-${props.project.id}`}
        data-drop-target={props.isDropTarget ? 'true' : 'false'}
        data-dragged-item={props.draggedItem ? props.draggedItem.url : ''}
        data-cross-project-url-drag-active={
          props.isCrossProjectUrlDragActive ? 'true' : 'false'
        }
        data-project-reorder-mode={
          props.isProjectReorderMode ? 'true' : 'false'
        }
      >
        {props.project.name}
      </div>
    )
  },
}))

vi.mock('@/features/i18n/context/I18nProvider', async () => {
  const { getMessages } = await vi.importActual<
// eslint-disable-next-line typescript/consistent-type-imports
    typeof import('@/features/i18n/messages')
  >('@/features/i18n/messages')

  return {
    useI18n: () => ({
      language: customProjectSectionI18nState.language,
      t: (key: string, fallback?: string, values?: Record<string, string>) => {
        const messages = getMessages(customProjectSectionI18nState.language)
        const template =
          messages[key as keyof typeof messages] ?? fallback ?? key
        return template.replaceAll(
          /\{\{(\w+)\}\}/g,
          (_, token) => values?.[token] ?? '', // eslint-disable-line
        )
      },
    }),
  }
})

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({
    open,
    onOpenChange,
    children,
  }: {
    open: boolean
    onOpenChange?: (open: boolean) => void
    children: React.ReactNode
  }) => (
    <div data-testid='dialog-root'>
// eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
      <button onClick={() => onOpenChange?.(true)} type='button'>
        dialog-open
      </button>
// eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
      <button onClick={() => onOpenChange?.(false)} type='button'>
        dialog-close
      </button>
      {open ? children : null}
    </div>
  ),
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='dialog-content'>{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
  DialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  TooltipProvider: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))

import { CustomProjectSection } from './CustomProjectSection'

const defaultSettings: UserSettings = {
  removeTabAfterOpen: true,
  removeTabAfterExternalDrop: true,
  excludePatterns: [],
  enableCategories: true,
  autoDeletePeriod: 'never',
  showSavedTime: false,
  clickBehavior: 'saveSameDomainTabs',
  excludePinnedTabs: false,
  openUrlInBackground: true,
  openAllInNewWindow: false,
  confirmDeleteAll: false,
  confirmDeleteEach: false,
  colors: {},
}

const createProjects = () => [
  {
    id: 'project-1',
    name: 'Project One',
    categories: ['CatA'],
    createdAt: 1,
    updatedAt: 2,
    urls: [],
  },
  {
    id: 'project-2',
    name: 'Project Two',
    categories: [],
    createdAt: 3,
    updatedAt: 4,
    urls: [],
  },
]

const createProps = (
  overrides: Partial<CustomProjectSectionProps> = {},
): CustomProjectSectionProps => ({
  projects: createProjects(),
  handleOpenUrl: vi.fn(),
  handleDeleteUrl: vi.fn(),
  handleAddUrl: vi.fn(),
  handleCreateProject: vi.fn(),
  handleDeleteProject: vi.fn(),
  handleRenameProject: vi.fn(),
  handleAddCategory: vi.fn(),
  handleDeleteCategory: vi.fn(),
  handleRenameCategory: vi.fn(),
  handleSetUrlCategory: vi.fn(),
  handleUpdateCategoryOrder: vi.fn(),
  handleReorderUrls: vi.fn(),
  handleReorderProjects: vi.fn(),
  handleOpenAllUrls: vi.fn(),
  handleMoveUrlBetweenProjects: vi.fn(),
  handleMoveUrlsBetweenCategories: vi.fn(),
  settings: defaultSettings,
  ...overrides,
})

describe('CustomProjectSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    customProjectSectionI18nState.language = 'ja'
    dndContextPropsRef.current = {}
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('プロジェクトがない場合は空状態を描画する', () => {
    render(<CustomProjectSection {...createProps({ projects: [] })} />)

    expect(screen.getByText('プロジェクトがありません')).toBeTruthy()
    expect(screen.getByText(/表示可能なプロジェクトがありません/)).toBeTruthy()
    expect(screen.queryByTestId('dnd-context')).toBeNull()
  })

  it('renders English empty-state copy when the display language is en', () => {
    customProjectSectionI18nState.language = 'en'

    render(<CustomProjectSection {...createProps({ projects: [] })} />)

    expect(screen.getByText('No projects')).toBeTruthy()
    const description = document.querySelector(
      '.text-center.text-muted-foreground',
    )
    expect(description?.textContent).toContain(
      'No projects are available to display',
    )
    expect(description?.textContent).toContain(
      'Create a parent category to show it as a project',
    )
  })

  it('作成ダイアログで空入力・重複・成功・キャンセルの分岐を処理する', async () => {
    const handleCreateProject = vi.fn()
    render(
      <CustomProjectSection
        {...createProps({
          handleCreateProject,
        })}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'dialog-open' }))
    expect(screen.getByTestId('dialog-content')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '作成' }))
    await waitFor(() => {
      expect(screen.getByText('プロジェクト名を入力してください')).toBeTruthy()
    })

    fireEvent.change(screen.getByLabelText('プロジェクト名 *'), {
      target: { value: '   ' },
    })

    fireEvent.change(screen.getByLabelText('プロジェクト名 *'), {
      target: { value: 'Project One' },
    })
    fireEvent.click(screen.getByRole('button', { name: '作成' }))
    await waitFor(() => {
      expect(
        screen.getByText('プロジェクト名「Project One」は既に使用されています'),
      ).toBeTruthy()
    })

    fireEvent.change(screen.getByLabelText('プロジェクト名 *'), {
      target: { value: 'New Project' },
    })
    await waitFor(() => {
      expect(
        screen.queryByText(
          'プロジェクト名「Project One」は既に使用されています',
        ),
      ).toBeNull()
    })

    fireEvent.click(screen.getByRole('button', { name: '作成' }))

    await waitFor(() => {
      expect(handleCreateProject).toHaveBeenCalledWith('New Project')
    })
    await waitFor(() => {
      expect(screen.queryByTestId('dialog-content')).toBeNull()
    })

    fireEvent.click(screen.getByRole('button', { name: 'dialog-open' }))
    expect(screen.queryByLabelText('説明（オプション）')).toBeNull()
    fireEvent.change(screen.getByLabelText('プロジェクト名 *'), {
      target: { value: 'Tmp' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    await waitFor(() => {
      expect(screen.queryByTestId('dialog-content')).toBeNull()
    })
  })

  it('プロジェクト名入力で Enter を押すと作成を実行する', async () => {
    const handleCreateProject = vi.fn()
    render(
      <CustomProjectSection
        {...createProps({
          handleCreateProject,
        })}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'dialog-open' }))

    fireEvent.change(screen.getByLabelText('プロジェクト名 *'), {
      target: { value: 'Enter Created Project' },
    })

    fireEvent.keyDown(screen.getByLabelText('プロジェクト名 *'), {
      key: 'Enter',
      code: 'Enter',
    })

    await waitFor(() => {
      expect(handleCreateProject).toHaveBeenCalledWith('Enter Created Project')
    })
  })

  it('Enter以外のキーでは送信せず、ダイアログcloseイベントでフォームをリセットする', async () => {
    const handleCreateProject = vi.fn()
    render(
      <CustomProjectSection
        {...createProps({
          handleCreateProject,
        })}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'dialog-open' }))

    fireEvent.change(screen.getByLabelText('プロジェクト名 *'), {
      target: { value: 'Temporary Name' },
    })
    fireEvent.keyDown(screen.getByLabelText('プロジェクト名 *'), {
      key: 'Escape',
      code: 'Escape',
    })

    expect(handleCreateProject).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'dialog-close' }))
    fireEvent.click(screen.getByRole('button', { name: 'dialog-open' }))

    await waitFor(() => {
// eslint-disable-next-line typescript/TS2339
      expect((screen.getByLabelText('プロジェクト名 *') as HTMLInputElement).value).toBe('')
    })
  })

  it('URLドラッグ開始/オーバー/終了でプロジェクト間移動を処理し状態をリセットする', async () => {
    const handleMoveUrlBetweenProjects = vi.fn()
    render(
      <CustomProjectSection
        {...createProps({
          handleMoveUrlBetweenProjects,
        })}
      />,
    )

// eslint-disable-next-line typescript/require-await
    await act(async () => {
      dndContextPropsRef.current.onDragStart?.({
        active: {
          id: 'https://a.com',
          data: {
            current: {
              type: 'url',
              url: 'https://a.com',
              projectId: 'project-1',
              title: 'URL A',
            },
          },
        },
      })
    })

    expect(screen.getByText('URL A')).toBeTruthy()
    expect(
      screen
        .getByTestId('project-card-project-1')
        .getAttribute('data-dragged-item'),
    ).toBe('https://a.com')
    expect(
      screen
        .getByTestId('project-card-project-1')
        .getAttribute('data-cross-project-url-drag-active'),
    ).toBe('false')

// eslint-disable-next-line typescript/require-await
    await act(async () => {
      dndContextPropsRef.current.onDragOver?.({
        active: { data: { current: { type: 'url', projectId: 'project-1' } } },
        over: { data: { current: { projectId: 'project-1' } } },
      })
    })
    expect(
      screen
        .getByTestId('project-card-project-2')
        .getAttribute('data-drop-target'),
    ).toBe('false')
    expect(
      screen
        .getByTestId('project-card-project-1')
        .getAttribute('data-cross-project-url-drag-active'),
    ).toBe('false')

// eslint-disable-next-line typescript/require-await
    await act(async () => {
      dndContextPropsRef.current.onDragOver?.({
        active: { data: { current: { type: 'url', projectId: 'project-1' } } },
        over: { data: { current: { projectId: 'project-2' } } },
      })
    })
    expect(
      screen
        .getByTestId('project-card-project-2')
        .getAttribute('data-drop-target'),
    ).toBe('true')
    expect(
      screen
        .getByTestId('project-card-project-1')
        .getAttribute('data-cross-project-url-drag-active'),
    ).toBe('true')
    expect(
      screen
        .getByTestId('project-card-project-2')
        .getAttribute('data-cross-project-url-drag-active'),
    ).toBe('true')

// eslint-disable-next-line typescript/require-await
    await act(async () => {
      dndContextPropsRef.current.onDragOver?.({
        active: { data: { current: { type: 'url', projectId: 'project-1' } } },
        over: undefined,
      })
    })
    expect(
      screen
        .getByTestId('project-card-project-1')
        .getAttribute('data-cross-project-url-drag-active'),
    ).toBe('true')

// eslint-disable-next-line typescript/require-await
    await act(async () => {
      dndContextPropsRef.current.onDragEnd?.({
        active: {
          id: 'https://a.com',
          data: { current: { type: 'url', projectId: 'project-1' } },
        },
        over: {
          data: { current: { type: 'project', projectId: 'project-2' } },
        },
      })
    })

    expect(handleMoveUrlBetweenProjects).toHaveBeenCalledWith(
      'project-1',
      'project-2',
      'https://a.com',
    )
    expect(
      screen
        .getByTestId('project-card-project-2')
        .getAttribute('data-drop-target'),
    ).toBe('false')
    expect(
      screen
        .getByTestId('project-card-project-1')
        .getAttribute('data-cross-project-url-drag-active'),
    ).toBe('false')
  })

  it('ドロップ先 type が project 以外でも projectId があればプロジェクト間移動する', async () => {
    const handleMoveUrlBetweenProjects = vi.fn()
    render(
      <CustomProjectSection
        {...createProps({
          handleMoveUrlBetweenProjects,
        })}
      />,
    )

// eslint-disable-next-line typescript/require-await
    await act(async () => {
      dndContextPropsRef.current.onDragEnd?.({
        active: {
          id: 'https://from-uncategorized.com',
          data: {
            current: { type: 'url', projectId: 'custom-uncategorized' },
          },
        },
        over: {
          data: { current: { type: 'url', projectId: 'project-2' } },
        },
      })
    })

    expect(handleMoveUrlBetweenProjects).toHaveBeenCalledWith(
      'custom-uncategorized',
      'project-2',
      'https://from-uncategorized.com',
    )
  })

  it('ドロップ先 data に projectId がない場合は over.id からターゲットを解決する', async () => {
    const handleMoveUrlBetweenProjects = vi.fn()
    render(
      <CustomProjectSection
        {...createProps({
          handleMoveUrlBetweenProjects,
        })}
      />,
    )

// eslint-disable-next-line typescript/require-await
    await act(async () => {
      dndContextPropsRef.current.onDragEnd?.({
        active: {
          id: 'https://fallback-project.com',
          data: { current: { type: 'url', projectId: 'custom-uncategorized' } },
        },
        over: {
          id: 'project-project-2',
          data: { current: {} },
        },
      })
    })

// eslint-disable-next-line typescript/require-await
    await act(async () => {
      dndContextPropsRef.current.onDragEnd?.({
        active: {
          id: 'https://fallback-uncategorized.com',
          data: { current: { type: 'url', projectId: 'project-1' } },
        },
        over: {
          id: 'uncategorized-project-2',
          data: { current: {} },
        },
      })
    })

    expect(handleMoveUrlBetweenProjects).toHaveBeenNthCalledWith(
      1,
      'custom-uncategorized',
      'project-2',
      'https://fallback-project.com',
    )
    expect(handleMoveUrlBetweenProjects).toHaveBeenNthCalledWith(
      2,
      'project-1',
      'project-2',
      'https://fallback-uncategorized.com',
    )
  })

  it('ヘッダー drop target の over.id からターゲットプロジェクトを解決する', async () => {
    const handleMoveUrlBetweenProjects = vi.fn()
    render(
      <CustomProjectSection
        {...createProps({
          handleMoveUrlBetweenProjects,
        })}
      />,
    )

// eslint-disable-next-line typescript/require-await
    await act(async () => {
      dndContextPropsRef.current.onDragEnd?.({
        active: {
          id: 'https://header-drop.example.com',
          data: { current: { type: 'url', projectId: 'project-1' } },
        },
        over: {
          id: 'project-header-project-2',
          data: { current: {} },
        },
      })
    })

    expect(handleMoveUrlBetweenProjects).toHaveBeenCalledWith(
      'project-1',
      'project-2',
      'https://header-drop.example.com',
    )
  })

  it('ドラッグ中に active.data.current が消えても直前の URL ドラッグ情報で移動を継続する', async () => {
    const handleMoveUrlBetweenProjects = vi.fn()
    render(
      <CustomProjectSection
        {...createProps({
          handleMoveUrlBetweenProjects,
        })}
      />,
    )

// eslint-disable-next-line typescript/require-await
    await act(async () => {
      dndContextPropsRef.current.onDragStart?.({
        active: {
          id: 'https://latched.example.com',
          data: {
            current: {
              type: 'url',
              projectId: 'custom-uncategorized',
              title: 'Latched URL',
              url: 'https://latched.example.com',
            },
          },
        },
      })
    })

// eslint-disable-next-line typescript/require-await
    await act(async () => {
      dndContextPropsRef.current.onDragOver?.({
        active: {
          id: 'https://latched.example.com',
          data: { current: null },
        },
        over: {
          id: 'project-project-2',
          data: { current: { type: 'project', projectId: 'project-2' } },
        },
      })
    })

// eslint-disable-next-line typescript/require-await
    await act(async () => {
      dndContextPropsRef.current.onDragEnd?.({
        active: {
          id: 'https://latched.example.com',
          data: { current: null },
        },
        over: {
          id: 'project-project-2',
          data: { current: { type: 'project', projectId: 'project-2' } },
        },
      })
    })

    expect(handleMoveUrlBetweenProjects).toHaveBeenCalledWith(
      'custom-uncategorized',
      'project-2',
      'https://latched.example.com',
    )
  })

  it('ドラッグ中に active.data.current が空オブジェクトでも保持済み URL ドラッグ情報を使う', async () => {
    const handleMoveUrlBetweenProjects = vi.fn()
    render(
      <CustomProjectSection
        {...createProps({
          handleMoveUrlBetweenProjects,
        })}
      />,
    )

// eslint-disable-next-line typescript/require-await
    await act(async () => {
      dndContextPropsRef.current.onDragStart?.({
        active: {
          id: 'https://latched-empty.example.com',
          data: {
            current: {
              type: 'url',
              projectId: 'custom-uncategorized',
              title: 'Latched Empty URL',
              url: 'https://latched-empty.example.com',
            },
          },
        },
      })
    })

// eslint-disable-next-line typescript/require-await
    await act(async () => {
      dndContextPropsRef.current.onDragOver?.({
        active: {
          id: 'https://latched-empty.example.com',
          data: { current: {} },
        },
        over: {
          id: 'project-project-2',
          data: { current: { type: 'project', projectId: 'project-2' } },
        },
      })
    })

// eslint-disable-next-line typescript/require-await
    await act(async () => {
      dndContextPropsRef.current.onDragEnd?.({
        active: {
          id: 'https://latched-empty.example.com',
          data: { current: {} },
        },
        over: {
          id: 'project-project-2',
          data: { current: { type: 'project', projectId: 'project-2' } },
        },
      })
    })

    expect(handleMoveUrlBetweenProjects).toHaveBeenCalledWith(
      'custom-uncategorized',
      'project-2',
      'https://latched-empty.example.com',
    )
  })

  it('over.id が文字列以外・未対応文字列なら移動しない', async () => {
    const handleMoveUrlBetweenProjects = vi.fn()
    render(
      <CustomProjectSection
        {...createProps({
          handleMoveUrlBetweenProjects,
        })}
      />,
    )

// eslint-disable-next-line typescript/require-await
    await act(async () => {
      dndContextPropsRef.current.onDragEnd?.({
        active: {
          id: 'https://invalid-over-id.com',
          data: { current: { type: 'url', projectId: 'project-1' } },
        },
        over: {
          id: 123,
          data: { current: {} },
        },
      })
    })

// eslint-disable-next-line typescript/require-await
    await act(async () => {
      dndContextPropsRef.current.onDragEnd?.({
        active: {
          id: 'https://unknown-over-id.com',
          data: { current: { type: 'url', projectId: 'project-1' } },
        },
        over: {
          id: 'category-drop',
          data: { current: {} },
        },
      })
    })

    expect(handleMoveUrlBetweenProjects).not.toHaveBeenCalled()
  })

  it('プロジェクトドラッグの順序変更を処理し、無効ケースでは何もしない', () => {
    const handleReorderProjects = vi.fn()
    render(
      <CustomProjectSection
        {...createProps({
          handleReorderProjects,
        })}
      />,
    )

    act(() => {
      dndContextPropsRef.current.onDragStart?.({
        active: {
          data: { current: { type: 'project', projectId: 'project-1' } },
        },
      })
    })
    expect(screen.getAllByText('Project One').length).toBe(2)
    expect(
      screen
        .getByTestId('project-card-project-1')
        .getAttribute('data-project-reorder-mode'),
    ).toBe('true')

    act(() => {
      dndContextPropsRef.current.onDragEnd?.({
        active: {
          id: 'project-1',
          data: { current: { type: 'project' } },
        },
        over: { id: 'project-2' },
      })
    })

    expect(arrayMoveMock).toHaveBeenCalledWith(['project-1', 'project-2'], 0, 1)
    expect(handleReorderProjects).toHaveBeenCalledWith([
      'project-2',
      'project-1',
    ])
    expect(
      screen
        .getByTestId('project-card-project-1')
        .getAttribute('data-project-reorder-mode'),
    ).toBe('false')

    act(() => {
      dndContextPropsRef.current.onDragEnd?.({
        active: { id: 'project-1', data: { current: { type: 'project' } } },
        over: { id: 'project-1' },
      })
    })
    expect(handleReorderProjects).toHaveBeenCalledTimes(1)
  })

  it('各種DnDの早期return分岐（dataなし・別タイプ・同一プロジェクト・overなし・handlerなし）を通す', () => {
    render(
      <CustomProjectSection
        {...createProps({
          handleReorderProjects: undefined,
          handleMoveUrlBetweenProjects: undefined,
        })}
      />,
    )

    act(() => {
      dndContextPropsRef.current.onDragStart?.({ active: { data: {} } })
      dndContextPropsRef.current.onDragStart?.({
        active: {
          data: { current: { type: 'project', projectId: 'missing' } },
        },
      })
      dndContextPropsRef.current.onDragStart?.({
        active: {
          data: { current: { type: 'url', url: 'https://untitled.com' } },
        },
      })
      dndContextPropsRef.current.onDragOver?.({
        active: { data: { current: { type: 'project' } } },
        over: { data: { current: { projectId: 'project-2' } } },
      })
      dndContextPropsRef.current.onDragStart?.({
        active: {
          data: {
            current: {
              type: 'url',
              url: 'https://untitled.com',
              projectId: 'project-1',
              title: '',
            },
          },
        },
      })
    })
    expect(
      screen
        .getByTestId('project-card-project-2')
        .getAttribute('data-drop-target'),
    ).toBe('false')

    act(() => {
      dndContextPropsRef.current.onDragEnd?.({
        active: {
          id: 'project-1',
          data: { current: { type: 'project' } },
        },
        over: { id: 'project-2' },
      })

      dndContextPropsRef.current.onDragEnd?.({
        active: {
          id: 'https://same.com',
          data: { current: { type: 'url', projectId: 'project-1' } },
        },
        over: {
          data: { current: { type: 'project', projectId: 'project-1' } },
        },
      })

      dndContextPropsRef.current.onDragEnd?.({
        active: {
          id: 'https://none.com',
          data: { current: { type: 'url', projectId: 'project-1' } },
        },
        over: undefined,
      })

      dndContextPropsRef.current.onDragEnd?.({
        active: {
          id: 'https://x.com',
          data: { current: { type: 'url', projectId: 'project-1' } },
        },
        over: {
          data: { current: { type: 'project', projectId: 'project-2' } },
        },
      })

      dndContextPropsRef.current.onDragEnd?.({
        active: {
          id: 'https://x.com',
          data: { current: { type: 'url', projectId: 'project-1' } },
        },
        over: { data: { current: { type: 'url', projectId: 'project-2' } } },
      })
    })

    expect(screen.queryByText('https://x.com')).toBeNull()
  })
})
