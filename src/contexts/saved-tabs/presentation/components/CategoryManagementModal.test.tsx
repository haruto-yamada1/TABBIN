/* eslint-disable typescript/no-misused-promises, typescript/unbound-method, typescript/only-throw-error -- mock interface で sync callback を使う test idiom */
// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
// eslint-disable-next-line eslint/no-unused-vars
import { dirname, resolve } from 'node:path'
// eslint-disable-next-line eslint/no-unused-vars
import { fileURLToPath } from 'node:url'

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line
import { z } from 'zod'

import type {
  SavedTabsParentCategoryDto as ParentCategory,
  SavedTabsTabGroupDto as TabGroup,
  SavedTabsUserSettingsDto as UserSettingsDto,
} from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'
import type { AddDomainToParentCategoryUseCase } from '@/contexts/saved-tabs/application/use-cases/AddDomainToParentCategoryUseCase'
import type { DeleteParentCategoryUseCase } from '@/contexts/saved-tabs/application/use-cases/DeleteParentCategoryUseCase'
import type { RemoveDomainFromParentCategoryUseCase } from '@/contexts/saved-tabs/application/use-cases/RemoveDomainFromParentCategoryUseCase'
import type { RenameParentCategoryUseCase } from '@/contexts/saved-tabs/application/use-cases/RenameParentCategoryUseCase'
import type {
  CategoryManagementModalDeps,
  CategoryManagementModalUseCases,
} from '@/contexts/saved-tabs/presentation/components/CategoryManagementModal'
import { categoryNameSchema } from '@/contexts/saved-tabs/presentation/components/categoryNameSchema'

const categoryManagementModalI18nState = vi.hoisted(() => ({
  language: 'ja' as 'en' | 'ja',
}))

const { toastErrorSpy, toastSuccessSpy, buttonPropsSpy } = vi.hoisted(() => ({
  toastErrorSpy: vi.fn(),
  toastSuccessSpy: vi.fn(),
  buttonPropsSpy: vi.fn(),
}))

// chrome.storage 直叩きを置換した repository 経由で共有する storage 状態。
// 旧 `getMock` / `setMock` と同じ役割を in-memory ref で再現する
// （issue #502）。
const mockStateRef = vi.hoisted(() => ({
  current: {
    savedTabs: [] as TabGroup[],
    parentCategories: [] as ParentCategory[],
  },
}))

vi.mock('sonner', () => ({
  toast: {
    error: toastErrorSpy,
    success: toastSuccessSpy,
  },
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

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({
    open,
    onOpenChange,
    children,
  }: {
    open: boolean
    onOpenChange?: () => void
    children: React.ReactNode
  }) => (
    <div data-testid='dialog-root'>
      <button onClick={() => onOpenChange?.()} type='button'>
        dialog-close
      </button>
      {open ? children : null}
    </div>
  ),
  DialogContent: ({
    children,
    ...props
  }: { children: React.ReactNode } & Record<string, unknown>) => (
    <div data-testid='dialog-content' {...props}>
      {children}
    </div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
}))

vi.mock('@/components/ui/select', () => ({
  Select: ({
    children,
    value,
  }: {
    children: React.ReactNode
    value?: string
  }) => (
    <div data-testid='select-root' data-value={value}>
      {children}
    </div>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='select-trigger'>{children}</div>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => (
    <div>{placeholder}</div>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='select-content'>{children}</div>
  ),
  SelectItem: ({
    children,
    value,
  }: {
    children: React.ReactNode
    value: string
  }) => <div data-testid={`select-item-${value}`}>{children}</div>,
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    variant,
    size,
    asChild,
    type,
    ...props
  }: {
    children: React.ReactNode
    variant?: string
    size?: string
    asChild?: boolean
    type?: 'button' | 'submit' | 'reset'
  } & Record<string, unknown>) => {
    buttonPropsSpy({ children, variant, size, asChild, type, ...props })
    return (
      // eslint-disable-next-line react/button-has-type
      <button type={type ?? 'button'} {...props}>
        {children}
      </button>
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
      language: categoryManagementModalI18nState.language,
      t: (key: string, fallback?: string, values?: Record<string, string>) => {
        const messages = getMessages(categoryManagementModalI18nState.language)
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

import { CategoryManagementModal } from './CategoryManagementModal'

const getLatestButtonProps = (
  predicate: (props: Record<string, unknown>) => boolean,
) =>
  [...buttonPropsSpy.mock.calls]
    .map((call) => call[0] as Record<string, unknown>)
    .toReversed()
    .find(predicate)

const createDeferred = <T,>() => {
  let resolveRef!: (value: T | PromiseLike<T>) => void
  let rejectRef!: (reason?: unknown) => void
  const promise = new Promise<T>((resolve, reject) => {
    resolveRef = resolve
    rejectRef = reject
  })
  return { promise, resolve: resolveRef, reject: rejectRef }
}

const resetMockState = () => {
  mockStateRef.current = {
    savedTabs: [
      { id: 'g1', domain: 'a.com', urls: [] },
      { id: 'g2', domain: 'b.com', urls: [] },
    ],
    parentCategories: [
      {
        id: 'cat-1',
        name: '仕事',
        domains: ['g1'],
        domainNames: ['a.com'],
      },
    ],
  }
}

const createMockRepositories = () => {
  const tabGroupRepository = {
    saveAll: vi.fn(async (groups: readonly TabGroup[]) => {
      mockStateRef.current.savedTabs = [...groups]
    }),
  }
  const parentCategoryRepository = {
    saveAll: vi.fn(async (categories: readonly ParentCategory[]) => {
      mockStateRef.current.parentCategories = [...categories]
    }),
    removeByIds: vi.fn(async () => {}),
  }
  return { parentCategoryRepository, tabGroupRepository }
}

const createUseCases = (persistence: {
  saveAll: (categories: readonly ParentCategory[]) => Promise<void>
}): CategoryManagementModalUseCases => ({
  renameParentCategory: async ({ categoryId, newName }) => {
    const updated = mockStateRef.current.parentCategories.map((category) =>
      category.id === categoryId ? { ...category, name: newName } : category,
    )
    await persistence.saveAll(updated)
    return updated
  },
  addDomainToParentCategory: async ({ categoryId, domainId, domainName }) => {
    const target = mockStateRef.current.parentCategories.find(
      (category) => category.id === categoryId,
    )
    if (!target) {
      throw new Error('Parent category not found')
    }
    if (
      target.domains.includes(domainId) ||
      target.domainNames.includes(domainName)
    ) {
      throw new Error('Domain already exists')
    }
    const updated = mockStateRef.current.parentCategories.map((category) =>
      category.id === categoryId
        ? {
            ...category,
            domains: [...category.domains, domainId],
            domainNames: [...category.domainNames, domainName],
          }
        : category,
    )
    await persistence.saveAll(updated)
    return updated
  },
  removeDomainFromParentCategory: async ({
    categoryId,
    domainId,
    domainName,
  }) => {
    const target = mockStateRef.current.parentCategories.find(
      (category) => category.id === categoryId,
    )
    if (!target) {
      throw new Error('Parent category not found')
    }
    if (
      !target.domains.includes(domainId) &&
      !target.domainNames.includes(domainName)
    ) {
      throw new Error('Domain not found')
    }
    const updated = mockStateRef.current.parentCategories.map((category) =>
      category.id === categoryId
        ? {
            ...category,
            domains: category.domains.filter((id) => id !== domainId),
            domainNames: category.domainNames.filter(
              (name) => name !== domainName,
            ),
          }
        : category,
    )
    await persistence.saveAll(updated)
    return updated
  },
  deleteParentCategory: async ({ categoryId }) => {
    const removedCategory = mockStateRef.current.parentCategories.find(
      (category) => category.id === categoryId,
    )
    if (!removedCategory) {
      throw new Error('Parent category not found')
    }
    const all = mockStateRef.current.parentCategories.filter(
      (category) => category.id !== categoryId,
    )
    await persistence.saveAll(all)
    return { all, removedCategory }
  },
})

interface SetupMocksOptions {
  useCases?: Partial<CategoryManagementModalUseCases>
  state?: Partial<{ savedTabs: TabGroup[]; parentCategories: ParentCategory[] }>
}

const setupMocks = (options: SetupMocksOptions = {}) => {
  resetMockState()
  if (options.state) {
    mockStateRef.current = { ...mockStateRef.current, ...options.state }
  }
  const { tabGroupRepository, parentCategoryRepository } =
    createMockRepositories()
  const useCases: CategoryManagementModalUseCases = {
    ...createUseCases(parentCategoryRepository),
    ...options.useCases,
  }
  const categoryAssignmentPort = {
    saveParentCategories: vi.fn().mockResolvedValue(undefined),
    saveTabGroups: vi.fn().mockResolvedValue(undefined),
  }
  const getSavedTabsPageDataQuery = vi.fn(
    () =>
      Promise.resolve({
        tabGroups: [...mockStateRef.current.savedTabs],
        parentCategories: [...mockStateRef.current.parentCategories],
        userSettings: {} as UserSettingsDto,
        // domain entity (branded readonly) を storage shape へ投影する
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any,
  )
  const deps: CategoryManagementModalDeps = {
    categoryAssignmentPort,
    getSavedTabsPageDataQuery,
  }
  return {
    categoryAssignmentPort,
    deps,
    getSavedTabsPageDataQuery,
    parentCategoryRepository,
    tabGroupRepository,
    useCases,
  }
}

const createCategory = () => ({
  id: 'cat-1',
  name: '仕事',
})

const createDomains = (): TabGroup[] => [
  { id: 'g1', domain: 'a.com', urls: [] },
  { id: 'g2', domain: 'b.com', urls: [] },
]

describe('CategoryManagementModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    categoryManagementModalI18nState.language = 'ja'
    resetMockState()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(
      (cb: FrameRequestCallback) => {
        cb(0)
        return 1
      },
    )
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('shared ui button を使い、生の button 要素を残さない', () => {
    const source = readFileSync(
      resolve(import.meta.dirname, './CategoryManagementModal.tsx'),
      'utf8',
    )

    expect(source).not.toContain('<button')
  })

  it('isOpen=false のときは何も描画しない', () => {
    const { deps, useCases } = setupMocks()
    const { container } = render(
      <CategoryManagementModal
        isOpen={false}
        onClose={vi.fn()}
        category={createCategory()}
        domains={createDomains()}
        deps={deps}
        useCases={useCases}
      />,
    )

    expect(container.innerHTML).toBe('')
  })

  it('開いたときに初期化して利用可能ドメインを読み込み、通常時は閉じられる', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const { deps, useCases, getSavedTabsPageDataQuery } = setupMocks()
    render(
      <CategoryManagementModal
        isOpen
        onClose={onClose}
        category={createCategory()}
        domains={createDomains()}
        deps={deps}
        useCases={useCases}
      />,
    )

    await expect(
      screen.findByText('「仕事」の親カテゴリ管理'),
    ).resolves.toBeTruthy()
    expect(screen.getByText('a.com')).toBeTruthy()
    expect(screen.getByTestId('select-item-g2')).toBeTruthy()
    expect(getSavedTabsPageDataQuery).toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'dialog-close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('追加可能ドメインがない場合の初期状態を処理する', async () => {
    const { deps, useCases } = setupMocks({
      state: { savedTabs: [], parentCategories: [] },
    })

    render(
      <CategoryManagementModal
        isOpen
        onClose={vi.fn()}
        category={createCategory()}
        domains={[]}
        deps={deps}
        useCases={useCases}
      />,
    )

    await expect(
      screen.findByText('追加できるドメインがありません。'),
    ).resolves.toBeTruthy()
    expect(screen.queryByTestId('select-root')).toBeNull()
  })

  it('リネーム開始時に input を focus/select し Escape でキャンセルする', async () => {
    const user = userEvent.setup()
    let rafCallback: FrameRequestCallback | undefined
    ;(
      globalThis.requestAnimationFrame as unknown as ReturnType<typeof vi.fn>
    ).mockImplementationOnce((cb: FrameRequestCallback) => {
      rafCallback = cb
      return 1
    })

    const { deps, useCases } = setupMocks()
    render(
      <CategoryManagementModal
        isOpen
        onClose={vi.fn()}
        category={createCategory()}
        domains={createDomains()}
        deps={deps}
        useCases={useCases}
      />,
    )

    await user.click(screen.getByRole('button', { name: /親カテゴリ名を変更/ }))
    const input = (await screen.findByPlaceholderText(
      '例: ビジネスツール、技術情報',
    )) as HTMLInputElement

    using focusSpy = vi.spyOn(input, 'focus')
    using selectSpy = vi.spyOn(input, 'select')
    rafCallback?.(0)
    expect(focusSpy).toHaveBeenCalled()
    expect(selectSpy).toHaveBeenCalled()

    await user.type(input, '{Escape}')
    expect(
      screen.queryByPlaceholderText('例: ビジネスツール、技術情報'),
    ).toBeNull()
  })

  it('リネーム時の Enter/Blur 分岐（変更なし・バリデーション失敗・処理中・キャンセル）を処理する', async () => {
    const user = userEvent.setup()
    // eslint-disable-next-line typescript/no-invalid-void-type
    const deferredRename = createDeferred<void>()
    const renameParentCategory = vi.fn(
      async (command: { categoryId: string; newName: string }) => {
        mockStateRef.current.parentCategories =
          mockStateRef.current.parentCategories.map((cat) =>
            cat.id === (command.categoryId as unknown as string)
              ? { ...cat, name: command.newName }
              : cat,
          )
        await deferredRename.promise
        return mockStateRef.current.parentCategories
      },
    ) as unknown as RenameParentCategoryUseCase

    const { deps, useCases } = setupMocks({
      useCases: { renameParentCategory },
    })

    render(
      <CategoryManagementModal
        isOpen
        onClose={vi.fn()}
        category={createCategory()}
        domains={createDomains()}
        deps={deps}
        useCases={useCases}
      />,
    )

    await user.click(screen.getByRole('button', { name: /親カテゴリ名を変更/ }))
    let input = await screen.findByPlaceholderText(
      '例: ビジネスツール、技術情報',
    )

    // 変更なし Enter -> 早期 return
    await user.type(input, '{Enter}')
    expect(
      screen.getByPlaceholderText('例: ビジネスツール、技術情報'),
    ).toBeTruthy()

    // 再度開いて invalid Enter -> validate false で return
    fireEvent.blur(input)
    expect(
      screen.queryByPlaceholderText('例: ビジネスツール、技術情報'),
    ).toBeNull()
    await user.click(screen.getByRole('button', { name: /親カテゴリ名を変更/ }))
    input = await screen.findByPlaceholderText('例: ビジネスツール、技術情報')
    await user.clear(input)
    await user.type(input, '12345678901234567890123456')
    await user.type(input, '{Enter}')
    expect(
      screen.getByText('新規親カテゴリ名は25文字以下にしてください'),
    ).toBeTruthy()

    // エラーあり blur -> focus 維持
    using focusSpy = vi.spyOn(input, 'focus')
    fireEvent.blur(input)
    expect(focusSpy).toHaveBeenCalled()

    // Tab key -> Enter/Escape どちらでもない分岐
    await user.type(input, '{Tab}')

    // valid blur -> 保存開始
    await user.clear(input)
    await user.type(input, 'BlurSave')
    fireEvent.blur(input)
    await waitFor(() => {
      expect(renameParentCategory).toHaveBeenCalledWith(
        expect.objectContaining({
          categoryId: expect.anything(),
          newName: 'BlurSave',
        }),
      )
    })

    // 処理中 Enter/Blur は早期 return
    await user.type(input, '{Enter}')
    fireEvent.blur(input)

    await act(async () => {
      deferredRename.resolve()
    })

    await waitFor(() => {
      expect(toastSuccessSpy).toHaveBeenCalled()
    })

    // 再度開いて同名 blur -> キャンセル
    await user.click(screen.getByRole('button', { name: /親カテゴリ名を変更/ }))
    input = await screen.findByPlaceholderText('例: ビジネスツール、技術情報')
    await user.clear(input)
    await user.type(input, 'BlurSave')
    fireEvent.blur(input)
    expect(
      screen.queryByPlaceholderText('例: ビジネスツール、技術情報'),
    ).toBeNull()
  })

  it('リネーム開始/バリデーション/成功保存/closeガード（isRenaming）を処理する', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const renameParentCategory = vi.fn(
      async (command: { categoryId: string; newName: string }) => {
        mockStateRef.current.parentCategories =
          mockStateRef.current.parentCategories.map((cat) =>
            cat.id === (command.categoryId as unknown as string)
              ? { ...cat, name: command.newName }
              : cat,
          )
        return mockStateRef.current.parentCategories
      },
    ) as unknown as RenameParentCategoryUseCase
    const { deps, useCases } = setupMocks({
      useCases: { renameParentCategory },
    })

    render(
      <CategoryManagementModal
        isOpen
        onClose={onClose}
        category={createCategory()}
        domains={createDomains()}
        deps={deps}
        useCases={useCases}
      />,
    )

    await user.click(screen.getByRole('button', { name: /親カテゴリ名を変更/ }))
    const input = await screen.findByPlaceholderText(
      '例: ビジネスツール、技術情報',
    )

    await user.click(screen.getByRole('button', { name: 'dialog-close' }))
    expect(onClose).not.toHaveBeenCalled()

    await user.clear(input)
    fireEvent.blur(input)
    expect(screen.getByText('新規親カテゴリ名を入力してください')).toBeTruthy()

    await user.clear(input)
    await user.type(input, '12345678901234567890123456')
    expect(
      screen.getByText('新規親カテゴリ名は25文字以下にしてください'),
    ).toBeTruthy()

    await user.clear(input)
    await user.type(input, '新しいカテゴリ')
    await user.type(input, '{Enter}')

    await waitFor(() => {
      expect(renameParentCategory).toHaveBeenCalledWith(
        expect.objectContaining({
          categoryId: expect.anything(),
          newName: '新しいカテゴリ',
        }),
      )
      expect(toastSuccessSpy).toHaveBeenCalled()
    })

    expect(
      screen.queryByPlaceholderText('例: ビジネスツール、技術情報'),
    ).toBeNull()
  })

  it('リネーム失敗時（use-case throw / 確認失敗）に toast.error を出す', async () => {
    const user = userEvent.setup()
    // Sub-test 1: renameParentCategory use-case が throw する
    {
      const renameParentCategory = vi.fn(async () => {
        throw new Error('use-case failed')
      }) as unknown as RenameParentCategoryUseCase
      const { deps, useCases } = setupMocks({
        useCases: { renameParentCategory },
      })
      render(
        <CategoryManagementModal
          isOpen
          onClose={vi.fn()}
          category={createCategory()}
          domains={createDomains()}
          deps={deps}
          useCases={useCases}
        />,
      )

      await user.click(
        screen.getByRole('button', { name: /親カテゴリ名を変更/ }),
      )
      const input = await screen.findByPlaceholderText(
        '例: ビジネスツール、技術情報',
      )
      await user.clear(input)
    await user.type(input, '失敗1')
      await user.type(input, '{Enter}')

      await waitFor(() => {
        expect(toastErrorSpy).toHaveBeenCalledWith(
          '親カテゴリ名の更新に失敗しました',
        )
      })

      cleanup()
    }

    // Sub-test 2: renameParentCategory use-case が state を更新せず、戻り値検証で失敗する
    toastErrorSpy.mockClear()
    {
      const renameParentCategory = vi.fn(
        async () => mockStateRef.current.parentCategories,
      ) as unknown as RenameParentCategoryUseCase
      const { deps, useCases } = setupMocks({
        useCases: { renameParentCategory },
      })
      render(
        <CategoryManagementModal
          isOpen
          onClose={vi.fn()}
          category={createCategory()}
          domains={createDomains()}
          deps={deps}
          useCases={useCases}
        />,
      )

      await user.click(
        screen.getByRole('button', { name: /親カテゴリ名を変更/ }),
      )
      const input = await screen.findByPlaceholderText(
        '例: ビジネスツール、技術情報',
      )
      await user.clear(input)
    await user.type(input, '更新未反映')
      await user.type(input, '{Enter}')

      await waitFor(() => {
        expect(toastErrorSpy).toHaveBeenCalledWith(
          '親カテゴリ名の更新に失敗しました',
        )
      })
    }
  })

  it('リネーム use-case 戻り値が更新を反映しない場合にエラーとして処理する', async () => {
    const user = userEvent.setup()
    // issue #518 で `parentCategoryRepository.findById` による最終確認は
    // 撤廃され、use-case 戻り値検証 (1次検証) のみが残る。use-case が
    // 状態 (mockStateRef) を更新しない (古い name のまま返す) シナリオで
    // 1次検証が失敗することを検証する。
    const renameParentCategory = vi.fn(
      async (command: { categoryId: string; newName: string }) => {
        // 意図的に state を更新せず、元の name のまま返す
        return mockStateRef.current.parentCategories.map((cat) => ({
          ...cat,
          name:
            cat.id === (command.categoryId as unknown as string)
              ? cat.name
              : cat.name,
        }))
      },
    ) as unknown as RenameParentCategoryUseCase

    const { deps, useCases } = setupMocks({
      useCases: { renameParentCategory },
    })

    render(
      <CategoryManagementModal
        isOpen
        onClose={vi.fn()}
        category={createCategory()}
        domains={createDomains()}
        deps={deps}
        useCases={useCases}
      />,
    )

    await user.click(screen.getByRole('button', { name: /親カテゴリ名を変更/ }))
    const input = await screen.findByPlaceholderText(
      '例: ビジネスツール、技術情報',
    )
    await user.clear(input)
    await user.type(input, '更新後')
    await user.type(input, '{Enter}')

    await waitFor(() => {
      expect(renameParentCategory).toHaveBeenCalled()
      expect(toastErrorSpy).toHaveBeenCalledWith(
        '親カテゴリ名の更新に失敗しました',
      )
    })
  })

  it('リネーム保存で non-Error を投げた場合も stack なしでハンドリングする', async () => {
    const user = userEvent.setup()
    const renameParentCategory = vi.fn(async () => {
      // eslint-disable-next-line eslint/no-throw-literal
      throw 'string-error'
    }) as unknown as RenameParentCategoryUseCase
    const { deps, useCases } = setupMocks({
      useCases: { renameParentCategory },
    })

    render(
      <CategoryManagementModal
        isOpen
        onClose={vi.fn()}
        category={createCategory()}
        domains={createDomains()}
        deps={deps}
        useCases={useCases}
      />,
    )

    await user.click(screen.getByRole('button', { name: /親カテゴリ名を変更/ }))
    const input = await screen.findByPlaceholderText(
      '例: ビジネスツール、技術情報',
    )
    await user.clear(input)
    await user.type(input, 'string fail')
    await user.type(input, '{Enter}')

    await waitFor(() => {
      expect(
        (console.error as unknown as ReturnType<typeof vi.fn>).mock.calls.some(
          ([message, payload]) =>
            // eslint-disable-line
            message === 'Modal - カテゴリ名の更新に失敗:' &&
            payload &&
            typeof payload === 'object' &&
            'stack' in (payload as Record<string, unknown>) &&
            (payload as Record<string, unknown>).stack === undefined,
        ),
      ).toBe(true)
    })
  })

  it('リネーム保存時に validateCategoryName が false を返した場合は処理を中止する', async () => {
    const user = userEvent.setup()
    const renameParentCategory =
      vi.fn() as unknown as RenameParentCategoryUseCase
    const { deps, useCases } = setupMocks({
      useCases: { renameParentCategory },
    })

    render(
      <CategoryManagementModal
        isOpen
        onClose={vi.fn()}
        category={createCategory()}
        domains={createDomains()}
        deps={deps}
        useCases={useCases}
      />,
    )

    await user.click(screen.getByRole('button', { name: /親カテゴリ名を変更/ }))
    const input = await screen.findByPlaceholderText(
      '例: ビジネスツール、技術情報',
    )
    await user.clear(input)
    await user.type(input, 'valid-name')

    using _safeParseSpy = vi
      .spyOn(categoryNameSchema, 'safeParse')
      .mockImplementationOnce(
        () =>
          ({
            success: false,
            error: new z.ZodError([
              {
                code: 'custom',
                message: 'forced invalid',
                path: [],
              },
            ]),
          }) as ReturnType<typeof z.ZodString.prototype.safeParse>,
      )

    await user.type(input, '{Enter}')
    await waitFor(() => {
      expect(screen.getByText('カテゴリ名が無効です')).toBeTruthy()
    })
    expect(renameParentCategory).not.toHaveBeenCalled()
  })

  it('親カテゴリ削除の成功/失敗を処理する', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const { deps, useCases, parentCategoryRepository } = setupMocks()
    const { rerender } = render(
      <CategoryManagementModal
        isOpen
        onClose={onClose}
        category={createCategory()}
        domains={createDomains()}
        deps={deps}
        useCases={useCases}
      />,
    )

    await user.click(screen.getByRole('button', { name: /親カテゴリを削除/ }))
    await user.click(screen.getByRole('button', { name: /^削除$/ }))

    await waitFor(() => {
      // `deleteParentCategory` use-case 経由で削除される (issue #518)。
      // `parentCategoryRepository.saveAll` が呼ばれ、`removeByIds` は
      // 呼ばれないことを確認して DDD 依存方向を担保する。
      expect(parentCategoryRepository.saveAll).toHaveBeenCalled()
      expect(parentCategoryRepository.removeByIds).not.toHaveBeenCalled()
      expect(toastSuccessSpy).toHaveBeenCalledWith(
        'カテゴリ「仕事」を削除しました',
      )
      expect(onClose).toHaveBeenCalled()
    })

    // 失敗ケース: saveAll を reject させ、toast.error が表示されることを確認
    vi.mocked(parentCategoryRepository.saveAll).mockRejectedValueOnce(
      new Error('boom'),
    )
    // 失敗ケース用に state を再投入して再描画する
    mockStateRef.current.parentCategories = [
      { id: 'cat-1', name: '仕事', domains: ['g1'], domainNames: ['a.com'] },
    ]
    rerender(
      <CategoryManagementModal
        isOpen
        onClose={vi.fn()}
        category={createCategory()}
        domains={createDomains()}
        deps={deps}
        useCases={useCases}
      />,
    )
    await user.click(screen.getByRole('button', { name: /親カテゴリを削除/ }))
    await user.click(screen.getByRole('button', { name: /^削除$/ }))

    await waitFor(() => {
      expect(toastErrorSpy).toHaveBeenCalledWith('カテゴリの削除に失敗しました')
    })
  })

  it('親カテゴリ削除確認のキャンセル・関連ドメインなし表示・処理中の再入防止を処理する', async () => {
    const user = userEvent.setup()
    // eslint-disable-next-line typescript/no-invalid-void-type
    const deferredRemove = createDeferred<void>()
    const deleteParentCategory = vi.fn(
      async (command: { categoryId: string }) => {
        const idSet = new Set([command.categoryId as unknown as string])
        mockStateRef.current.parentCategories =
          mockStateRef.current.parentCategories.filter((c) => !idSet.has(c.id))
        const removed = mockStateRef.current.parentCategories.find(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (c) => c.id === (command.categoryId as unknown as string),
        )
        await deferredRemove.promise
        return {
          all: [...mockStateRef.current.parentCategories] as never,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          removedCategory: (removed ?? { id: command.categoryId }) as any,
        }
      },
    ) as unknown as DeleteParentCategoryUseCase
    const { deps, useCases } = setupMocks({
      useCases: { deleteParentCategory },
    })

    render(
      <CategoryManagementModal
        isOpen
        onClose={vi.fn()}
        category={createCategory()}
        domains={[]}
        deps={deps}
        useCases={useCases}
      />,
    )

    await user.click(screen.getByRole('button', { name: /親カテゴリを削除/ }))
    expect(screen.queryByText(/件のドメインが関連付けられています/)).toBeNull()
    await user.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(screen.queryByRole('button', { name: /^削除$/ })).toBeNull()

    await user.click(screen.getByRole('button', { name: /親カテゴリを削除/ }))
    await user.click(screen.getByRole('button', { name: /^削除$/ }))

    await waitFor(() => {
      expect(deleteParentCategory).toHaveBeenCalledTimes(1)
    })

    const deleteConfirmButtonProps = getLatestButtonProps(
      (props) =>
        props.variant === 'destructive' &&
        props.size === 'sm' &&
        props.onClick instanceof Function,
    ) as { onClick?: () => Promise<void> | void } | undefined
    await deleteConfirmButtonProps?.onClick?.()
    expect(deleteParentCategory).toHaveBeenCalledTimes(1)

    await act(async () => {
      deferredRemove.resolve()
    })
  })

  it('ドメイン追加の成功/重複エラーを処理する', async () => {
    const user = userEvent.setup()
    const [currentDomain] = createDomains()
    expect(currentDomain).toBeTruthy()
    if (!currentDomain) {
      throw new Error('currentDomain not found')
    }

    // 1 回目: 正常に追加できるシナリオ
    {
      const { deps, useCases } = setupMocks()
      render(
        <CategoryManagementModal
          isOpen
          onClose={vi.fn()}
          category={createCategory()}
          domains={[currentDomain]}
          deps={deps}
          useCases={useCases}
        />,
      )

      await screen.findByTestId('select-item-g2')
      const plusButton = screen.getByText('選択したドメインを親カテゴリに追加')
        .previousElementSibling as HTMLButtonElement | null
      expect(plusButton).toBeTruthy()
      if (!plusButton) {
        throw new Error('plusButton not found')
      }
      await user.click(plusButton)

      await waitFor(() => {
        // eslint-disable-next-line no-console
        process.stderr.write(
          `DEBUG: toastSuccess=${JSON.stringify(toastSuccessSpy.mock.calls)}\n`,
        )
        // eslint-disable-next-line no-console
        process.stderr.write(
          `DEBUG: toastError=${JSON.stringify(toastErrorSpy.mock.calls)}\n`,
        )
        // eslint-disable-next-line no-console
        process.stderr.write(
          `DEBUG: state=${JSON.stringify(mockStateRef.current.parentCategories)}\n`,
        )
        expect(toastSuccessSpy).toHaveBeenCalledWith(
          'ドメイン b.com を「仕事」に追加しました',
        )
      })

      cleanup()
    }

    // 2 回目: 不整合データで duplicate 分岐を通す
    {
      toastSuccessSpy.mockClear()
      const { deps, useCases } = setupMocks({
        state: {
          parentCategories: [
            {
              id: 'cat-1',
              name: '仕事',
              domains: [],
              domainNames: ['b.com'],
            },
          ],
          savedTabs: [{ id: 'g2', domain: 'b.com', urls: [] }],
        },
      })
      render(
        <CategoryManagementModal
          isOpen
          onClose={vi.fn()}
          category={createCategory()}
          domains={[]}
          deps={deps}
          useCases={useCases}
        />,
      )

      await screen.findByTestId('select-item-g2')
      const secondPlusButton = screen.getByText(
        '選択したドメインを親カテゴリに追加',
      ).previousElementSibling as HTMLButtonElement | null
      expect(secondPlusButton).toBeTruthy()
      if (!secondPlusButton) {
        throw new Error('secondPlusButton not found')
      }
      await user.click(secondPlusButton)

      await waitFor(() => {
        expect(toastErrorSpy).toHaveBeenCalledWith(
          'カテゴリの設定に失敗しました',
        )
      })
    }
  })

  it('ドメイン追加の残件選択・カテゴリ更新分岐・処理中再入防止を処理する', async () => {
    const user = userEvent.setup()
    const domains3: TabGroup[] = [
      { id: 'g1', domain: 'a.com', urls: [] },
      { id: 'g2', domain: 'b.com', urls: [] },
      { id: 'g3', domain: 'c.com', urls: [] },
    ]
    // eslint-disable-next-line typescript/no-invalid-void-type
    const deferredAdd = createDeferred<void>()
    const addDomainToParentCategory = vi.fn(
      async (command: {
        categoryId: string
        domainId: string
        domainName: string
      }) => {
        mockStateRef.current.parentCategories =
          mockStateRef.current.parentCategories.map((cat) =>
            cat.id === (command.categoryId as unknown as string)
              ? {
                  ...cat,
                  domains: [
                    ...cat.domains,
                    command.domainId as unknown as string,
                  ],
                  domainNames: [
                    ...(cat.domainNames ?? []),
                    command.domainName as unknown as string,
                  ],
                }
              : cat,
          )
        await deferredAdd.promise
        return mockStateRef.current.parentCategories
      },
    ) as unknown as AddDomainToParentCategoryUseCase
    const { deps, useCases } = setupMocks({
      state: {
        savedTabs: domains3,
        parentCategories: [
          {
            id: 'cat-1',
            name: '仕事',
            domains: ['g1'],
            domainNames: undefined as unknown as string[],
          } as ParentCategory,
          {
            id: 'cat-2',
            name: '他',
            domains: ['g9'],
            domainNames: ['x.com'],
          },
        ],
      },
      useCases: { addDomainToParentCategory },
    })

    render(
      <CategoryManagementModal
        isOpen
        onClose={vi.fn()}
        category={createCategory()}
        domains={[domains3[0]]}
        deps={deps}
        useCases={useCases}
      />,
    )

    await screen.findByTestId('select-item-g2')
    expect(screen.getByTestId('select-item-g3')).toBeTruthy()
    const plusButton = screen.getByText('選択したドメインを親カテゴリに追加')
      .previousElementSibling as HTMLButtonElement | null
    expect(plusButton).toBeTruthy()
    if (!plusButton) {
      throw new Error('plusButton not found')
    }

    await user.click(plusButton)
    await waitFor(() => {
      expect(addDomainToParentCategory).toHaveBeenCalledTimes(1)
    })

    const plusButtonProps = getLatestButtonProps(
      (props) =>
        props.variant === 'default' &&
        props.size === 'icon' &&
        props.onClick instanceof Function,
    ) as
      | {
          onClick?: (e: {
            preventDefault: () => void
            stopPropagation: () => void
          }) => void
        }
      | undefined
    plusButtonProps?.onClick?.({
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    })
    expect(addDomainToParentCategory).toHaveBeenCalledTimes(1)

    await act(async () => {
      deferredAdd.resolve()
    })

    await waitFor(() => {
      expect(toastSuccessSpy).toHaveBeenCalledWith(
        'ドメイン b.com を「仕事」に追加しました',
      )
      expect(screen.getByTestId('select-root').getAttribute('data-value')).toBe(
        'g3',
      )
    })

    // use-case 呼び出し時の state (parentCategories 配列) を検証する
    const addCallArg = vi.mocked(addDomainToParentCategory).mock
      .calls[0]?.[0] as
      | {
          categoryId: string
          domainId: string
          domainName: string
        }
      | undefined
    expect(addCallArg?.categoryId).toBeTruthy()
    expect(addCallArg?.domainId).toBeTruthy()
    expect(addCallArg?.domainName).toBeTruthy()
    expect(mockStateRef.current.parentCategories).toStrictEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'cat-2',
          name: '他',
          domains: ['g9'],
          domainNames: ['x.com'],
        }),
      ]),
    )
    expect(
      mockStateRef.current.parentCategories.find((cat) => cat.id === 'cat-1'),
    ).toStrictEqual(
      expect.objectContaining({
        domains: ['g1', 'g2'],
        domainNames: ['b.com'],
      }),
    )
  })

  it('ドメイン追加でカテゴリ不存在・選択ドメイン情報不存在をハンドリングする', async () => {
    const user = userEvent.setup()
    const [currentDomain] = createDomains()
    expect(currentDomain).toBeTruthy()
    if (!currentDomain) {
      throw new Error('currentDomain not found')
    }

    // 1 回目: カテゴリが存在しないため addDomainToParentCategory が SavedTabsDomainError を投げる
    {
      const { deps, useCases } = setupMocks({
        state: { parentCategories: [] },
      })
      render(
        <CategoryManagementModal
          isOpen
          onClose={vi.fn()}
          category={createCategory()}
          domains={[currentDomain]}
          deps={deps}
          useCases={useCases}
        />,
      )

      await screen.findByTestId('select-item-g1')
      const plusButton = screen.getByText('選択したドメインを親カテゴリに追加')
        .previousElementSibling as HTMLButtonElement | null
      expect(plusButton).toBeTruthy()
      if (!plusButton) {
        throw new Error('plusButton not found')
      }
      await user.click(plusButton)
      await waitFor(() => {
        expect(toastErrorSpy).toHaveBeenCalledWith(
          'カテゴリの設定に失敗しました',
        )
      })

      cleanup()
      toastErrorSpy.mockClear()
    }

    // 2 回目: domains から find で undefined が返るシナリオ。
    // availableDomains 構築時に利用される find を undefined 化する。
    {
      const { deps, useCases } = setupMocks()
      render(
        <CategoryManagementModal
          isOpen
          onClose={vi.fn()}
          category={createCategory()}
          domains={[currentDomain]}
          deps={deps}
          useCases={useCases}
        />,
      )
      await screen.findByTestId('select-item-g2')
      const plusButton = screen.getByText('選択したドメインを親カテゴリに追加')
        .previousElementSibling as HTMLButtonElement | null
      expect(plusButton).toBeTruthy()
      if (!plusButton) {
        throw new Error('plusButton not found')
      }

      const originalFind = Array.prototype.find
      using findSpy = vi.spyOn(Array.prototype, 'find')
      findSpy.mockImplementation((predicate, thisArg) => {
        // eslint-disable-line
        const context = findSpy.mock.contexts[
          findSpy.mock.calls.length - 1
        ] as unknown[]
        if (
          context.every(
            (item) =>
              Boolean(item) &&
              typeof item === 'object' &&
              'id' in (item as Record<string, unknown>) &&
              'domain' in (item as Record<string, unknown>) &&
              !('urls' in (item as Record<string, unknown>)),
          )
        ) {
          return
        }
        // eslint-disable-next-line typescript/consistent-return
        return originalFind.call(context, predicate, thisArg)
      })

      await user.click(plusButton)
      await waitFor(() => {
        expect(toastErrorSpy).toHaveBeenCalledWith(
          'カテゴリの設定に失敗しました',
        )
      })
    }
  })

  it('ドメイン削除の成功/失敗と closeガード（loading中）を処理する', async () => {
    const user = userEvent.setup()
    const originalReadyState = document.readyState
    const removeDomainFromParentCategory = vi.fn(
      async () => mockStateRef.current.parentCategories,
    ) as unknown as RemoveDomainFromParentCategoryUseCase
    const { deps, useCases } = setupMocks({
      useCases: { removeDomainFromParentCategory },
    })

    render(
      <CategoryManagementModal
        isOpen
        onClose={vi.fn()}
        category={createCategory()}
        domains={createDomains()}
        deps={deps}
        useCases={useCases}
      />,
    )

    const removeButtons = screen.getAllByRole('button', {
      name: 'ドメインを削除',
    })
    const firstRemoveButton = removeButtons[0]
    expect(firstRemoveButton).toBeTruthy()
    if (!firstRemoveButton) {
      throw new Error('firstRemoveButton not found')
    }
    await user.click(firstRemoveButton)
    await waitFor(() => {
      expect(toastSuccessSpy).toHaveBeenCalledWith(
        'ドメイン a.com を「仕事」から削除しました',
      )
    })

    // 失敗ケース: 2 回目の削除は use-case が throw する
    vi.mocked(removeDomainFromParentCategory).mockImplementationOnce(
      async () => {
        throw new Error('boom')
      },
    )
    const nextRemoveButtons = screen.getAllByRole('button', {
      name: 'ドメインを削除',
    })
    const nextRemoveButton = nextRemoveButtons[0]
    expect(nextRemoveButton).toBeTruthy()
    if (!nextRemoveButton) {
      throw new Error('nextRemoveButton not found')
    }
    await user.click(nextRemoveButton)
    await waitFor(() => {
      expect(toastErrorSpy).toHaveBeenCalledWith('カテゴリの削除に失敗しました')
    })

    Object.defineProperty(document, 'readyState', {
      configurable: true,
      get: () => 'loading',
    })
    await user.click(screen.getByRole('button', { name: 'dialog-close' }))

    Object.defineProperty(document, 'readyState', {
      configurable: true,
      get: () => originalReadyState,
    })
  })

  it('ドメイン削除のカテゴリ更新分岐・処理中再入防止・関連データ不足を処理する', async () => {
    const user = userEvent.setup()
    // eslint-disable-next-line typescript/no-invalid-void-type
    const deferredRemove = createDeferred<void>()
    const removeDomainFromParentCategory = vi.fn(
      async (command: {
        categoryId: string
        domainId: string
        domainName: string
      }) => {
        mockStateRef.current.parentCategories =
          mockStateRef.current.parentCategories.map((cat) =>
            cat.id === (command.categoryId as unknown as string)
              ? {
                  ...cat,
                  domains: cat.domains.filter(
                    (d) => d !== (command.domainId as unknown as string),
                  ),
                  domainNames: (cat.domainNames ?? []).filter(
                    (d) => d !== (command.domainName as unknown as string),
                  ),
                }
              : cat,
          )
        await deferredRemove.promise
        return mockStateRef.current.parentCategories
      },
    ) as unknown as RemoveDomainFromParentCategoryUseCase

    const { deps, useCases } = setupMocks({
      state: {
        parentCategories: [
          {
            id: 'cat-1',
            name: '仕事',
            domains: ['g1', 'g2'],
            domainNames: undefined as unknown as string[],
          } as ParentCategory,
          {
            id: 'cat-2',
            name: '他',
            domains: ['g9'],
            domainNames: ['x.com'],
          },
        ],
      },
      useCases: { removeDomainFromParentCategory },
    })

    render(
      <CategoryManagementModal
        isOpen
        onClose={vi.fn()}
        category={createCategory()}
        domains={createDomains()}
        deps={deps}
        useCases={useCases}
      />,
    )

    let removeButtons = screen.getAllByRole('button', {
      name: 'ドメインを削除',
    })
    const removeButton = removeButtons[0]
    expect(removeButton).toBeTruthy()
    if (!removeButton) {
      throw new Error('removeButton not found')
    }
    await user.click(removeButton)

    await waitFor(() => {
      expect(removeDomainFromParentCategory).toHaveBeenCalledTimes(1)
    })

    const removeButtonProps = getLatestButtonProps(
      (props) =>
        props['aria-label'] === 'ドメインを削除' &&
        props.onClick instanceof Function,
    ) as { onClick?: () => void } | undefined
    removeButtonProps?.onClick?.()
    expect(removeDomainFromParentCategory).toHaveBeenCalledTimes(1)

    await act(async () => {
      deferredRemove.resolve()
    })

    await waitFor(() => {
      expect(toastSuccessSpy).toHaveBeenCalledWith(
        'ドメイン a.com を「仕事」から削除しました',
      )
    })

    expect(mockStateRef.current.parentCategories).toStrictEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'cat-2',
          domains: ['g9'],
          domainNames: ['x.com'],
        }),
      ]),
    )

    // カテゴリ不存在
    cleanup()
    const setup = setupMocks({
      state: { parentCategories: [] },
    })
    render(
      <CategoryManagementModal
        isOpen
        onClose={vi.fn()}
        category={createCategory()}
        domains={createDomains()}
        deps={setup.deps}
        useCases={setup.useCases}
      />,
    )
    removeButtons = screen.getAllByRole('button', { name: 'ドメインを削除' })
    await user.click(removeButtons[0] as HTMLButtonElement)
    await waitFor(() => {
      expect(toastErrorSpy).toHaveBeenCalledWith('カテゴリの削除に失敗しました')
    })

    // ドメイン情報不存在
    cleanup()
    const setup2 = setupMocks()
    const weirdDomains = [...createDomains()] as TabGroup[]
    ;(
      weirdDomains as unknown as {
        find: (predicate: (value: TabGroup) => boolean) => TabGroup | undefined
      }
    ).find = () => undefined
    render(
      <CategoryManagementModal
        isOpen
        onClose={vi.fn()}
        category={createCategory()}
        domains={weirdDomains}
        deps={setup2.deps}
        useCases={setup2.useCases}
      />,
    )
    removeButtons = screen.getAllByRole('button', { name: 'ドメインを削除' })
    await user.click(removeButtons[0] as HTMLButtonElement)
    await waitFor(() => {
      expect(toastErrorSpy).toHaveBeenCalledWith('カテゴリの削除に失敗しました')
    })
  })

  it('利用可能ドメインの読み込み失敗をハンドリングする', async () => {
    const { deps, useCases, getSavedTabsPageDataQuery } = setupMocks()
    getSavedTabsPageDataQuery.mockRejectedValueOnce(new Error('load failed'))

    render(
      <CategoryManagementModal
        isOpen
        onClose={vi.fn()}
        category={createCategory()}
        domains={createDomains()}
        deps={deps}
        useCases={useCases}
      />,
    )

    await waitFor(() => {
      expect(console.error).toHaveBeenCalled()
    })
  })
})
