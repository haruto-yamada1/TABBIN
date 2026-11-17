import { z } from 'zod'

import { LINK_CAPTURE_SETTINGS_KEY } from '@/constants/linkCapture'
import { getChromeStorageLocal } from '@/lib/browser/chrome-storage'
import { validateLinkCaptureShortcut } from '@/lib/link-capture/shortcut'
import type { LinkCaptureShortcut } from '@/lib/link-capture/shortcut'

export type LinkCaptureSettings = {
  enabled: boolean
  shortcut: LinkCaptureShortcut
}
export const DEFAULT_LINK_CAPTURE_SETTINGS: LinkCaptureSettings = {
  enabled: false,
  shortcut: {
    code: 'KeyZ',
    key: 'z',
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
  },
}
const settingsSchema = z.strictObject({
  enabled: z.boolean(),
  shortcut: z
    .strictObject({
      code: z.string(),
      key: z.string(),
      ctrlKey: z.boolean(),
      altKey: z.boolean(),
      shiftKey: z.boolean(),
      metaKey: z.boolean(),
    })
    .refine((shortcut) => validateLinkCaptureShortcut(shortcut) === null),
})

export const readLinkCaptureSettings =
  async (): Promise<LinkCaptureSettings> => {
    const storage = getChromeStorageLocal()
    if (!storage) {
      throw new Error('Link capture storage unavailable')
    }
    const values = await storage.get([LINK_CAPTURE_SETTINGS_KEY])
    const value: unknown = values[LINK_CAPTURE_SETTINGS_KEY]
    return value === undefined
      ? structuredClone(DEFAULT_LINK_CAPTURE_SETTINGS)
      : settingsSchema.parse(value)
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
