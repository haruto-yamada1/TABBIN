// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { categoryNameSchema } from '@/features/saved-tabs/components/categoryNameSchema'
import type { ParentCategory, TabGroup } from '@/types/storage'

const categoryManagementModalI18nState = vi.hoisted(() => ({
  language: 'ja' as 'en' | 'ja',
}))

const { toastErrorSpy, toastSuccessSpy, buttonPropsSpy } = vi.hoisted(() => ({
  toastErrorSpy: vi.fn(),
  toastSuccessSpy: vi.fn(),
  buttonPropsSpy: vi.fn(),
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
      <button type={type ?? 'button'} {...props}>
        {children}
      </button>
    )
  },
}))

vi.mock('@/features/i18n/context/I18nProvider', async () => {
  const { getMessages } = await vi.importActual<
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
          (_, token) => values?.[token] ?? '',
        )
      },
    }),
  }
})

import { CategoryManagementModal } from './CategoryManagementModal'

interface StorageState {
  savedTabs: TabGroup[]
  parentCategories: ParentCategory[]
}

let storageState: StorageState
let getMock: ReturnType<typeof vi.fn>
let setMock: ReturnType<typeof vi.fn>

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

const setupChrome = () => {
// eslint-disable-next-line typescript/require-await
  getMock = vi.fn(async (key: string) => {
    if (key === 'savedTabs') {
      return { savedTabs: storageState.savedTabs }
    }
    if (key === 'parentCategories') {
      return { parentCategories: storageState.parentCategories }
    }
    return {}
  })
// eslint-disable-next-line typescript/require-await
  setMock = vi.fn(async (value: Partial<StorageState>) => {
    storageState = {
      ...storageState,
      ...value,
    }
  })

  const chromeGlobal = globalThis as unknown as { chrome: typeof chrome }
  chromeGlobal.chrome = {
    storage: {
      local: {
        get: getMock,
        set: setMock,
      },
    },
  } as unknown as typeof chrome
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
    storageState = {
      savedTabs: createDomains(),
      parentCategories: [
        {
          id: 'cat-1',
          name: '仕事',
          domains: ['g1'],
          domainNames: ['a.com'],
        },
      ],
    }
    setupChrome()
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
    const { container } = render(
      <CategoryManagementModal
        isOpen={false}
        onClose={vi.fn()}
        category={createCategory()}
        domains={createDomains()}
      />,
    )

    expect(container.innerHTML).toBe('')
  })

  it('開いたときに初期化して利用可能ドメインを読み込み、通常時は閉じられる', async () => {
    const onClose = vi.fn()
    render(
      <CategoryManagementModal
        isOpen
        onClose={onClose}
        category={createCategory()}
        domains={createDomains()}
      />,
    )

    await expect(
      screen.findByText('「仕事」の親カテゴリ管理'),
    ).resolves.toBeTruthy()
    expect(screen.getByText('a.com')).toBeTruthy()
    expect(screen.getByTestId('select-item-g2')).toBeTruthy()
    expect(getMock).toHaveBeenCalledWith('savedTabs')
    expect(getMock).toHaveBeenCalledWith('parentCategories')

    fireEvent.click(screen.getByRole('button', { name: 'dialog-close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('追加可能ドメインがない場合の初期状態を処理する', async () => {
    storageState.savedTabs = []
    storageState.parentCategories = []

    render(
      <CategoryManagementModal
        isOpen
        onClose={vi.fn()}
        category={createCategory()}
        domains={[]}
      />,
    )

    await expect(
      screen.findByText('追加できるドメインがありません。'),
    ).resolves.toBeTruthy()
    expect(screen.queryByTestId('select-root')).toBeNull()
  })

  it('リネーム開始時に input を focus/select し Escape でキャンセルする', async () => {
    let rafCallback: FrameRequestCallback | undefined
    ;(
      globalThis.requestAnimationFrame as unknown as ReturnType<typeof vi.fn>
    ).mockImplementationOnce((cb: FrameRequestCallback) => {
      rafCallback = cb
      return 1
    })

    render(
      <CategoryManagementModal
        isOpen
        onClose={vi.fn()}
        category={createCategory()}
        domains={createDomains()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /親カテゴリ名を変更/ }))
    const input = await screen.findByPlaceholderText(
      '例: ビジネスツール、技術情報',
    )

    using focusSpy = vi.spyOn(input, 'focus')
    using selectSpy = vi.spyOn(input, 'select')
    rafCallback?.(0)
    expect(focusSpy).toHaveBeenCalled()
    expect(selectSpy).toHaveBeenCalled()

    fireEvent.keyDown(input, { key: 'Escape' })
    expect(
      screen.queryByPlaceholderText('例: ビジネスツール、技術情報'),
    ).toBeNull()
  })

  it('リネーム時の Enter/Blur 分岐（変更なし・バリデーション失敗・処理中・キャンセル）を処理する', async () => {
    const deferredUpdate = createDeferred<void>()
    const onCategoryUpdate = vi.fn(
      async (categoryId: string, newName: string) => {
        storageState.parentCategories = storageState.parentCategories.map(
          (cat) => (cat.id === categoryId ? { ...cat, name: newName } : cat),
        )
        await deferredUpdate.promise
      },
    )

    render(
      <CategoryManagementModal
        isOpen
        onClose={vi.fn()}
        category={createCategory()}
        domains={createDomains()}
// eslint-disable-next-line typescript/no-misused-promises
        onCategoryUpdate={onCategoryUpdate}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /親カテゴリ名を変更/ }))
    let input = await screen.findByPlaceholderText(
      '例: ビジネスツール、技術情報',
    )

    // 変更なし Enter -> 早期 return
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(
      screen.getByPlaceholderText('例: ビジネスツール、技術情報'),
    ).toBeTruthy()

    // 再度開いて invalid Enter -> validate false で return
    fireEvent.blur(input)
    expect(
      screen.queryByPlaceholderText('例: ビジネスツール、技術情報'),
    ).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /親カテゴリ名を変更/ }))
    input = await screen.findByPlaceholderText('例: ビジネスツール、技術情報')
    fireEvent.change(input, { target: { value: '12345678901234567890123456' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(
      screen.getByText('新規親カテゴリ名は25文字以下にしてください'),
    ).toBeTruthy()

    // エラーあり blur -> focus 維持
    using focusSpy = vi.spyOn(input, 'focus')
    fireEvent.blur(input)
    expect(focusSpy).toHaveBeenCalled()

    // Tab key -> Enter/Escape どちらでもない分岐
    fireEvent.keyDown(input, { key: 'Tab' })

    // valid blur -> 保存開始
    fireEvent.change(input, { target: { value: 'BlurSave' } })
    fireEvent.blur(input)
    await waitFor(() => {
      expect(onCategoryUpdate).toHaveBeenCalledWith('cat-1', 'BlurSave')
    })

    // 処理中 Enter/Blur は早期 return
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.blur(input)

// eslint-disable-next-line typescript/require-await
    await act(async () => {
      deferredUpdate.resolve()
    })

    await waitFor(() => {
      expect(toastSuccessSpy).toHaveBeenCalled()
    })

    // 再度開いて同名 blur -> キャンセル
    fireEvent.click(screen.getByRole('button', { name: /親カテゴリ名を変更/ }))
    input = await screen.findByPlaceholderText('例: ビジネスツール、技術情報')
    fireEvent.change(input, { target: { value: 'BlurSave' } })
    fireEvent.blur(input)
    expect(
      screen.queryByPlaceholderText('例: ビジネスツール、技術情報'),
    ).toBeNull()
  })

  it('リネーム開始/バリデーション/成功保存/closeガード（isRenaming）を処理する', async () => {
    const onClose = vi.fn()
    const onCategoryUpdate = vi.fn(
// eslint-disable-next-line typescript/require-await
      async (categoryId: string, newName: string) => {
        storageState.parentCategories = storageState.parentCategories.map(
          (cat) => (cat.id === categoryId ? { ...cat, name: newName } : cat),
        )
      },
    )

    render(
      <CategoryManagementModal
        isOpen
        onClose={onClose}
        category={createCategory()}
        domains={createDomains()}
// eslint-disable-next-line typescript/no-misused-promises
        onCategoryUpdate={onCategoryUpdate}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /親カテゴリ名を変更/ }))
    const input = await screen.findByPlaceholderText(
      '例: ビジネスツール、技術情報',
    )

    fireEvent.click(screen.getByRole('button', { name: 'dialog-close' }))
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)
    expect(screen.getByText('新規親カテゴリ名を入力してください')).toBeTruthy()

    fireEvent.change(input, { target: { value: '12345678901234567890123456' } })
    expect(
      screen.getByText('新規親カテゴリ名は25文字以下にしてください'),
    ).toBeTruthy()

    fireEvent.change(input, { target: { value: '新しいカテゴリ' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(onCategoryUpdate).toHaveBeenCalledWith('cat-1', '新しいカテゴリ')
      expect(toastSuccessSpy).toHaveBeenCalled()
    })

    expect(
      screen.queryByPlaceholderText('例: ビジネスツール、技術情報'),
    ).toBeNull()
  })

  it('リネーム失敗時（callbackなし/更新確認失敗）に toast.error を出す', async () => {
    const { rerender } = render(
      <CategoryManagementModal
        isOpen
        onClose={vi.fn()}
        category={createCategory()}
        domains={createDomains()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /親カテゴリ名を変更/ }))
    let input = await screen.findByPlaceholderText(
      '例: ビジネスツール、技術情報',
    )
    fireEvent.change(input, { target: { value: '失敗1' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(toastErrorSpy).toHaveBeenCalledWith(
        '親カテゴリ名の更新に失敗しました',
      )
    })

    storageState.parentCategories = [
      {
        id: 'cat-1',
        name: '仕事',
        domains: ['g1'],
        domainNames: ['a.com'],
      },
    ]
    rerender(
      <CategoryManagementModal
        isOpen
        onClose={vi.fn()}
        category={createCategory()}
        domains={createDomains()}
// eslint-disable-next-line typescript/no-misused-promises
        onCategoryUpdate={vi.fn(async () => {})}
      />,
    )

    input = await screen.findByPlaceholderText('例: ビジネスツール、技術情報')
    fireEvent.change(input, { target: { value: '更新未反映' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(toastErrorSpy).toHaveBeenCalledWith(
        '親カテゴリ名の更新に失敗しました',
      )
    })
  })

  it('リネーム保存後の最終確認不一致をエラーとして処理する', async () => {
    let parentCategoryGetCount = 0
// eslint-disable-next-line typescript/require-await
    getMock.mockImplementation(async (key: string) => {
      if (key === 'savedTabs') {
        return { savedTabs: storageState.savedTabs }
      }
      if (key === 'parentCategories') {
        parentCategoryGetCount += 1
        if (parentCategoryGetCount === 3) {
          return {
            parentCategories: [
              {
                id: 'cat-1',
                name: '最終確認で不一致',
                domains: ['g1'],
                domainNames: ['a.com'],
              },
            ],
          }
        }
        return { parentCategories: storageState.parentCategories }
      }
      return {}
    })

    const onCategoryUpdate = vi.fn(
// eslint-disable-next-line typescript/require-await
      async (categoryId: string, newName: string) => {
        storageState.parentCategories = storageState.parentCategories.map(
          (cat) => (cat.id === categoryId ? { ...cat, name: newName } : cat),
        )
      },
    )

    render(
      <CategoryManagementModal
        isOpen
        onClose={vi.fn()}
        category={createCategory()}
        domains={createDomains()}
// eslint-disable-next-line typescript/no-misused-promises
        onCategoryUpdate={onCategoryUpdate}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /親カテゴリ名を変更/ }))
    const input = await screen.findByPlaceholderText(
      '例: ビジネスツール、技術情報',
    )
    fireEvent.change(input, { target: { value: '更新後' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(toastErrorSpy).toHaveBeenCalledWith(
        '親カテゴリ名の更新に失敗しました',
      )
    })
  })

  it('リネーム保存で non-Error を投げた場合も stack なしでハンドリングする', async () => {
    render(
      <CategoryManagementModal
        isOpen
        onClose={vi.fn()}
        category={createCategory()}
        domains={createDomains()}
// eslint-disable-next-line typescript/require-await
        onCategoryUpdate={vi.fn(async () => {
          throw 'string-error'
        })}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /親カテゴリ名を変更/ }))
    const input = await screen.findByPlaceholderText(
      '例: ビジネスツール、技術情報',
    )
    fireEvent.change(input, { target: { value: 'string fail' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(
        (console.error as unknown as ReturnType<typeof vi.fn>).mock.calls.some(
          ([message, payload]) =>
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
    render(
      <CategoryManagementModal
        isOpen
        onClose={vi.fn()}
        category={createCategory()}
        domains={createDomains()}
        onCategoryUpdate={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /親カテゴリ名を変更/ }))
    const input = await screen.findByPlaceholderText(
      '例: ビジネスツール、技術情報',
    )
    fireEvent.change(input, { target: { value: 'valid-name' } })

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

    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => {
      expect(screen.getByText('カテゴリ名が無効です')).toBeTruthy()
    })
  })

  it('親カテゴリ削除の成功/失敗を処理する', async () => {
    const onClose = vi.fn()
    const { rerender } = render(
      <CategoryManagementModal
        isOpen
        onClose={onClose}
        category={createCategory()}
        domains={createDomains()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /親カテゴリを削除/ }))
    fireEvent.click(screen.getByRole('button', { name: /^削除$/ }))

    await waitFor(() => {
      expect(setMock).toHaveBeenCalled()
      expect(toastSuccessSpy).toHaveBeenCalledWith(
        'カテゴリ「仕事」を削除しました',
      )
      expect(onClose).toHaveBeenCalled()
    })

    setMock.mockRejectedValueOnce(new Error('boom'))
    storageState.parentCategories = [
      { id: 'cat-1', name: '仕事', domains: ['g1'], domainNames: ['a.com'] },
    ]
    rerender(
      <CategoryManagementModal
        isOpen
        onClose={vi.fn()}
        category={createCategory()}
        domains={createDomains()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /親カテゴリを削除/ }))
    fireEvent.click(screen.getByRole('button', { name: /^削除$/ }))

    await waitFor(() => {
      expect(toastErrorSpy).toHaveBeenCalledWith('カテゴリの削除に失敗しました')
    })
  })

  it('親カテゴリ削除確認のキャンセル・関連ドメインなし表示・処理中の再入防止を処理する', async () => {
    const deferredSet = createDeferred<void>()
// eslint-disable-next-line typescript/no-misused-promises
    setMock.mockImplementationOnce(async (value: Partial<StorageState>) => {
      storageState = { ...storageState, ...value }
      await deferredSet.promise
    })

    render(
      <CategoryManagementModal
        isOpen
        onClose={vi.fn()}
        category={createCategory()}
        domains={[]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /親カテゴリを削除/ }))
    expect(screen.queryByText(/件のドメインが関連付けられています/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(screen.queryByRole('button', { name: /^削除$/ })).toBeNull()

// eslint-disable-next-line typescript/require-await
    getMock.mockImplementationOnce(async (key: string) => {
      if (key === 'parentCategories') {
        return {}
      }
      if (key === 'savedTabs') {
        return { savedTabs: storageState.savedTabs }
      }
      return {}
    })

    fireEvent.click(screen.getByRole('button', { name: /親カテゴリを削除/ }))
    fireEvent.click(screen.getByRole('button', { name: /^削除$/ }))

    await waitFor(() => {
      expect(setMock).toHaveBeenCalledTimes(1)
    })

    const deleteConfirmButtonProps = getLatestButtonProps(
      (props) =>
        props.variant === 'destructive' &&
        props.size === 'sm' &&
        props.onClick instanceof Function,
    ) as { onClick?: () => Promise<void> | void } | undefined
    await deleteConfirmButtonProps?.onClick?.()
    expect(setMock).toHaveBeenCalledTimes(1)

// eslint-disable-next-line typescript/require-await
    await act(async () => {
      deferredSet.resolve()
    })
  })

  it('ドメイン追加の成功/重複エラーを処理する', async () => {
    const [currentDomain] = createDomains()
    expect(currentDomain).toBeTruthy()
    if (!currentDomain) {
      throw new Error('currentDomain not found')
    }

    render(
      <CategoryManagementModal
        isOpen
        onClose={vi.fn()}
        category={createCategory()}
        domains={[currentDomain]}
      />,
    )

    await screen.findByTestId('select-item-g2')
    const plusButton = screen.getByText('選択したドメインを親カテゴリに追加')
      .previousElementSibling as HTMLButtonElement | null
    expect(plusButton).toBeTruthy()
    if (!plusButton) {
      throw new Error('plusButton not found')
    }
    fireEvent.click(plusButton)

    await waitFor(() => {
      expect(toastSuccessSpy).toHaveBeenCalledWith(
        'ドメイン b.com を「仕事」に追加しました',
      )
    })

    // 不整合データで duplicate 分岐を通す
    storageState.parentCategories = [
      {
        id: 'cat-1',
        name: '仕事',
        domains: [],
        domainNames: ['b.com'],
      },
    ]
    storageState.savedTabs = [{ id: 'g2', domain: 'b.com', urls: [] }]

    cleanup()
    render(
      <CategoryManagementModal
        isOpen
        onClose={vi.fn()}
        category={createCategory()}
        domains={[]}
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
    fireEvent.click(secondPlusButton)

    await waitFor(() => {
      expect(toastErrorSpy).toHaveBeenCalledWith('カテゴリの設定に失敗しました')
    })
  })

  it('ドメイン追加の残件選択・カテゴリ更新分岐・処理中再入防止を処理する', async () => {
    const domains3: TabGroup[] = [
      { id: 'g1', domain: 'a.com', urls: [] },
      { id: 'g2', domain: 'b.com', urls: [] },
      { id: 'g3', domain: 'c.com', urls: [] },
    ]
    storageState.savedTabs = domains3
    storageState.parentCategories = [
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
    ]

    const deferredSet = createDeferred<void>()
// eslint-disable-next-line typescript/no-misused-promises
    setMock.mockImplementationOnce(async (value: Partial<StorageState>) => {
      storageState = { ...storageState, ...value }
      await deferredSet.promise
    })

    render(
      <CategoryManagementModal
        isOpen
        onClose={vi.fn()}
        category={createCategory()}
        domains={[domains3[0]]}
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

    fireEvent.click(plusButton)
    await waitFor(() => {
      expect(setMock).toHaveBeenCalledTimes(1)
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
    expect(setMock).toHaveBeenCalledTimes(1)

// eslint-disable-next-line typescript/require-await
    await act(async () => {
      deferredSet.resolve()
    })

    await waitFor(() => {
      expect(toastSuccessSpy).toHaveBeenCalledWith(
        'ドメイン b.com を「仕事」に追加しました',
      )
      expect(screen.getByTestId('select-root').getAttribute('data-value')).toBe(
        'g3',
      )
    })

    const firstSetArg = setMock.mock.calls[0]?.[0] as
      | Partial<StorageState>
      | undefined
    expect(firstSetArg?.parentCategories).toStrictEqual(
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
      firstSetArg?.parentCategories?.find((cat) => cat.id === 'cat-1'),
    ).toStrictEqual(
      expect.objectContaining({
        domains: ['g1', 'g2'],
        domainNames: ['b.com'],
      }),
    )
  })

  it('ドメイン追加でカテゴリ不存在・選択ドメイン情報不存在をハンドリングする', async () => {
    const [currentDomain] = createDomains()
    expect(currentDomain).toBeTruthy()
    if (!currentDomain) {
      throw new Error('currentDomain not found')
    }

    storageState.parentCategories = []
    render(
      <CategoryManagementModal
        isOpen
        onClose={vi.fn()}
        category={createCategory()}
        domains={[currentDomain]}
      />,
    )

    await screen.findByTestId('select-item-g1')
    let plusButton = screen.getByText('選択したドメインを親カテゴリに追加')
      .previousElementSibling as HTMLButtonElement | null
    expect(plusButton).toBeTruthy()
    if (!plusButton) {
      throw new Error('plusButton not found')
    }
    fireEvent.click(plusButton)
    await waitFor(() => {
      expect(toastErrorSpy).toHaveBeenCalledWith('カテゴリの設定に失敗しました')
    })

    cleanup()
    storageState = {
      savedTabs: createDomains(),
      parentCategories: [
        {
          id: 'cat-1',
          name: '仕事',
          domains: ['g1'],
          domainNames: ['a.com'],
        },
      ],
    }
    setupChrome()
    toastErrorSpy.mockClear()
    render(
      <CategoryManagementModal
        isOpen
        onClose={vi.fn()}
        category={createCategory()}
        domains={[currentDomain]}
      />,
    )
    await screen.findByTestId('select-item-g2')
    plusButton = screen.getByText('選択したドメインを親カテゴリに追加')
      .previousElementSibling as HTMLButtonElement | null
    expect(plusButton).toBeTruthy()
    if (!plusButton) {
      throw new Error('plusButton not found')
    }

    const originalFind = Array.prototype.find
    using findSpy = vi.spyOn(Array.prototype, 'find')
    findSpy.mockImplementation((predicate, thisArg) => {
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
      return originalFind.call(context, predicate, thisArg)
    })

    fireEvent.click(plusButton)
    await waitFor(() => {
      expect(toastErrorSpy).toHaveBeenCalledWith('カテゴリの設定に失敗しました')
    })
  })

  it('ドメイン削除の成功/失敗と closeガード（loading中）を処理する', async () => {
    const originalReadyState = document.readyState
    render(
      <CategoryManagementModal
        isOpen
        onClose={vi.fn()}
        category={createCategory()}
        domains={createDomains()}
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
    fireEvent.click(firstRemoveButton)
    await waitFor(() => {
      expect(toastSuccessSpy).toHaveBeenCalledWith(
        'ドメイン a.com を「仕事」から削除しました',
      )
    })

// eslint-disable-next-line typescript/require-await
    getMock.mockImplementationOnce(async (key: string) => {
      if (key === 'parentCategories') {
        throw new Error('boom')
      }
      return { savedTabs: storageState.savedTabs }
    })
    const nextRemoveButtons = screen.getAllByRole('button', {
      name: 'ドメインを削除',
    })
    const nextRemoveButton = nextRemoveButtons[0]
    expect(nextRemoveButton).toBeTruthy()
    if (!nextRemoveButton) {
      throw new Error('nextRemoveButton not found')
    }
    fireEvent.click(nextRemoveButton)
    await waitFor(() => {
      expect(toastErrorSpy).toHaveBeenCalledWith('カテゴリの削除に失敗しました')
    })

    Object.defineProperty(document, 'readyState', {
      configurable: true,
      get: () => 'loading',
    })
    fireEvent.click(screen.getByRole('button', { name: 'dialog-close' }))

    Object.defineProperty(document, 'readyState', {
      configurable: true,
      get: () => originalReadyState,
    })
  })

  it('ドメイン削除のカテゴリ更新分岐・処理中再入防止・関連データ不足を処理する', async () => {
    storageState.parentCategories = [
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
    ]

    const deferredSet = createDeferred<void>()
// eslint-disable-next-line typescript/no-misused-promises
    setMock.mockImplementationOnce(async (value: Partial<StorageState>) => {
      storageState = { ...storageState, ...value }
      await deferredSet.promise
    })

    render(
      <CategoryManagementModal
        isOpen
        onClose={vi.fn()}
        category={createCategory()}
        domains={createDomains()}
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
    fireEvent.click(removeButton)

    await waitFor(() => {
      expect(setMock).toHaveBeenCalledTimes(1)
    })

    const removeButtonProps = getLatestButtonProps(
      (props) =>
        props['aria-label'] === 'ドメインを削除' &&
        props.onClick instanceof Function,
    ) as { onClick?: () => void } | undefined
    removeButtonProps?.onClick?.()
    expect(setMock).toHaveBeenCalledTimes(1)

// eslint-disable-next-line typescript/require-await
    await act(async () => {
      deferredSet.resolve()
    })

    await waitFor(() => {
      expect(toastSuccessSpy).toHaveBeenCalledWith(
        'ドメイン a.com を「仕事」から削除しました',
      )
    })

    const removeSetArg = setMock.mock.calls[0]?.[0] as
      | Partial<StorageState>
      | undefined
    expect(removeSetArg?.parentCategories).toStrictEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'cat-2',
          domains: ['g9'],
          domainNames: ['x.com'],
        }),
      ]),
    )

    // カテゴリ不存在
    storageState.parentCategories = []
    cleanup()
    setupChrome()
    render(
      <CategoryManagementModal
        isOpen
        onClose={vi.fn()}
        category={createCategory()}
        domains={createDomains()}
      />,
    )
    removeButtons = screen.getAllByRole('button', { name: 'ドメインを削除' })
    fireEvent.click(removeButtons[0] as HTMLButtonElement)
    await waitFor(() => {
      expect(toastErrorSpy).toHaveBeenCalledWith('カテゴリの削除に失敗しました')
    })

    // ドメイン情報不存在
    storageState.parentCategories = [
      {
        id: 'cat-1',
        name: '仕事',
        domains: ['g1'],
        domainNames: ['a.com'],
      },
    ]
    const weirdDomains = [...createDomains()] as TabGroup[]
    ;(
      weirdDomains as unknown as {
        find: (predicate: (value: TabGroup) => boolean) => TabGroup | undefined
      }
    ).find = () => undefined

    cleanup()
    setupChrome()
    render(
      <CategoryManagementModal
        isOpen
        onClose={vi.fn()}
        category={createCategory()}
        domains={weirdDomains}
      />,
    )
    removeButtons = screen.getAllByRole('button', { name: 'ドメインを削除' })
    fireEvent.click(removeButtons[0] as HTMLButtonElement)
    await waitFor(() => {
      expect(toastErrorSpy).toHaveBeenCalledWith('カテゴリの削除に失敗しました')
    })
  })

  it('利用可能ドメインの読み込み失敗をハンドリングする', async () => {
    getMock.mockRejectedValueOnce(new Error('load failed'))

    render(
      <CategoryManagementModal
        isOpen
        onClose={vi.fn()}
        category={createCategory()}
        domains={createDomains()}
      />,
    )

    await waitFor(() => {
      expect(console.error).toHaveBeenCalled()
    })
  })
})
