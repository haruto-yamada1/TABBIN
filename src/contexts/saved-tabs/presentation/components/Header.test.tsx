// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import type { UserSettingsDto } from '@/contexts/saved-tabs/domain/dto/UserSettingsDto'
import type { CustomProject, TabGroup, ViewMode } from '@/types/storage'

const headerI18nState = vi.hoisted(() => ({
  language: 'ja' as 'en' | 'ja',
}))

const { toastErrorSpy, toastSuccessSpy, categoryModalSpy, viewModeToggleSpy } =
  vi.hoisted(() => ({
    toastErrorSpy: vi.fn(),
    toastSuccessSpy: vi.fn(),
    categoryModalSpy: vi.fn(),
    viewModeToggleSpy: vi.fn(),
  }))

vi.mock('sonner', () => ({
  toast: {
    error: toastErrorSpy,
    success: toastSuccessSpy,
  },
}))

vi.mock('@/features/i18n/context/I18nProvider', async () => {
  const { getMessages } = await vi.importActual<
    // eslint-disable-next-line typescript/consistent-type-imports
    typeof import('@/features/i18n/messages')
  >('@/features/i18n/messages')

  return {
    useI18n: () => ({
      language: headerI18nState.language,
      t: (key: string, fallback?: string, values?: Record<string, string>) => {
        const messages = getMessages(headerI18nState.language)
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

vi.mock('./CategoryModal', () => ({
  CategoryModal: ({
    onClose,
    tabGroups,
  }: {
    onClose: () => void
    tabGroups: TabGroup[]
  }) => {
    categoryModalSpy({ onClose, tabGroups })
    return (
      <div data-testid='category-modal'>
        <button onClick={onClose} type='button'>
          close-category-modal
        </button>
      </div>
    )
  },
}))

vi.mock('./ViewModeToggle', () => ({
  ViewModeToggle: ({
    currentMode,
    onChange,
  }: {
    currentMode: ViewMode
    onChange: (mode: ViewMode) => void
  }) => {
    viewModeToggleSpy({ currentMode, onChange })
    return (
      <button
        // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
        onClick={() => {
          onChange('custom')
        }}
        type='button'
      >
        view-mode-toggle
      </button>
    )
  },
}))

vi.mock('@/components/ui/tooltip', () => ({
  // eslint-disable-next-line react/jsx-no-useless-fragment
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => (
    // eslint-disable-next-line react/jsx-no-useless-fragment
    <>{children}</>
  ),
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))

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
      {/* eslint-disable-next-line react-perf/jsx-no-new-function-as-prop */}
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
}))

import { Header } from './Header'

const createTabGroups = (): TabGroup[] => [
  {
    id: 'group-1',
    domain: 'example.com',
    urls: [
      { url: 'https://example.com/1', title: 'One' },
      { url: 'https://example.com/2', title: 'Two' },
    ],
  },
  {
    id: 'group-2',
    domain: 'example.org',
    urls: [{ url: 'https://example.org/1', title: 'Three' }],
  },
]

const createCustomProjects = (): CustomProject[] => [
  {
    id: 'project-1',
    name: 'Project A',
    categories: ['既存カテゴリ'],
    createdAt: 1,
    updatedAt: 2,
    urls: [],
  },
]

const createProps = (
  overrides: Partial<React.ComponentProps<typeof Header>> = {},
) => ({
  tabGroups: createTabGroups(),
  filteredTabGroups: undefined,
  currentMode: 'domain' as ViewMode,
  onModeChange: vi.fn(),
  searchQuery: '',
  onSearchChange: vi.fn(),
  customProjects: createCustomProjects(),
  onCreateProject: vi.fn(),
  getSavedTabsPageDataQuery: vi.fn(() =>
    Promise.resolve({
      tabGroups: [],
      parentCategories: [],
      userSettings: {} as UserSettingsDto,
    }),
  ),
  ...overrides,
})

describe('Header', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    headerI18nState.language = 'ja'
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('検索入力変更・クリア・件数表示を処理する', () => {
    const onSearchChange = vi.fn()

    render(
      <Header
        {...createProps({
          searchQuery: 'abc',
          onSearchChange,
          filteredTabGroups: [createTabGroups()[0]],
        })}
      />,
    )

    fireEvent.change(screen.getByPlaceholderText('検索'), {
      target: { value: 'next' },
    })
    expect(onSearchChange).toHaveBeenCalledWith('next')

    const clearButton = screen.getByRole('button', { name: '検索をクリア' })
    fireEvent.click(clearButton)
    expect(onSearchChange).toHaveBeenCalledWith('')

    expect(screen.getByText('タブ:2')).toBeTruthy()
    expect(screen.getByText('ドメイン:1')).toBeTruthy()
  })

  it('renders English header copy when the display language is en', () => {
    headerI18nState.language = 'en'

    render(<Header {...createProps()} />)

    expect(screen.getByPlaceholderText('Search')).toBeTruthy()
    expect(screen.getByText('Tabs:3')).toBeTruthy()
    expect(screen.getByText('Domains:2')).toBeTruthy()
    expect(
      screen.getByRole('button', { name: /Manage parent categories/ }),
    ).toBeTruthy()
  })

  it('urlIds のみを持つグループでもタブ件数を表示できる', () => {
    const filteredTabGroups = [
      {
        id: 'group-1',
        domain: 'Domain A',
        urlIds: ['url-1', 'url-2'],
      },
    ] as unknown as TabGroup[]

    const filteredCustomProjects = [
      {
        id: 'custom-project-1',
        name: 'Project A',
        urlIds: ['url-1', 'url-2'],
      },
    ] as unknown as CustomProject[]

    const { rerender } = render(
      <Header
        {...createProps({
          currentMode: 'domain',
          filteredTabGroups,
        })}
      />,
    )

    expect(screen.getByText('タブ:2')).toBeTruthy()
    expect(screen.getByText('ドメイン:1')).toBeTruthy()

    rerender(
      <Header
        {...createProps({
          currentMode: 'custom',
          filteredCustomProjects,
        })}
      />,
    )

    expect(screen.getByText('タブ:2')).toBeTruthy()
    expect(screen.getByText('プロジェクト:1')).toBeTruthy()
  })

  it('custom モードでは検索なしなら urlIds を優先してタブ件数を表示する', () => {
    const customProjects = [
      {
        id: 'custom-project-1',
        name: 'Project A',
        categories: [],
        createdAt: 1,
        updatedAt: 1,
        urls: [{ url: 'https://example.com/legacy', title: 'Legacy' }],
        urlIds: ['url-1', 'url-2', 'url-3'],
      },
    ] as CustomProject[]

    render(
      <Header
        {...createProps({
          currentMode: 'custom',
          customProjects,
        })}
      />,
    )

    expect(screen.getByText('タブ:3')).toBeTruthy()
    expect(screen.getByText('プロジェクト:1')).toBeTruthy()
  })

  it('custom モードでは検索中なら filtered urls の件数を優先する', () => {
    const customProjects = [
      {
        id: 'custom-project-1',
        name: 'Project A',
        categories: [],
        createdAt: 1,
        updatedAt: 1,
        urlIds: ['url-1', 'url-2', 'url-3'],
      },
    ] as CustomProject[]
    const filteredCustomProjects = [
      {
        ...customProjects[0],
        urls: [{ url: 'https://example.com/matched', title: 'Matched' }],
      },
    ] as CustomProject[]

    render(
      <Header
        {...createProps({
          currentMode: 'custom',
          searchQuery: 'matched',
          customProjects,
          filteredCustomProjects,
        })}
      />,
    )

    expect(screen.getByText('タブ:1')).toBeTruthy()
    expect(screen.getByText('プロジェクト:1')).toBeTruthy()
  })

  it('domain モードで親カテゴリ管理モーダルを開閉し ViewModeToggle を描画する', () => {
    render(<Header {...createProps()} />)

    expect(viewModeToggleSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        currentMode: 'domain',
      }),
    )

    fireEvent.click(screen.getByRole('button', { name: /親カテゴリ管理/ }))
    expect(screen.getByTestId('category-modal')).toBeTruthy()
    expect(categoryModalSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        tabGroups: createProps().tabGroups,
      }),
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'close-category-modal' }),
    )
    expect(screen.queryByTestId('category-modal')).toBeNull()
  })

  it('custom モードでプロジェクト追加ダイアログの Enter 分岐（空/重複/成功）を処理する', () => {
    const onCreateProject = vi.fn()
    const customProjects = createCustomProjects()

    render(
      <Header
        {...createProps({
          currentMode: 'custom',
          customProjects,
          onCreateProject,
        })}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /プロジェクト追加/ }))
    const input = screen.getByPlaceholderText('例: 仕事、調査、後で読む')

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(toastErrorSpy).toHaveBeenCalledWith(
      'プロジェクト名を入力してください',
    )

    fireEvent.change(input, { target: { value: 'Project A' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(toastErrorSpy).toHaveBeenCalledWith(
      '同じプロジェクト名は追加できません',
    )

    fireEvent.change(input, { target: { value: '新プロジェクト' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onCreateProject).toHaveBeenCalledTimes(1)
    expect(onCreateProject).toHaveBeenCalledWith('新プロジェクト')
    expect(toastSuccessSpy).toHaveBeenCalledWith(
      'プロジェクト「新プロジェクト」を追加しました',
    )
    expect(screen.queryByTestId('dialog-content')).toBeNull()
  })

  it('IME 変換中の Enter ではプロジェクト追加しない', () => {
    const onCreateProject = vi.fn()

    render(
      <Header
        {...createProps({
          currentMode: 'custom',
          onCreateProject,
        })}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /プロジェクト追加/ }))
    const input = screen.getByPlaceholderText('例: 仕事、調査、後で読む')
    fireEvent.change(input, { target: { value: '新プロジェクト' } })
    fireEvent.keyDown(input, {
      key: 'Enter',
      isComposing: true,
      keyCode: 229,
    })

    expect(onCreateProject).not.toHaveBeenCalled()
    expect(toastSuccessSpy).not.toHaveBeenCalled()
  })

  it('customProjects が空でもプロジェクト追加できる', () => {
    const onCreateProject = vi.fn()

    render(
      <Header
        {...createProps({
          currentMode: 'custom',
          customProjects: [],
          onCreateProject,
        })}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /プロジェクト追加/ }))
    const input = screen.getByPlaceholderText('例: 仕事、調査、後で読む')
    fireEvent.change(input, { target: { value: '新プロジェクト' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onCreateProject).toHaveBeenCalledTimes(1)
    expect(onCreateProject).toHaveBeenCalledWith('新プロジェクト')
  })

  it('Dialog の onOpenChange で custom プロジェクトダイアログを閉じる', () => {
    render(
      <Header
        {...createProps({
          currentMode: 'custom',
        })}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /プロジェクト追加/ }))
    expect(screen.getByTestId('dialog-content')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'dialog-close' }))
    expect(screen.queryByTestId('dialog-content')).toBeNull()
  })

  it('Enter 以外のキーでは追加せず、onCreateProject 未指定時のデフォルト関数でも成功分岐を通る', () => {
    render(
      <Header
        {...(createProps({
          currentMode: 'custom',
          customProjects: [
            {
              id: 'p1',
              name: 'p1',
              categories: [],
              createdAt: 0,
              updatedAt: 0,
              urls: undefined,
            },
            {
              id: 'p2',
              name: 'p2',
              categories: [],
              createdAt: 0,
              updatedAt: 0,
              urls: [],
            },
          ],
          filteredCustomProjects: undefined,
        }) as React.ComponentProps<typeof Header>)}
        onCreateProject={undefined as unknown as (name: string) => void}
      />,
    )

    expect(screen.getByText('タブ:0')).toBeTruthy()
    expect(screen.getByText('プロジェクト:2')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /プロジェクト追加/ }))
    const input = screen.getByPlaceholderText('例: 仕事、調査、後で読む')

    fireEvent.change(input, { target: { value: 'プロジェクトX' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(toastSuccessSpy).not.toHaveBeenCalled()

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(toastSuccessSpy).toHaveBeenCalledWith(
      'プロジェクト「プロジェクトX」を追加しました',
    )
    expect(screen.queryByTestId('dialog-content')).toBeNull()
  })
})
