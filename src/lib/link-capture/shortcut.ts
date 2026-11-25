export type LinkCaptureShortcut = {
  code: string
  key: string
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  metaKey: boolean
}
export type ShortcutError = 'unavailable' | 'composition' | 'reserved'
export type ShortcutEvent = LinkCaptureShortcut & {
  isComposing?: boolean
  getModifierState?: (key: string) => boolean
}
const navigationKeys = new Set([
  'Escape',
  'Tab',
  'Enter',
  'Space',
  'Backspace',
  'Delete',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'F1',
  'F3',
  'F5',
  'F6',
  'F7',
  'F10',
  'F11',
  'F12',
  'PrintScreen',
  'Pause',
  'ContextMenu',
])
const primaryBrowserKeys = new Set([
  'KeyA',
  'KeyB',
  'KeyC',
  'KeyD',
  'KeyE',
  'KeyF',
  'KeyG',
  'KeyH',
  'KeyI',
  'KeyJ',
  'KeyK',
  'KeyL',
  'KeyM',
  'KeyN',
  'KeyO',
  'KeyP',
  'KeyQ',
  'KeyR',
  'KeyS',
  'KeyT',
  'KeyU',
  'KeyV',
  'KeyW',
  'KeyX',
  'KeyY',
  'KeyZ',
  'Comma',
  'Period',
  'Equal',
  'Minus',
  'Digit0',
  'Digit1',
  'Digit2',
  'Digit3',
  'Digit4',
  'Digit5',
  'Digit6',
  'Digit7',
  'Digit8',
  'Digit9',
  'BracketLeft',
  'BracketRight',
])

const MAX_KEY_LABEL_LENGTH = 64
const unusableKeyLabels = new Set([
  'Dead',
  'Process',
  'Unidentified',
  'Compose',
])
const isWindowOrMenuShortcut = (shortcut: LinkCaptureShortcut): boolean =>
  (shortcut.code === 'F4' && (shortcut.ctrlKey || shortcut.altKey)) ||
  (shortcut.altKey &&
    !shortcut.ctrlKey &&
    ['KeyD', 'KeyE', 'KeyF'].includes(shortcut.code))

const isReservedShortcut = (shortcut: LinkCaptureShortcut): boolean =>
  navigationKeys.has(shortcut.code) ||
  isWindowOrMenuShortcut(shortcut) ||
  ((shortcut.ctrlKey || shortcut.metaKey) &&
    !shortcut.altKey &&
    primaryBrowserKeys.has(shortcut.code)) ||
  (shortcut.metaKey && shortcut.altKey && shortcut.code === 'KeyI') ||
  (shortcut.ctrlKey && shortcut.altKey && shortcut.code === 'KeyQ') ||
  (shortcut.metaKey && shortcut.code === 'KeyQ')

export const validateLinkCaptureShortcut = (
  shortcut: LinkCaptureShortcut,
): ShortcutError | null => {
  if (
    !shortcut.code ||
    shortcut.code === 'Unidentified' ||
    !/^[a-zA-Z][a-zA-Z0-9]{0,63}$/.test(shortcut.code) ||
    !shortcut.key ||
    unusableKeyLabels.has(shortcut.key) ||
    shortcut.key.length > MAX_KEY_LABEL_LENGTH
  ) {
    return 'unavailable'
  }
  if (isReservedShortcut(shortcut)) {
    return 'reserved'
  }
  return null
}

/** Modified link clicks belong to the browser (tabs, windows, or downloads). */
export const validateLinkClickShortcut = (
  shortcut: LinkCaptureShortcut,
): ShortcutError | null =>
  validateLinkCaptureShortcut(shortcut) ??
  (shortcut.ctrlKey ||
  shortcut.altKey ||
  shortcut.shiftKey ||
  shortcut.metaKey ||
  /^(Control|Alt|Shift|Meta)/.test(shortcut.code)
    ? 'reserved'
    : null)

export const recordLinkCaptureShortcut = (
  event: ShortcutEvent,
): { shortcut: LinkCaptureShortcut } | { error: ShortcutError } => {
  if (event.isComposing || event.getModifierState?.('AltGraph')) {
    return { error: 'composition' }
  }
  const shortcut: LinkCaptureShortcut = {
    code: event.code,
    key: event.key,
    ctrlKey: event.ctrlKey,
    altKey: event.altKey,
    shiftKey: event.shiftKey,
    metaKey: event.metaKey,
  }
  const error = validateLinkCaptureShortcut(shortcut)
  return error ? { error } : { shortcut }
}

export const matchLinkCaptureShortcut = (
  event: ShortcutEvent,
  shortcut: LinkCaptureShortcut,
): boolean =>
  !event.isComposing &&
  !unusableKeyLabels.has(event.key) &&
  !event.getModifierState?.('AltGraph') &&
  event.code === shortcut.code &&
  event.ctrlKey === shortcut.ctrlKey &&
  event.altKey === shortcut.altKey &&
  event.shiftKey === shortcut.shiftKey &&
  event.metaKey === shortcut.metaKey

export const formatLinkCaptureShortcut = (
  shortcut: LinkCaptureShortcut,
): string =>
  [
    shortcut.ctrlKey && !shortcut.code.startsWith('Control') && 'Ctrl',
    shortcut.altKey && !shortcut.code.startsWith('Alt') && 'Alt',
    shortcut.shiftKey && !shortcut.code.startsWith('Shift') && 'Shift',
    shortcut.metaKey && !shortcut.code.startsWith('Meta') && 'Meta',
    `${shortcut.code} (${shortcut.key})`,
  ]
    .filter(Boolean)
    .join(' + ')
