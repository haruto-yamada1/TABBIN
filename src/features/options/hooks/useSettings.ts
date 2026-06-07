import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import {
  getChromeStorageOnChanged,
  warnMissingChromeStorage,
} from '@/lib/browser/chrome-storage'
import {
  defaultSettings,
  getUserSettings,
  saveUserSettings,
} from '@/lib/storage/settings'
import type { UserSettings } from '@/types/storage'

const normalizeExcludePattern = (pattern: string) => pattern.trim()
const SETTINGS_SAVE_ERROR_MESSAGE = '設定の保存に失敗しました'

export const useSettings = () => { // eslint-disable-line eslint/max-lines-per-function
  const [{ isLoading, settings }, setSettingsState] = useState({
    isLoading: true,
    settings: defaultSettings,
  })
  const [excludePatternInput, setExcludePatternInput] = useState('')
  const settingsRef = useRef(settings)
  const persistedSettingsRef = useRef(settings)
  const setSettings = (nextSettings: React.SetStateAction<UserSettings>) => {
    setSettingsState((prev) => ({
      ...prev,
      settings: (() => {
        const resolvedSettings =
          typeof nextSettings === 'function'
            ? nextSettings(prev.settings)
            : nextSettings
        settingsRef.current = resolvedSettings
        return resolvedSettings
      })(),
    }))
  }

  useEffect(() => {
    settingsRef.current = settings
  }, [settings])

  const retrySaveSettings = async (
    failedSettings: UserSettings,
    rollbackSettings: UserSettings,
  ) => {
    settingsRef.current = failedSettings
    setSettings(failedSettings)

    try {
      await saveUserSettings(failedSettings)
      persistedSettingsRef.current = failedSettings
    } catch (error) {
      console.error('設定の再保存エラー:', error)
      settingsRef.current = rollbackSettings
      setSettings(rollbackSettings)
      notifySaveError(failedSettings, rollbackSettings)
    }
  }

  const notifySaveError = (
    failedSettings: UserSettings,
    rollbackSettings: UserSettings,
  ) => {
    toast.error(SETTINGS_SAVE_ERROR_MESSAGE, {
      action: {
        label: '再試行',
        // eslint-disable-next-line typescript/no-misused-promises
        onClick: () => retrySaveSettings(failedSettings, rollbackSettings),
      },
    })
  }

  const handleSaveFailure = (
    error: unknown,
    message: string,
    failedSettings: UserSettings,
    rollbackSettings: UserSettings,
  ) => {
    console.error(message, error)
    settingsRef.current = rollbackSettings
    setSettings(rollbackSettings)
    notifySaveError(failedSettings, rollbackSettings)
  }

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const userSettings = await getUserSettings()
        settingsRef.current = userSettings
        persistedSettingsRef.current = userSettings
        setSettingsState({
          isLoading: false,
          settings: userSettings,
        })
      } catch (error) {
        console.error('設定の読み込みエラー:', error)
        setSettingsState({
          isLoading: false,
          settings: defaultSettings,
        })
      }
    }

    // eslint-disable-next-line typescript/no-floating-promises
    loadSettings()
  }, [])

  useEffect(() => {
    const storageChangeListener = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName === 'local' && changes.userSettings) {
        if (changes.userSettings.newValue) {
          // NewValue は完全な UserSettings オブジェクトであると期待
          // eslint-disable-next-line typescript/no-unsafe-type-assertion
          const nextSettings = changes.userSettings.newValue as UserSettings
          persistedSettingsRef.current = nextSettings
          setSettings(nextSettings)
        } else {
          // UserSettings がストレージから削除された場合 (newValue が undefined)
          // デフォルト設定に戻す
          persistedSettingsRef.current = defaultSettings
          setSettings(defaultSettings)
        }
      }
    }

    const storageOnChanged = getChromeStorageOnChanged()
    if (!storageOnChanged) {
      warnMissingChromeStorage('設定変更監視')
      return
    }

    storageOnChanged.addListener(storageChangeListener)

    // クリーンアップ関数
    // eslint-disable-next-line typescript/consistent-return
    return () => {
      storageOnChanged.removeListener(storageChangeListener)
    }
  }, [])

  const handleSaveSettings = async () => {
    const rollbackSettings = persistedSettingsRef.current
    // 保存する前に空の行を除外
    const cleanSettings = {
      ...settingsRef.current,
      excludePatterns: settingsRef.current.excludePatterns.filter((p) =>
        normalizeExcludePattern(p),
      ),
    }

    settingsRef.current = cleanSettings
    setSettings(cleanSettings)

    try {
      await saveUserSettings(cleanSettings)
      persistedSettingsRef.current = cleanSettings
      return true
    } catch (error) {
      handleSaveFailure(
        error,
        '設定の保存エラー:',
        cleanSettings,
        rollbackSettings,
      )
      return false
    }
  }

  const updateSetting = async <K extends keyof UserSettings>(
    key: K,
    value: UserSettings[K],
  ) => {
    const rollbackSettings = settingsRef.current
    const newSettings = {
      ...settingsRef.current,
      [key]: value,
    }

    settingsRef.current = newSettings
    setSettings(newSettings)

    try {
      await saveUserSettings(newSettings)
      persistedSettingsRef.current = newSettings
      return true
    } catch (error) {
      handleSaveFailure(
        error,
        `設定の保存エラー (${key}):`,
        newSettings,
        rollbackSettings,
      )
      return false
    }
  }

  const handleExcludePatternsChange = (
    e: React.ChangeEvent<HTMLTextAreaElement>,
  ) => {
    // 空の行も含めて全ての行を保持
    const patterns = e.target.value.split('\n')
    setSettings((prev) => ({
      ...prev,
      excludePatterns: patterns,
    }))
  }

  const handleExcludePatternsBlur = () => {
    // eslint-disable-next-line typescript/no-floating-promises
    handleSaveSettings()
  }

  const handleExcludePatternInputChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setExcludePatternInput(e.target.value)
  }

  const addExcludePattern = async () => {
    const trimmedPattern = normalizeExcludePattern(excludePatternInput)

    if (!trimmedPattern) {
      setExcludePatternInput('')
      return false
    }

    const hasDuplicate = settingsRef.current.excludePatterns.some(
      (pattern) => normalizeExcludePattern(pattern) === trimmedPattern,
    )
    if (hasDuplicate) {
      return false
    }

    const rollbackSettings = settingsRef.current
    const newSettings = {
      ...settingsRef.current,
      excludePatterns: [...settingsRef.current.excludePatterns, trimmedPattern],
    }

    settingsRef.current = newSettings
    setSettings(newSettings)

    try {
      await saveUserSettings(newSettings)
      persistedSettingsRef.current = newSettings
      setExcludePatternInput('')
      return true
    } catch (error) {
      handleSaveFailure(
        error,
        '除外パターンの追加エラー:',
        newSettings,
        rollbackSettings,
      )
      return false
    }
  }

  const removeExcludePattern = async (patternToRemove: string) => {
    const targetPattern = normalizeExcludePattern(patternToRemove)
    const rollbackSettings = settingsRef.current
    const newSettings = {
      ...settingsRef.current,
      excludePatterns: settingsRef.current.excludePatterns.filter(
        (pattern) => normalizeExcludePattern(pattern) !== targetPattern,
      ),
    }

    settingsRef.current = newSettings
    setSettings(newSettings)

    try {
      await saveUserSettings(newSettings)
      persistedSettingsRef.current = newSettings
      return true
    } catch (error) {
      handleSaveFailure(
        error,
        '除外パターンの削除エラー:',
        newSettings,
        rollbackSettings,
      )
      return false
    }
  }

  return {
    addExcludePattern,
    excludePatternInput,
    handleExcludePatternInputChange,
    handleExcludePatternsBlur,
    handleExcludePatternsChange,
    handleSaveSettings,
    isLoading,
    removeExcludePattern,
    setExcludePatternInput,
    setSettings,
    settings,
    updateSetting,
  }
}
