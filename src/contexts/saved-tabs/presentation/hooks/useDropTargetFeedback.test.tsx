import type * as DndCore from '@dnd-kit/core'
import type { Active, CollisionDetection } from '@dnd-kit/core'
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useDropTargetFeedback } from './useDropTargetFeedback'

type Container =
  Parameters<CollisionDetection>[0]['droppableContainers'][number]
const { context } = vi.hoisted(() => ({
  context: {
    active: null as Active | null,
    over: null as {
      id: string
      data?: { current: Record<string, unknown> }
    } | null,
    droppableContainers: new Map<string, Container>(),
  },
}))
vi.mock('@dnd-kit/core', async (importOriginal) => ({
  ...(await importOriginal<typeof DndCore>()),
  useDndContext: () => context,
}))

const start = (type: string, projectId = 'source') => {
  context.active = {
    id: 'dragged-item',
    data: { current: { type, projectId } },
    rect: { current: { initial: null, translated: null } },
  }
}
const register = (type: string, projectId = 'source', disabled = false) => {
  context.droppableContainers.set('target', {
    id: 'target',
    key: 'target',
    data: { current: { type, projectId } },
    disabled,
    node: { current: null },
    rect: { current: null },
  })
}

describe('drop candidate feedback', () => {
  beforeEach(() => {
    context.active = null
    context.over = null
    context.droppableContainers.clear()
  })

  it.each(['parent-category', 'category-section'] as const)(
    '%s shows candidates, distinguishes the active target, and clears on finish',
    (accepts) => {
      const { result, rerender } = renderHook(() =>
        useDropTargetFeedback({ id: 'target', accepts }),
      )
      expect(result.current.state).toBe('idle')
      start(accepts)
      rerender()
      expect(result.current.state).toBe('available')
      expect(result.current.className).toContain('outline-dashed')
      context.over = { id: 'target' }
      rerender()
      expect(result.current.state).toBe('over')
      expect(result.current.className).toContain('outline-solid')
      context.active = null
      rerender()
      expect(result.current).toEqual({ state: 'idle', className: '' })
    },
  )

  it('does not invite a domain URL into a category reorder context', () => {
    start('url')
    const { result } = renderHook(() =>
      useDropTargetFeedback({ id: 'target', accepts: 'category-section' }),
    )
    expect(result.current.state).toBe('unavailable')
  })

  it.each([
    ['url', 'category', 'source', 'available'],
    ['url', 'category', 'other', 'available'],
    ['url', 'uncategorized', 'source', 'available'],
    ['category', 'category', 'source', 'available'],
    ['category', 'category', 'other', 'unavailable'],
    ['category', 'uncategorized', 'source', 'unavailable'],
    ['project', 'category', 'source', 'unavailable'],
  ])(
    'matches Custom %s drag into %s in %s',
    (source, target, project, state) => {
      start(source)
      register(target, project)
      const { result } = renderHook(() =>
        useDropTargetFeedback({ id: 'target', accepts: 'custom' }),
      )
      expect(result.current.state).toBe(state)
    },
  )

  it('highlights a category when its nested URL is over, but never an invalid category', () => {
    start('url')
    register('category')
    context.over = { id: 'nested-url' }
    const { result, rerender } = renderHook(() =>
      useDropTargetFeedback({ id: 'target', accepts: 'custom', isOver: true }),
    )
    expect(result.current.state).toBe('over')
    start('category')
    register('category', 'other')
    rerender()
    expect(result.current.state).toBe('unavailable')
    expect(result.current.className).toContain('outline-dotted')
  })

  it('marks the uncategorized area selected when its URL row is the actual target', () => {
    start('url')
    register('uncategorized')
    context.over = {
      id: 'nested-url',
      data: { current: { type: 'url', projectId: 'source' } },
    }
    const { result, rerender } = renderHook(() =>
      useDropTargetFeedback({ id: 'target', accepts: 'custom', isOver: false }),
    )
    expect(result.current.state).toBe('over')
    context.over = {
      id: 'other-url',
      data: { current: { type: 'url', projectId: 'other' } },
    }
    rerender()
    expect(result.current.state).toBe('available')
    context.over = {
      id: 'categorized-url',
      data: { current: { type: 'url', projectId: 'source', category: 'Work' } },
    }
    rerender()
    expect(result.current.state).toBe('available')
  })

  it('does not advertise missing or disabled targets', () => {
    start('url')
    const { result, rerender } = renderHook(() =>
      useDropTargetFeedback({ id: 'target', accepts: 'custom' }),
    )
    expect(result.current.state).toBe('unavailable')
    register('category', 'source', true)
    rerender()
    expect(result.current.state).toBe('unavailable')
  })

  it('distinguishes the dragged category from eligible destinations', () => {
    start('category')
    const { result } = renderHook(() =>
      useDropTargetFeedback({ id: 'dragged-item', accepts: 'custom' }),
    )
    expect(result.current.state).toBe('source')
  })
})
