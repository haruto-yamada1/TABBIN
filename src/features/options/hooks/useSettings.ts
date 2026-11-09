import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import type { StorageChange } from '@/lib/browser/chrome-storage'
import {
  getChromeStorageOnChanged,
  warnMissingChromeStorage,
} from '@/lib/browser/chrome-storage'
import {
  defaultSettings,
  readUserSettingsStrict,
  resetInvalidUserSettings,
  saveUserSettings,
} from '@/lib/storage/settings'
import { UserSettingsSchema } from '@/lib/storage/zod-storage'
import type { UserSettings } from '@/types/storage'

const normalizeExcludePattern = (pattern: string) => pattern.trim()
const SETTINGS_SAVE_ERROR_MESSAGE = '設定の保存に失敗しました'

export const useSettings = () => {
  // eslint-disable-line eslint/max-lines-per-function
  const [settingsState, setSettingsState] = useState({
    isLoading: true,
    settings: defaultSettings,
  })
  const { isLoading, settings } = settingsState
  const [loadError, setLoadError] = useState<'invalid' | 'unavailable' | null>(
    null,
  )
  const settingsReadyRef = useRef(false)
  const loadErrorRef = useRef<'invalid' | 'unavailable' | null>(null)
  const [excludePatternInput, setExcludePatternInput] = useState('')
  const settingsRef = useRef(settings)
  const persistedSettingsRef = useRef(settings)
  const setSettings = (nextSettings: React.SetStateAction<UserSettings>) => {
    const resolvedSettings =
      typeof nextSettings === 'function'
        ? nextSettings(settingsRef.current)
        : nextSettings
    settingsRef.current = resolvedSettings
    setSettingsState((prev) => ({
      ...prev,
      settings: resolvedSettings,
    }))
  }

  const retrySaveSettings = async (
    failedSettings: UserSettings,
    rollbackSettings: UserSettings,
  ) => {
    if (!settingsReadyRef.current) {
      return
    }
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
        onClick: async () =>
          retrySaveSettings(failedSettings, rollbackSettings),
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

  const retryLoadSettings = useCallback(async () => {
    settingsReadyRef.current = false
    try {
      const result = await readUserSettingsStrict()
      if (!('settings' in result)) {
        loadErrorRef.current = result.status
        setLoadError(result.status)
        setSettingsState((prev) => ({ ...prev, isLoading: false }))
        return
      }
      settingsRef.current = result.settings
      persistedSettingsRef.current = result.settings
      settingsReadyRef.current = true
      loadErrorRef.current = null
      setLoadError(null)
      setSettingsState({ isLoading: false, settings: result.settings })
    } catch {
      console.error('設定の読み込みに失敗しました')
      loadErrorRef.current = 'unavailable'
      setLoadError('unavailable')
      settingsRef.current = defaultSettings
      setSettingsState({ isLoading: false, settings: defaultSettings })
    }
  }, [])

  const resetInvalidSettings = async () => {
    if (loadErrorRef.current !== 'invalid') {
      return
    }
    try {
      await resetInvalidUserSettings()
      await retryLoadSettings()
    } catch {
      loadErrorRef.current = 'unavailable'
      setLoadError('unavailable')
    }
  }

  useEffect(() => {
    void Promise.resolve().then(retryLoadSettings)
  }, [retryLoadSettings])

  useEffect(() => {
    const storageChangeListener = (
      changes: Record<string, StorageChange>,
      areaName: string,
    ) => {
      const settingsChange = changes.userSettings
      if (
        areaName === 'local' &&
        Object.hasOwn(changes, 'userSettings') &&
        settingsChange
      ) {
        if (settingsChange.newValue !== undefined) {
          // NewValue は完全な UserSettings オブジェクトであると期待
          const parsed = UserSettingsSchema.safeParse(settingsChange.newValue)
          if (!parsed.success) {
            void retryLoadSettings()
            return
          }
          settingsReadyRef.current = true
          loadErrorRef.current = null
          setLoadError(null)
          persistedSettingsRef.current = parsed.data
          setSettings(parsed.data)
        } else {
          // UserSettings がストレージから削除された場合 (newValue が undefined)
          // デフォルト設定に戻す
          settingsReadyRef.current = true
          loadErrorRef.current = null
          setLoadError(null)
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
  }, [retryLoadSettings])

  const handleSaveSettings = async () => {
    if (!settingsReadyRef.current) {
      return false
    }
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
    if (!settingsReadyRef.current) {
      return false
    }
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
    void handleSaveSettings()
  }

  const handleExcludePatternInputChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setExcludePatternInput(e.target.value)
  }

  const addExcludePattern = async () => {
    if (!settingsReadyRef.current) {
      return false
    }
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
    if (!settingsReadyRef.current) {
      return false
    }
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
    loadError,
    retryLoadSettings,
    resetInvalidSettings,
    removeExcludePattern,
    setExcludePatternInput,
    setSettings,
    settings,
    updateSetting,
  }
}
