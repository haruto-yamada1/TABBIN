import type { DraggableSyntheticListeners } from '@dnd-kit/core'
import type { HTMLAttributes, PointerEvent } from 'react'

/** Keep mouse/keyboard activators while allowing touch panning outside the grip. */
export const getTouchHandleListeners = (
  sortableListeners: DraggableSyntheticListeners,
): HTMLAttributes<HTMLElement> => {
  const listeners: HTMLAttributes<HTMLElement> = sortableListeners ?? {}
  const handlePointerDown = (event: PointerEvent<HTMLElement>) => {
    if (
      event.pointerType === 'touch' &&
      !(
        event.target instanceof Element &&
        event.target.closest('[data-saved-tabs-drag-handle]')
      )
    ) {
      return
    }
    listeners.onPointerDown?.(event)
  }
  return { ...listeners, onPointerDown: handlePointerDown }
}
