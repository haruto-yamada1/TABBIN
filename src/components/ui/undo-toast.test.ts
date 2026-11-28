import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { showUndoToast, UNDO_TOAST_DURATION_MS } from './undo-toast'

vi.mock('sonner', () => ({
  toast: {
    dismiss: vi.fn(),
    error: vi.fn(),
    info: vi.fn(() => 'undo-id'),
    success: vi.fn(),
  },
}))

const getOptions = () => vi.mocked(toast.info).mock.lastCall?.[1]

const clickUndo = () => {
  const action = getOptions()?.action
  if (!action || typeof action !== 'object' || !('onClick' in action)) {
    throw new Error('Undo action unavailable')
  }
  Reflect.apply(action.onClick, undefined, [])
}

const notify = (undo: () => Promise<void>) => {
  showUndoToast({
    message: 'Moved',
    onUndone: vi.fn(async () => {}),
    t: (key) => key,
    undo,
  })
}

describe('showUndoToast', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('expires even without a mounted toaster', () => {
    const undo = vi.fn(async () => {})
    notify(undo)

    vi.advanceTimersByTime(UNDO_TOAST_DURATION_MS)
    expect(toast.dismiss).toHaveBeenCalledWith('undo-id')
    clickUndo()
    expect(undo).not.toHaveBeenCalled()
  })

  it('checks the deadline when the close timer has not fired yet', () => {
    const undo = vi.fn(async () => {})
    notify(undo)

    vi.setSystemTime(Date.now() + UNDO_TOAST_DURATION_MS)
    clickUndo()
    expect(undo).not.toHaveBeenCalled()
  })

  it('runs a visible action only once', () => {
    const undo = vi.fn(async () => {})
    notify(undo)

    vi.advanceTimersByTime(UNDO_TOAST_DURATION_MS - 1)
    clickUndo()
    clickUndo()
    expect(undo).toHaveBeenCalledOnce()
  })

  it('releases the Undo after the toast is dismissed', () => {
    const undo = vi.fn(async () => {})
    notify(undo)
    const onDismiss = getOptions()?.onDismiss
    expect(onDismiss).toBeTypeOf('function')

    if (onDismiss) {
      Reflect.apply(onDismiss, undefined, [])
    }
    clickUndo()
    expect(undo).not.toHaveBeenCalled()
  })
})
