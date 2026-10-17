import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { formatFixedDatetime } from '@/utils/localDateTime'

import { SavedTime } from './SavedTime'

const state = vi.hoisted(() => ({ language: 'en' as 'en' | 'ja' }))
vi.mock('@/features/i18n/context/I18nProvider', () => ({
  useI18n: () => ({ language: state.language }),
}))
const savedAt = Date.parse('2026-10-17T00:00:00Z')

describe('SavedTime shared clock', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(savedAt + 2 * 60_000)
    state.language = 'en'
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('複数行は1つの時計で更新し最後のunmountで解放する', () => {
    const interval = vi.spyOn(globalThis, 'setInterval')
    const view = render(
      <>
        <SavedTime savedAt={savedAt} relative />
        <SavedTime savedAt={savedAt} relative />
      </>,
    )
    expect(interval).toHaveBeenCalledTimes(1)
    expect(screen.getAllByText('2 minutes ago')).toHaveLength(2)
    expect(screen.getAllByText('2 minutes ago')[0]).toHaveAttribute(
      'title',
      formatFixedDatetime(savedAt),
    )
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(screen.getAllByText('3 minutes ago')).toHaveLength(2)
    view.rerender(<SavedTime savedAt={savedAt} relative />)
    expect(vi.getTimerCount()).toBe(1)
    view.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('絶対表示と不正日時はtimerを作らず、設定切替・言語切替・再mountで新しい時刻を使う', () => {
    const view = render(<SavedTime savedAt={savedAt} relative={false} />)
    expect(screen.getByText(formatFixedDatetime(savedAt))).toBeTruthy()
    expect(vi.getTimerCount()).toBe(0)
    view.rerender(<SavedTime savedAt={Number.NaN} relative />)
    expect(screen.getByText('-')).not.toHaveAttribute('title')
    expect(vi.getTimerCount()).toBe(0)
    vi.setSystemTime(savedAt + 2 * 3_600_000)
    view.rerender(<SavedTime savedAt={savedAt} relative />)
    expect(screen.getByText('2 hours ago')).toBeTruthy()
    state.language = 'ja'
    view.rerender(<SavedTime savedAt={savedAt} relative />)
    expect(screen.getByText('2 時間前')).toBeTruthy()
    view.unmount()
    vi.setSystemTime(savedAt + 3 * 3_600_000)
    render(<SavedTime savedAt={savedAt} relative />)
    expect(screen.getByText('3 時間前')).toBeTruthy()
  })

  it.each(['focus', 'visibilitychange'])(
    '%sで復帰直後の時刻に更新する',
    (event) => {
      render(<SavedTime savedAt={savedAt} relative />)
      vi.setSystemTime(savedAt + 4 * 3_600_000)
      act(() => {
        ;(event === 'focus' ? window : document).dispatchEvent(new Event(event))
      })
      expect(screen.getByText('4 hours ago')).toBeTruthy()
    },
  )
})
