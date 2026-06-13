// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import type { SortOrder } from '@/contexts/saved-tabs/presentation/hooks/useSortOrder'

import { CardCollapseControl } from './CardCollapseControl'
import { CardGroupTitle } from './CardGroupTitle'
import { CardReorderControls } from './CardReorderControls'
import { CardSortControl } from './CardSortControl'

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

// eslint-disable-next-line vitest/require-top-level-describe
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('CardSortControl', () => {
  it('default -> asc -> desc -> default でソート順を切り替える', () => {
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

    const clickSortButton = (name: string) => {
      fireEvent.click(screen.getByRole('button', { name }))
    }

    expect(screen.getByTestId('sort-order').textContent).toBe('default')

    clickSortButton('デフォルト')
    expect(screen.getByTestId('sort-order').textContent).toBe('asc')

    clickSortButton('保存日時の昇順')
    expect(screen.getByTestId('sort-order').textContent).toBe('desc')

    clickSortButton('保存日時の降順')
    expect(screen.getByTestId('sort-order').textContent).toBe('default')
  })
})

describe('CardCollapseControl', () => {
  it('有効時に折りたたみ状態とユーザー状態を更新する', () => {
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

    fireEvent.click(screen.getByRole('button', { name: '折りたたむ' }))
    expect(screen.getByTestId('collapsed').textContent).toBe('true')
    expect(screen.getByTestId('user-collapsed').textContent).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: '展開' }))
    expect(screen.getByTestId('collapsed').textContent).toBe('false')
    expect(screen.getByTestId('user-collapsed').textContent).toBe('false')
  })

  it('無効時はクリックしても状態を更新しない', () => {
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

    fireEvent.click(button)
    expect(setIsCollapsed).not.toHaveBeenCalled()
    expect(setUserCollapsedState).not.toHaveBeenCalled()
    expect(screen.getByText('並び替えモード中')).toBeTruthy()
  })
})

describe('CardGroupTitle', () => {
  it('ドラッグハンドルを muted foreground 色で描画する', () => {
    const { container } = render(<CardGroupTitle title='動画' />)

    const dragHandle = container.querySelector('svg')
    // eslint-disable-next-line typescript/no-deprecated
    expect(dragHandle?.className.baseVal).toContain('text-muted-foreground')
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

  it('並び替えモード時に確定/キャンセル操作を実行する', () => {
    const onCancel = vi.fn()
    const onConfirm = vi.fn()

    render(
      <CardReorderControls
        isReorderMode
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    )

    fireEvent.click(
      screen.getByRole('button', { name: '並び替えをキャンセル' }),
    )
    fireEvent.click(screen.getByRole('button', { name: '並び替えを確定' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(screen.getByText('キャンセル')).toBeTruthy()
    expect(screen.getByText('確定')).toBeTruthy()
  })
})
