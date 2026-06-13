// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const lazyMock = vi.hoisted(() => ({
  onOpenChange: undefined as ((isOpen: boolean) => void) | undefined,
}))

vi.mock('@/features/ai-chat/components/LazySavedTabsChatWidget', () => ({
  LazySavedTabsChatWidget: ({
    historyVariant,
    onOpenChange,
  }: {
    historyVariant?: string
    onOpenChange?: (isOpen: boolean) => void
  }) => {
    lazyMock.onOpenChange = onOpenChange
    return (
      <div data-testid='lazy-saved-tabs-chat-widget'>
        {`historyVariant:${historyVariant ?? 'none'}`}
      </div>
    )
  },
}))

import { SavedTabsChatWidgetBridge } from './SavedTabsChatWidgetBridge'

describe('SavedTabsChatWidgetBridge', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    lazyMock.onOpenChange = undefined
  })

  it('LazySavedTabsChatWidget を historyVariant=dropdown 固定で描画する', () => {
    render(<SavedTabsChatWidgetBridge onOpenChange={vi.fn()} />)
    expect(screen.getByTestId('lazy-saved-tabs-chat-widget').textContent).toBe(
      'historyVariant:dropdown',
    )
  })

  it('渡した onOpenChange を LazySavedTabsChatWidget へそのまま伝える', () => {
    const onOpenChange = vi.fn()
    render(<SavedTabsChatWidgetBridge onOpenChange={onOpenChange} />)
    expect(lazyMock.onOpenChange).toBe(onOpenChange)
  })
})
