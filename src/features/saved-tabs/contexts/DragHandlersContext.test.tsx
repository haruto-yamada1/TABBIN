// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest' // eslint-disable-line

import { DragHandlersContext, useDragHandlers } from './DragHandlersContext'

const Consumer = () => {
  const context = useDragHandlers()
  return (
    <>
      <span>{typeof context.registerHandlers}</span>
      <span>{typeof context.unregisterHandlers}</span>
    </>
  )
}

const mockContextValue = { registerHandlers: vi.fn(), unregisterHandlers: vi.fn() }

describe('DragHandlersContext', () => {
  it('provider 配下では登録ハンドラを取得できる', () => {
    render(
      <DragHandlersContext.Provider value={mockContextValue}>
        <Consumer />
      </DragHandlersContext.Provider>,
    )

    expect(screen.getAllByText('function')).toHaveLength(2)
  })

  it('provider 外ではエラーを投げる', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => render(<Consumer />)).toThrow(
      'useDragHandlers must be used within a DragHandlersContextProvider',
    )
  })
})
