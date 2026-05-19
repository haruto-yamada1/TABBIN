import { useEffect, useRef, useState } from 'react'

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

export const useSettings = () => {
  const [{ isLoading, settings }, setSettingsState] = useState({
    isLoading: true,
    settings: defaultSettings,
  })
  const [excludePatternInput, setExcludePatternInput] = useState('')
  const settingsRef = useRef(settings)
  const setSettings = (nextSettings: React.SetStateAction<UserSettings>) => {
    setSettingsState((prev) => ({
      ...prev,
      settings:
        typeof nextSettings === 'function'
          ? nextSettings(prev.settings)
          : nextSettings,
    }))
  }

  useEffect(() => {
    settingsRef.current = settings
  }, [settings])

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const userSettings = await getUserSettings()
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
          setSettings(changes.userSettings.newValue as UserSettings)
        } else {
          // UserSettings がストレージから削除された場合 (newValue が undefined)
          // デフォルト設定に戻す
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
    return () => {
      storageOnChanged.removeListener(storageChangeListener)
    }
  }, [])

  const handleSaveSettings = async () => {
    try {
      // 保存する前に空の行を除外
      const cleanSettings = {
        ...settingsRef.current,
        excludePatterns: settingsRef.current.excludePatterns.filter((p) =>
          normalizeExcludePattern(p),
        ),
      }
      settingsRef.current = cleanSettings
      setSettings(cleanSettings)
      await saveUserSettings(cleanSettings)
    } catch (error) {
      console.error('設定の保存エラー:', error)
    }
  }

  const updateSetting = async <K extends keyof UserSettings>(
    key: K,
    value: UserSettings[K],
  ) => {
    try {
      const newSettings = {
        ...settingsRef.current,
        [key]: value,
      }

      settingsRef.current = newSettings
      setSettings(newSettings)
      await saveUserSettings(newSettings)
      return true
    } catch (error) {
      console.error(`設定の保存エラー (${String(key)}):`, error)
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

    const newSettings = {
      ...settingsRef.current,
      excludePatterns: [...settingsRef.current.excludePatterns, trimmedPattern],
    }

    settingsRef.current = newSettings
    setSettings(newSettings)

    try {
      await saveUserSettings(newSettings)
      setExcludePatternInput('')
      return true
    } catch (error) {
      console.error('除外パターンの追加エラー:', error)
      return false
    }
  }

  const removeExcludePattern = async (patternToRemove: string) => {
    const targetPattern = normalizeExcludePattern(patternToRemove)
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
    } catch (error) {
      console.error('除外パターンの削除エラー:', error)
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
