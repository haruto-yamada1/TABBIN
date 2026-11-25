// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/features/i18n/context/I18nProvider', () => ({
  useI18n: () => ({
    t: (key: string, _fallback?: string, vars?: Record<string, string>) =>
      vars?.query ? `${key}:${vars.query}` : key,
  }),
}))

import { SearchNoResultsNotice } from './SearchNoResultsNotice'

afterEach(cleanup)

describe('SearchNoResultsNotice', () => {
  it('検索語と解除操作を status として表示する', async () => {
    const user = userEvent.setup()
    const onClearSearch = vi.fn()
    render(
      <SearchNoResultsNotice query='nomatch' onClearSearch={onClearSearch} />,
    )

    const notice = screen.getByRole('status')
    expect(notice).toBeInTheDocument()
    expect(
      screen.getByText('savedTabs.searchNoResultsTitle'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('savedTabs.searchNoResultsDescription:nomatch'),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: 'savedTabs.searchClear' }),
    )
    expect(onClearSearch).toHaveBeenCalledTimes(1)
  })
})
