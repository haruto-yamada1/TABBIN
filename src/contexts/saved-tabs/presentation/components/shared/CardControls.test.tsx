// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import type { SortOrder } from '@/contexts/saved-tabs/presentation/hooks/useSortOrder'

import { CardCollapseControl } from './CardCollapseControl'
import { CardGroupTitle } from './CardGroupTitle'
import { CardReorderControls } from './CardReorderControls'
import { CardSortControl } from './CardSortControl'

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))

vi.mock('@/features/i18n/context/I18nProvider', () => ({
  useI18n: () => ({
    language: 'ja',
    t: (key: string) =>
      (
        ({
          'savedTabs.sort.default': 'デフォルト',
          'savedTabs.sort.asc': '保存日時の昇順',
          'savedTabs.sort.desc': '保存日時の降順',
          'savedTabs.collapse': '折りたたむ',
          'savedTabs.expand': '展開',
          'savedTabs.reorder.disabled': '並び替えモード中',
          'savedTabs.reorder.cancel': 'キャンセル',
          'savedTabs.reorder.cancelAria': '並び替えをキャンセル',
          'savedTabs.reorder.confirm': '確定',
          'savedTabs.reorder.confirmAria': '並び替えを確定',
        }) satisfies Record<string, string>
      )[key] ?? key,
  }),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('CardSortControl', () => {
  it('default -> asc -> desc -> default でソート順を切り替える', async () => {
    const user = userEvent.setup()
    const Harness = () => {
      const [sortOrder, setSortOrder] = useState<SortOrder>('default')
      return (
        <div>
          <span data-testid='sort-order'>{sortOrder}</span>
          <CardSortControl sortOrder={sortOrder} setSortOrder={setSortOrder} />
        </div>
      )
    }

    render(<Harness />)

    const clickSortButton = async (name: string) => {
      await user.click(screen.getByRole('button', { name }))
    }

    expect(screen.getByTestId('sort-order').textContent).toBe('default')

    await clickSortButton('デフォルト')
    expect(screen.getByTestId('sort-order').textContent).toBe('asc')

    await clickSortButton('保存日時の昇順')
    expect(screen.getByTestId('sort-order').textContent).toBe('desc')

    await clickSortButton('保存日時の降順')
    expect(screen.getByTestId('sort-order').textContent).toBe('default')
  })
})

describe('CardCollapseControl', () => {
  it('有効時に折りたたみ状態とユーザー状態を更新する', async () => {
    const user = userEvent.setup()
    const Harness = () => {
      const [isCollapsed, setIsCollapsed] = useState(false)
      const [userCollapsedState, setUserCollapsedState] = useState(false)

      return (
        <>
          <span data-testid='collapsed'>{String(isCollapsed)}</span>
          <span data-testid='user-collapsed'>{String(userCollapsedState)}</span>
          <CardCollapseControl
            isCollapsed={isCollapsed}
            setIsCollapsed={setIsCollapsed}
            setUserCollapsedState={setUserCollapsedState}
          />
        </>
      )
    }

    render(<Harness />)

    await user.click(screen.getByRole('button', { name: '折りたたむ' }))
    expect(screen.getByTestId('collapsed').textContent).toBe('true')
    expect(screen.getByTestId('user-collapsed').textContent).toBe('true')

    await user.click(screen.getByRole('button', { name: '展開' }))
    expect(screen.getByTestId('collapsed').textContent).toBe('false')
    expect(screen.getByTestId('user-collapsed').textContent).toBe('false')
  })

  it('無効時はクリックしても状態を更新しない', async () => {
    const user = userEvent.setup()
    const setIsCollapsed = vi.fn()
    const setUserCollapsedState = vi.fn()

    render(
      <CardCollapseControl
        isCollapsed={false}
        setIsCollapsed={setIsCollapsed}
        setUserCollapsedState={setUserCollapsedState}
        isDisabled
        disabledMessage='並び替えモード中'
      />,
    )

    const button = screen.getByRole('button', { name: '折りたたむ' })
    expect(button.getAttribute('disabled')).not.toBeNull()

    await user.click(button)
    expect(setIsCollapsed).not.toHaveBeenCalled()
    expect(setUserCollapsedState).not.toHaveBeenCalled()
    expect(screen.getByText('並び替えモード中')).toBeTruthy()
  })
})

describe('CardGroupTitle', () => {
  it('ドラッグハンドルを muted foreground 色で描画する', () => {
    render(<CardGroupTitle title='動画' />)

    const dragHandle = screen.getByTestId('drag-handle')
    expect(dragHandle).toHaveClass('text-muted-foreground')
  })
})

describe('CardReorderControls', () => {
  it('並び替えモードでない場合は描画しない', () => {
    const { container } = render(
      <CardReorderControls
        isReorderMode={false}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )

    expect(container.textContent).toBe('')
  })

  it('並び替えモード時に確定/キャンセル操作を実行する', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    const onConfirm = vi.fn()

    render(
      <CardReorderControls
        isReorderMode
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    )

    await user.click(
      screen.getByRole('button', { name: '並び替えをキャンセル' }),
    )
    await user.click(screen.getByRole('button', { name: '並び替えを確定' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(screen.getByText('キャンセル')).toBeTruthy()
    expect(screen.getByText('確定')).toBeTruthy()
  })
})
