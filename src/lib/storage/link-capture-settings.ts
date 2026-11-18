import { z } from 'zod'

import { LINK_CAPTURE_SETTINGS_KEY } from '@/constants/linkCapture'
import { isObjectLike } from '@/lib/browser/chrome-global'
import { getChromeStorageLocal } from '@/lib/browser/chrome-storage'
import {
  validateLinkCaptureShortcut,
  validateLinkClickShortcut,
} from '@/lib/link-capture/shortcut'
import type { LinkCaptureShortcut } from '@/lib/link-capture/shortcut'

export type LinkCaptureSettings = {
  enabled: boolean
  shortcut: LinkCaptureShortcut
  clickEnabled: boolean
  clickShortcut: LinkCaptureShortcut
}
const DEFAULT_CAPTURE_SHORTCUT: LinkCaptureShortcut = {
  code: 'KeyZ',
  key: 'z',
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
}
export const DEFAULT_LINK_CAPTURE_SETTINGS: LinkCaptureSettings = {
  enabled: false,
  shortcut: { ...DEFAULT_CAPTURE_SHORTCUT },
  clickEnabled: false,
  clickShortcut: { ...DEFAULT_CAPTURE_SHORTCUT },
}
const shortcutSchema = z.strictObject({
  code: z.string(),
  key: z.string(),
  ctrlKey: z.boolean(),
  altKey: z.boolean(),
  shiftKey: z.boolean(),
  metaKey: z.boolean(),
})
const legacySettingsSchema = z.strictObject({
  enabled: z.boolean(),
  shortcut: shortcutSchema.refine(
    (shortcut) => validateLinkCaptureShortcut(shortcut) === null,
  ),
})
const settingsSchema = legacySettingsSchema.extend({
  clickEnabled: z.boolean(),
  clickShortcut: shortcutSchema.refine(
    (shortcut) => validateLinkClickShortcut(shortcut) === null,
  ),
})

export const readLinkCaptureSettings =
  async (): Promise<LinkCaptureSettings> => {
    const storage = getChromeStorageLocal()
    if (!storage) {
      throw new Error('Link capture storage unavailable')
    }
    const values = await storage.get([LINK_CAPTURE_SETTINGS_KEY])
    const value: unknown = values[LINK_CAPTURE_SETTINGS_KEY]
    if (value === undefined) {
      return structuredClone(DEFAULT_LINK_CAPTURE_SETTINGS)
    }
    if (
      typeof value === 'object' &&
      value !== null &&
      !Object.hasOwn(value, 'clickEnabled') &&
      !Object.hasOwn(value, 'clickShortcut')
    ) {
      return {
        ...structuredClone(DEFAULT_LINK_CAPTURE_SETTINGS),
        ...legacySettingsSchema.parse(value),
      }
    }
    return settingsSchema.parse(value)
  }
export const writeLinkCaptureSettings = async (
  settings: LinkCaptureSettings,
): Promise<LinkCaptureSettings> => {
  const value = settingsSchema.parse(settings)
  const storage = getChromeStorageLocal()
  if (!storage) {
    throw new Error('Link capture storage unavailable')
  }
  await storage.set({ [LINK_CAPTURE_SETTINGS_KEY]: value })
  return value
}

export class LinkCaptureSettingsReadError extends Error {
  constructor() {
    super('Link capture settings could not be read')
    this.name = 'LinkCaptureSettingsReadError'
  }
}

const isLockManager = (value: unknown): value is LockManager =>
  isObjectLike(value) && typeof Reflect.get(value, 'request') === 'function'

/** Coordinate both gesture sections and every open Options page. */
export const updateLinkCaptureSettings = async (
  change: Partial<LinkCaptureSettings>,
): Promise<LinkCaptureSettings> => {
  const patch = settingsSchema.partial().parse(change)
  const navigatorValue: unknown = Reflect.get(globalThis, 'navigator')
  const locks: unknown = isObjectLike(navigatorValue)
    ? Reflect.get(navigatorValue, 'locks')
    : undefined
  if (!isLockManager(locks)) {
    throw new Error('Link capture settings coordination is unavailable')
  }
  return locks.request(
    'tabbin:link-capture-settings:v1',
    { mode: 'exclusive' },
    async () => {
      let current: LinkCaptureSettings
      try {
        current = await readLinkCaptureSettings()
      } catch {
        throw new LinkCaptureSettingsReadError()
      }
      return writeLinkCaptureSettings(
        settingsSchema.parse({ ...current, ...patch }),
      )
    },
  )
}
