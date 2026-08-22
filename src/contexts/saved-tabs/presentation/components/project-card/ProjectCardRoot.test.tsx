// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import type { CustomProjectCardProps } from '@/contexts/saved-tabs/presentation/types/CustomProjectCard.types'
import type { SavedTabsUserSettingsDto as UserSettings } from '@/contexts/saved-tabs/presentation/types/SavedTabsCompatibilityViewModel'

const projectCardRootI18nState = vi.hoisted(() => ({
  language: 'ja' as 'en' | 'ja',
}))

const {
  useSortableMock,
  useDroppableMock,
  projectDragListenerMock,
  useCustomProjectCardMock,
  registerHandlersMock,
  unregisterHandlersMock,
} = vi.hoisted(() => ({
  useSortableMock: vi.fn(),
  useDroppableMock: vi.fn(),
  projectDragListenerMock: vi.fn(),
  useCustomProjectCardMock: vi.fn(),
  registerHandlersMock: vi.fn(),
  unregisterHandlersMock: vi.fn(),
}))

vi.mock('@dnd-kit/sortable', () => ({
  sortableKeyboardCoordinates: vi.fn(),
  useSortable: useSortableMock,
}))

vi.mock('@dnd-kit/core', () => ({
  KeyboardSensor: vi.fn(),
  PointerSensor: vi.fn(),
  useDroppable: useDroppableMock,
  useSensor: vi.fn(() => 'sensor'),
  useSensors: vi.fn(() => ['sensor']),
}))

vi.mock('@dnd-kit/utilities', () => ({
  CSS: {
    Transform: {
      toString: () => undefined,
    },
  },
}))

vi.mock('@/components/ui/card', () => ({
  Card: ({
    children,
    ...props
  }: { children: React.ReactNode } & Record<string, unknown>) => (
    <div data-testid='card' {...props}>
      {children}
    </div>
  ),
  CardContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='card-content'>{children}</div>
  ),
  CardHeader: ({
    children,
    ...props
  }: { children: React.ReactNode } & Record<string, unknown>) => (
    <div data-testid='card-header' {...props}>
      {children}
    </div>
  ),
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))

vi.mock('../../hooks/useCustomProjectCard', () => ({
  useCustomProjectCard: useCustomProjectCardMock,
}))

vi.mock('./ProjectCardContext', () => ({
  ProjectCardContext: ({
    children,
  }: {
    children: React.ReactNode
    value: unknown
  }) => <>{children}</>,
}))

vi.mock('../DragHandlersContext', () => ({
  useDragHandlers: () => ({
    registerHandlers: registerHandlersMock,
    unregisterHandlers: unregisterHandlersMock,
  }),
}))

vi.mock('@/features/i18n/context/I18nProvider', async () => {
  const { getMessages } = await vi.importActual<
    // eslint-disable-next-line typescript/consistent-type-imports
    typeof import('@/features/i18n/messages')
  >('@/features/i18n/messages')

  return {
    useI18n: () => ({
      language: projectCardRootI18nState.language,
      t: (key: string, fallback?: string, values?: Record<string, string>) => {
        const messages = getMessages(projectCardRootI18nState.language)
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

import { ProjectCardRoot } from './ProjectCardRoot'

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

const createProps = (overrides?: Partial<CustomProjectCardProps>) => {
  const project: CustomProjectCardProps['project'] = {
    id: 'project-1',
    name: 'Project A',
    categories: [],
    createdAt: 1,
    updatedAt: 1,
    ...overrides?.project,
  }

  return {
    project,
    settings: defaultSettings,
    handlers: {
      handleOpenUrl: vi.fn(),
      handleDeleteUrl: vi.fn(),
      handleAddCategory: vi.fn(),
      handleDeleteCategory: vi.fn(),
      handleRenameCategory: vi.fn(),
      handleSetUrlCategory: vi.fn(),
      handleOpenAllUrls: vi.fn(),
    },
    hookHandlers: {
      handleDeleteUrl: vi.fn(),
      handleSetUrlCategory: vi.fn(),
      handleUpdateCategoryOrder: vi.fn(),
      handleReorderUrls: vi.fn(),
    },
    ...(overrides?.draggedItem !== undefined
      ? { draggedItem: overrides.draggedItem }
      : {}),
    ...(overrides?.isDropTarget !== undefined
      ? { isDropTarget: overrides.isDropTarget }
      : {}),
    ...(overrides?.isProjectReorderMode !== undefined
      ? { isProjectReorderMode: overrides.isProjectReorderMode }
      : {}),
    ...(overrides?.isCrossProjectUrlDragActive !== undefined
      ? { isCrossProjectUrlDragActive: overrides.isCrossProjectUrlDragActive }
      : {}),
  }
}

const createHookState = (params?: {
  isLoadingUrls?: boolean
  projectUrlsLength?: number
  isDraggingCategory?: boolean
}) => ({
  urls: {
    projectUrls: Array.from({ length: params?.projectUrlsLength ?? 0 }, () => ({
      url: 'https://example.com',
      title: 'Example',
    })),
    setProjectUrls: vi.fn(),
    isLoadingUrls: params?.isLoadingUrls ?? false,
    uncategorizedUrls: [],
  },
  dnd: {
    collisionDetectionStrategy: vi.fn(),
    isDraggingCategory: params?.isDraggingCategory ?? false,
    draggedCategoryName: null,
    activeId: null,
    draggedOverCategory: null,
    setDraggedOverCategory: vi.fn(),
    setActiveId: vi.fn(),
    handleDragStart: vi.fn(),
    handleDragOver: vi.fn(),
    handleUrlDragEnd: vi.fn(),
    handleCategoryDragEnd: vi.fn(),
  },
  categoryOrder: [],
})

describe('ProjectCardRoot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    projectCardRootI18nState.language = 'ja'

    useSortableMock.mockReturnValue({
      setNodeRef: vi.fn(),
      transform: null,
      transition: undefined,
      isDragging: false,
      attributes: {
        'data-sortable-attr': 'project',
      },
      listeners: {
        onPointerDown: projectDragListenerMock,
      },
    })

    useDroppableMock.mockReturnValue({
      setNodeRef: vi.fn(),
      isOver: false,
    })

    useCustomProjectCardMock.mockReturnValue(createHookState())
  })

  afterEach(() => {
    cleanup()
  })

  it('プロジェクト名とドラッグハンドルを表示し、DnD コールバックを呼び出す', async () => {
    const props = createProps()
    const hookState = createHookState()
    useCustomProjectCardMock.mockReturnValue(hookState)

    render(
      <ProjectCardRoot {...props}>
        <div>children</div>
      </ProjectCardRoot>,
    )

    expect(screen.getByText('Project A')).toBeTruthy()
    expect(screen.queryByText('Project Description')).toBeNull()
    expect(screen.getByTestId('card').style.contentVisibility).toBe('auto')
    expect(screen.getByTestId('card').style.containIntrinsicSize).toBe('360px')

    // CardGroupTitle のルート div がドラッグハンドル（sortable listeners を受ける要素）
    const dragHandle = screen.getByTestId('card-group-title')
    // eslint-disable-next-line testing-library/prefer-user-event
    fireEvent.pointerDown(dragHandle)
    expect(projectDragListenerMock).toHaveBeenCalled()

    expect(registerHandlersMock).toHaveBeenCalledWith(
      props.project.id,
      expect.objectContaining({
        handleDragOver: hookState.dnd.handleDragOver,
        handleUrlDragEnd: hookState.dnd.handleUrlDragEnd,
      }),
    )

    expect(useDroppableMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'project-header-project-1',
        data: expect.objectContaining({
          projectId: 'project-1',
          type: 'project-header',
        }),
      }),
    )
  })

  it('カテゴリ並び替え中は handleCategoryDragEnd を呼ぶためのハンドラが登録される', () => {
    const props = createProps()
    const hookState = createHookState({
      isDraggingCategory: true,
    })
    useCustomProjectCardMock.mockReturnValue(hookState)

    render(
      <ProjectCardRoot {...props}>
        <div>children</div>
      </ProjectCardRoot>,
    )

    expect(registerHandlersMock).toHaveBeenCalledWith(
      props.project.id,
      expect.objectContaining({
        handleCategoryDragEnd: hookState.dnd.handleCategoryDragEnd,
      }),
    )
  })

  it('外部アイテムのドロップ誘導・ローディング表示・空状態の分岐を描画する', () => {
    useDroppableMock
      .mockReturnValueOnce({
        setNodeRef: vi.fn(),
        isOver: true,
      })
      .mockReturnValueOnce({
        setNodeRef: vi.fn(),
        isOver: true,
      })
    useCustomProjectCardMock.mockReturnValue(
      createHookState({
        isLoadingUrls: true,
      }),
    )

    render(
      <ProjectCardRoot
        {...createProps({
          draggedItem: {
            url: 'https://external.example.com',
            title: 'External URL',
            projectId: 'project-2',
          },
          isDropTarget: true,
        })}
      >
        <div>children</div>
      </ProjectCardRoot>,
    )

    expect(screen.getByRole('status')).toBeTruthy()
    expect(screen.queryByText('タブを読み込み中...')).toBeNull()
    expect(
      screen.queryByText('このプロジェクトにはタブがありません。'),
    ).toBeNull()
    expect(
      screen.getByTestId('card').className.includes('border-primary'),
    ).toBe(true)
  })

  it('renders English loading and empty copy when the display language is en', () => {
    projectCardRootI18nState.language = 'en'
    useCustomProjectCardMock.mockReturnValue(
      createHookState({
        isLoadingUrls: true,
      }),
    )

    const { rerender } = render(
      <ProjectCardRoot {...createProps()}>
        <div>children</div>
      </ProjectCardRoot>,
    )

    expect(screen.getByRole('status')).toBeTruthy()
    expect(screen.queryByText('Loading tabs...')).toBeNull()

    useCustomProjectCardMock.mockReturnValue(
      createHookState({
        isLoadingUrls: false,
        projectUrlsLength: 0,
      }),
    )

    rerender(
      <ProjectCardRoot {...createProps()}>
        <div>children</div>
      </ProjectCardRoot>,
    )

    const description = screen.getByTestId('project-empty-state')
    expect(description).toHaveTextContent('This project has no tabs.')
    expect(description).toHaveTextContent(
      'Save tabs from the extension icon or add them from the context menu.',
    )
  })

  it('ドラッグ中スタイルと外部ドロップ誘導のタイトルfallbackを表示する', () => {
    useSortableMock.mockReturnValueOnce({
      setNodeRef: vi.fn(),
      transform: null,
      transition: undefined,
      isDragging: true,
      attributes: {},
      listeners: {},
    })
    useDroppableMock
      .mockReturnValueOnce({
        setNodeRef: vi.fn(),
        isOver: true,
      })
      .mockReturnValueOnce({
        setNodeRef: vi.fn(),
        isOver: false,
      })
    useCustomProjectCardMock.mockReturnValue(
      createHookState({
        isLoadingUrls: false,
      }),
    )

    render(
      <ProjectCardRoot
        {...createProps({
          draggedItem: {
            url: 'https://fallback.example.com',
            title: '',
            projectId: 'project-2',
          },
          isDropTarget: true,
        })}
      >
        <div>children</div>
      </ProjectCardRoot>,
    )

    expect(screen.getByTestId('card').style.opacity).toBe('0.5')
    expect(
      screen.getByTestId('card').className.includes('border-primary'),
    ).toBe(true)
  })

  it('プロジェクト並び替えモードではカテゴリ表示を折りたたむ', () => {
    render(
      <ProjectCardRoot
        {...createProps({
          isProjectReorderMode: true,
        })}
      >
        <div>children</div>
      </ProjectCardRoot>,
    )

    expect(screen.getByRole('button', { name: '展開' })).toBeTruthy()
    expect(screen.queryByText('children')).toBeNull()
  })

  it('プロジェクト間URLドラッグ中はカテゴリ表示を折りたたむ', () => {
    render(
      <ProjectCardRoot
        {...createProps({
          isCrossProjectUrlDragActive: true,
        })}
      >
        <div>children</div>
      </ProjectCardRoot>,
    )

    expect(screen.getByRole('button', { name: '展開' })).toBeTruthy()
    expect(screen.queryByText('children')).toBeNull()
  })

  it('折りたたみボタンで表示を切り替え、並び替えボタンでソート順を循環できる', async () => {
    const user = userEvent.setup()
    render(
      <ProjectCardRoot {...createProps()}>
        <div>children</div>
      </ProjectCardRoot>,
    )

    const collapseButton = screen.getByRole('button', { name: '折りたたむ' })
    await user.click(collapseButton)
    expect(screen.queryByText('children')).toBeNull()

    await user.click(screen.getByRole('button', { name: '展開' }))
    expect(screen.getByText('children')).toBeTruthy()

    const sortButton = screen.getByRole('button', { name: 'デフォルト' })
    await user.click(sortButton)
    expect(screen.getByRole('button', { name: '保存日時の昇順' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '保存日時の昇順' }))
    expect(screen.getByRole('button', { name: '保存日時の降順' })).toBeTruthy()
  })
})
