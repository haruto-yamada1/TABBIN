import { SAVED_TAB_TITLE_ENABLED_KEY } from '@/constants/savedTabTitleIndicator'
import { getChromeStorageLocal } from '@/lib/browser/chrome-storage'

export const readSavedTabTitleEnabled = async (): Promise<boolean> => {
  const storage = getChromeStorageLocal()
  if (!storage) {
    return false
  }
  const data = await storage.get([SAVED_TAB_TITLE_ENABLED_KEY])
  return data[SAVED_TAB_TITLE_ENABLED_KEY] === true
}

export const setSavedTabTitleEnabled = async (
  enabled: boolean,
): Promise<boolean> => {
  const storage = getChromeStorageLocal()
  if (!storage) {
    throw new Error('Saved tab title setting storage unavailable')
  }
  await storage.set({ [SAVED_TAB_TITLE_ENABLED_KEY]: enabled })
  return enabled
}
