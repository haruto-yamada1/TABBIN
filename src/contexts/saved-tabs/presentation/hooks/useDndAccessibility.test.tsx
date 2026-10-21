// @vitest-environment jsdom
import type { Active, Over } from '@dnd-kit/core'
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { getMessages } from '@/features/i18n/messages'

import { useDndAccessibility } from './useDndAccessibility'

const language = vi.hoisted(() => ({ current: 'en' as 'en' | 'ja' }))
vi.mock('@/features/i18n/context/I18nProvider', () => ({
  useI18n: () => ({
    t: (key: string, _fallback?: string, values?: Record<string, string>) => {
      const messages: Record<string, string> = getMessages(language.current)
      return (messages[key] ?? key).replaceAll(
        /\{\{(\w+)\}\}/g,
        (_match, name: string) => values?.[name] ?? '',
      )
    },
  }),
}))

const active: Active = {
  id: 'opaque-active',
  data: {
    current: {
      name: 'First tab',
      sortable: { index: 0, items: ['opaque-active', 'opaque-over'] },
    },
  },
  rect: { current: { initial: null, translated: null } },
}
const over: Over = {
  id: 'opaque-over',
  data: {
    current: {
      name: 'Second tab',
      sortable: { index: 1, items: ['opaque-active', 'opaque-over'] },
    },
  },
  disabled: false,
  rect: { top: 0, left: 0, right: 100, bottom: 40, width: 100, height: 40 },
}
const event = {
  active,
  over,
  activatorEvent: new KeyboardEvent('keydown'),
  collisions: [],
  delta: { x: 0, y: 40 },
}

describe('DnD accessibility', () => {
  it.each(['en', 'ja'] as const)(
    'announces the name, one item and position in %s',
    (locale) => {
      language.current = locale
      const { result } = renderHook(() => useDndAccessibility())
      const announcements = result.current.announcements
      expect(announcements?.onDragStart?.(event)).toContain('First tab')
      expect(announcements?.onDragStart?.(event)).not.toContain('opaque-active')
      expect(announcements?.onDragOver?.(event)).toContain('Second tab')
      const end = announcements?.onDragEnd?.(event)
      expect(end).toContain(locale === 'en' ? 'Position 2 of 2' : '2件中2番目')
      expect(end).toContain(locale === 'en' ? 'preview' : 'プレビュー')
      expect(result.current.screenReaderInstructions?.draggable).toMatch(
        /Space.*Enter/u,
      )
    },
  )

  it('distinguishes saving from confirmation and canceled/no-target drags', () => {
    language.current = 'en'
    const { result } = renderHook(() => useDndAccessibility('custom'))
    expect(result.current.announcements?.onDragEnd?.(event)).toContain(
      'starts saving',
    )
    expect(result.current.announcements?.onDragEnd?.(event)).not.toContain(
      'preview',
    )
    expect(
      result.current.announcements?.onDragEnd?.({ ...event, over: null }),
    ).toContain('No change was saved')
    expect(
      result.current.announcements?.onDragEnd?.({
        ...event,
        over: { ...over, id: active.id },
      }),
    ).toContain('Canceled')
    expect(
      result.current.announcements?.onDragOver?.({ ...event, over: null }),
    ).toContain('no drop target')
    expect(result.current.announcements?.onDragCancel?.(event)).toContain(
      'First tab',
    )
    expect(result.current.screenReaderInstructions?.draggable).toContain(
      'another project',
    )
  })

  it('handles an unnumbered drop area and missing sortable metadata', () => {
    language.current = 'en'
    const { result } = renderHook(() => useDndAccessibility('immediate'))
    for (const sortable of [
      undefined,
      null,
      {},
      { index: -1, items: [] },
      { index: 0 },
      { items: [] },
      { index: 0, items: null },
    ]) {
      const area = {
        ...over,
        data: { current: { name: 'Uncategorized', sortable } },
      }
      const message = result.current.announcements?.onDragOver?.({
        ...event,
        over: area,
      })
      expect(message).toContain('Uncategorized')
      expect(message).not.toContain('Position')
    }
    expect(
      result.current.announcements?.onDragStart?.({
        ...event,
        active: { ...active, data: { current: {} } },
      }),
    ).toContain(active.id)
    expect(result.current.screenReaderInstructions?.draggable).toContain(
      'starts saving',
    )
    const uncategorized = {
      ...active,
      data: { current: { name: '__uncategorized' } },
    }
    expect(
      result.current.announcements?.onDragStart?.({
        ...event,
        active: uncategorized,
      }),
    ).toContain('Uncategorized')
  })
})
