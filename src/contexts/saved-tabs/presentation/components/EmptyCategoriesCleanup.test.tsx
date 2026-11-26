// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/features/i18n/context/I18nProvider', () => ({
  useI18n: () => ({
    t: (key: string, _fallback?: string, vars?: Record<string, string>) =>
      vars?.name ? `${key}:${vars.name}` : key,
  }),
}))

import { EmptyCategoriesCleanup } from './EmptyCategoriesCleanup'

afterEach(cleanup)

const categories = [
  { collections: [], id: 'empty-1', name: 'Empty One' },
  { collections: [], id: 'empty-2', name: 'Empty Two' },
]

describe('EmptyCategoriesCleanup', () => {
  it('空カテゴリを候補として一覧し、影響を表示する', () => {
    render(
      <EmptyCategoriesCleanup
        categories={categories}
        onDeleteCategory={vi.fn()}
      />,
    )

    expect(
      screen.getByText('savedTabs.emptyCategoriesTitle'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('savedTabs.emptyCategoriesDescription'),
    ).toBeInTheDocument()
    expect(screen.getByText('Empty One')).toBeInTheDocument()
    expect(screen.getByText('Empty Two')).toBeInTheDocument()
  })

  it('削除は確認を挟んでから実行し、キャンセルで取り消せる', async () => {
    const user = userEvent.setup()
    const onDeleteCategory = vi.fn()
    render(
      <EmptyCategoriesCleanup
        categories={categories}
        onDeleteCategory={onDeleteCategory}
      />,
    )

    const clickFirstDeleteButton = async () => {
      const [firstDeleteButton] = screen.getAllByRole('button', {
        name: 'common.delete',
      })
      if (!firstDeleteButton) {
        throw new Error('削除ボタンが見つかりません')
      }
      await user.click(firstDeleteButton)
    }

    await clickFirstDeleteButton()
    expect(onDeleteCategory).not.toHaveBeenCalled()
    expect(
      screen.getByText('savedTabs.emptyCategoriesConfirm:Empty One'),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'common.cancel' }))
    expect(onDeleteCategory).not.toHaveBeenCalled()
    expect(
      screen.queryByText('savedTabs.emptyCategoriesConfirm:Empty One'),
    ).toBeNull()

    await clickFirstDeleteButton()
    await clickFirstDeleteButton()
    expect(onDeleteCategory).toHaveBeenCalledExactlyOnceWith('empty-1')
  })

  it('候補がなければ何も表示しない', () => {
    render(
      <EmptyCategoriesCleanup categories={[]} onDeleteCategory={vi.fn()} />,
    )

    expect(screen.queryByText('savedTabs.emptyCategoriesTitle')).toBeNull()
    expect(screen.queryByTestId('empty-categories-cleanup')).toBeNull()
  })
})
