import { describe, expect, it } from 'vitest'

import {
  formatLinkCaptureShortcut,
  matchLinkCaptureShortcut,
  recordLinkCaptureShortcut,
  validateLinkCaptureShortcut,
} from './shortcut'
import type { LinkCaptureShortcut } from './shortcut'

const key = (
  code = 'KeyZ',
  label = 'z',
  modifiers: Partial<LinkCaptureShortcut> = {},
): LinkCaptureShortcut => ({
  code,
  key: label,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...modifiers,
})
describe('link capture physical-key shortcuts', () => {
  it.each([
    key(),
    key('KeyZ', 'Z', { shiftKey: true }),
    key('Semicolon', 'ö'),
    key('F8', 'F8'),
    key('KeyS', 's', { ctrlKey: true, altKey: true }),
    key('ShiftLeft', 'Shift', { shiftKey: true }),
  ])('records arbitrary captured physical keys %j', (event) => {
    expect(recordLinkCaptureShortcut(event)).toEqual({ shortcut: event })
    expect(validateLinkCaptureShortcut(event)).toBeNull()
  })

  it.each([key('', 'z'), key('Unidentified', 'a')])(
    'rejects uncaptured physical codes',
    (event) =>
      expect(recordLinkCaptureShortcut(event)).toEqual({
        error: 'unavailable',
      }),
  )

  it.each(['Dead', 'Process', 'Unidentified', 'Compose'])(
    'rejects unusable key labels: %s',
    (label) => {
      expect(recordLinkCaptureShortcut(key('KeyE', label))).toEqual({
        error: 'unavailable',
      })
      expect(validateLinkCaptureShortcut(key('KeyE', label))).toBe(
        'unavailable',
      )
    },
  )

  it('refuses composition and AltGraph rather than pretending to record them', () => {
    expect(recordLinkCaptureShortcut({ ...key(), isComposing: true })).toEqual({
      error: 'composition',
    })
    expect(
      recordLinkCaptureShortcut({ ...key(), getModifierState: () => true }),
    ).toEqual({ error: 'composition' })
  })

  it.each([
    key('Escape', 'Escape'),
    key('F5', 'F5'),
    key('F4', 'F4', { altKey: true }),
    key('F4', 'F4', { ctrlKey: true }),
    key('KeyD', 'd', { altKey: true }),
    key('Tab', 'Tab'),
    key('KeyL', 'l', { ctrlKey: true }),
    key('KeyW', 'w', { metaKey: true }),
    key('ArrowLeft', 'ArrowLeft', { altKey: true }),
    key('KeyQ', 'q', { ctrlKey: true, altKey: true }),
  ])('refuses known browser or OS shortcuts %j', (event) =>
    expect(recordLinkCaptureShortcut(event)).toEqual({ error: 'reserved' }),
  )

  it('matches code and exact modifiers independently of layout labels', () => {
    expect(matchLinkCaptureShortcut(key('KeyZ', 'y'), key())).toBe(true)
    expect(matchLinkCaptureShortcut(key('KeyY', 'z'), key())).toBe(false)
    expect(matchLinkCaptureShortcut(key('KeyZ', 'Dead'), key())).toBe(false)
    expect(
      matchLinkCaptureShortcut(key('KeyZ', 'Z', { shiftKey: true }), key()),
    ).toBe(false)
    expect(
      matchLinkCaptureShortcut({ ...key(), isComposing: true }, key()),
    ).toBe(false)
  })

  it('labels physical keys and modifiers without duplicating modifier-only bindings', () => {
    expect(
      formatLinkCaptureShortcut(
        key('KeyZ', 'y', { ctrlKey: true, altKey: true }),
      ),
    ).toBe('Ctrl + Alt + KeyZ (y)')
    expect(
      formatLinkCaptureShortcut(key('ShiftLeft', 'Shift', { shiftKey: true })),
    ).toBe('ShiftLeft (Shift)')
  })
})
