import { getChromeStorageLocal } from '@/lib/browser/chrome-storage'
import {
  defaultSettings,
  readUserSettingsStrict,
  requireUserSettings,
  resetInvalidUserSettings,
  saveUserSettings,
  UserSettingsReadError,
} from '@/lib/storage/settings'
/* eslint-disable no-restricted-imports -- browser-only smoke exercises the real Firefox Promise storage boundary */
import type { UserSettings } from '@/types/storage'

export type FirefoxSettingsSafetySmokeResult = {
  readonly missingStatus: string
  readonly firstUseDefaults: boolean
  readonly legacyStatus: string
  readonly legacyReadUnchanged: boolean
  readonly legacyUpgradePreserved: boolean
  readonly invalidStatus: string
  readonly invalidReadRejected: boolean
  readonly invalidWriteRejected: boolean
  readonly invalidUnchanged: boolean
  readonly resetStatus: string
  readonly resetDefaults: boolean
  readonly restored: boolean
}

const rejectsInvalidSettings = async (
  operation: () => Promise<unknown>,
): Promise<boolean> => {
  try {
    await operation()
    return false
  } catch (error) {
    return error instanceof UserSettingsReadError && error.status === 'invalid'
  }
}

const hasPreservedLegacyPolicy = (
  upgraded: UserSettings,
  saved: unknown,
): boolean =>
  !upgraded.removeTabAfterOpen &&
  !upgraded.removeTabAfterExternalDrop &&
  !upgraded.excludePinnedTabs &&
  upgraded.excludePatterns.includes('never-capture.example') &&
  upgraded.showSavedTime &&
  typeof saved === 'object' &&
  saved !== null &&
  !Object.hasOwn(saved, 'aiProvider')

/** Native Firefox must retain explicit legacy policies and reject corrupt settings. */
export const runFirefoxSettingsSafetySmoke =
  async (): Promise<FirefoxSettingsSafetySmokeResult> => {
    const local = getChromeStorageLocal()
    if (!local) {
      throw new Error('Firefox Promise storage API is unavailable.')
    }
    const previous: { readonly userSettings?: unknown } = await local.get([
      'userSettings',
    ])
    let result: Omit<FirefoxSettingsSafetySmokeResult, 'restored'>
    try {
      await local.remove('userSettings')
      const missing = await readUserSettingsStrict()
      const firstUse = await requireUserSettings()
      const legacy = {
        aiProvider: 'ollama',
        removeTabAfterOpen: false,
        removeTabAfterExternalDrop: false,
        excludePinnedTabs: false,
        excludePatterns: ['never-capture.example'],
      }
      await local.set({ userSettings: legacy })
      const legacyRead = await readUserSettingsStrict()
      const legacyReadUnchanged =
        JSON.stringify((await local.get(['userSettings'])).userSettings) ===
        JSON.stringify(legacy)
      const verifiedLegacy = await requireUserSettings()
      await saveUserSettings({ ...verifiedLegacy, showSavedTime: true })
      const upgraded = await requireUserSettings()
      const saved: unknown = (await local.get(['userSettings'])).userSettings

      const invalid = { ...legacy, removeTabAfterOpen: 'invalid' }
      await local.set({ userSettings: invalid })
      const invalidRead = await readUserSettingsStrict()
      const invalidReadRejected =
        await rejectsInvalidSettings(requireUserSettings)
      const invalidWriteRejected = await rejectsInvalidSettings(async () =>
        saveUserSettings(defaultSettings),
      )
      const invalidUnchanged =
        JSON.stringify((await local.get(['userSettings'])).userSettings) ===
        JSON.stringify(invalid)
      await resetInvalidUserSettings()
      const reset = await readUserSettingsStrict()
      const recovered = await requireUserSettings()
      result = {
        missingStatus: missing.status,
        firstUseDefaults:
          firstUse.removeTabAfterOpen === defaultSettings.removeTabAfterOpen &&
          firstUse.removeTabAfterExternalDrop ===
            defaultSettings.removeTabAfterExternalDrop &&
          firstUse.excludePinnedTabs === defaultSettings.excludePinnedTabs &&
          firstUse.autoDeletePeriod === 'never',
        legacyStatus: legacyRead.status,
        legacyReadUnchanged,
        legacyUpgradePreserved: hasPreservedLegacyPolicy(upgraded, saved),
        invalidStatus: invalidRead.status,
        invalidReadRejected,
        invalidWriteRejected,
        invalidUnchanged,
        resetStatus: reset.status,
        resetDefaults:
          recovered.removeTabAfterOpen === defaultSettings.removeTabAfterOpen &&
          recovered.removeTabAfterExternalDrop ===
            defaultSettings.removeTabAfterExternalDrop &&
          recovered.excludePinnedTabs === defaultSettings.excludePinnedTabs &&
          !recovered.excludePatterns.includes('never-capture.example'),
      }
    } finally {
      if (previous.userSettings === undefined) {
        await local.remove('userSettings')
      } else {
        await local.set({ userSettings: previous.userSettings })
      }
    }
    return {
      ...result,
      restored:
        JSON.stringify((await local.get(['userSettings'])).userSettings) ===
        JSON.stringify(previous.userSettings),
    }
  }
