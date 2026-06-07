import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
} from 'react'

import { colorOptions } from '@/constants/colorOptions'
import { toFontScaleValue } from '@/constants/fontSize'
import {
  getChromeStorageLocal,
  getChromeStorageOnChanged,
  warnMissingChromeStorage,
} from '@/lib/browser/chrome-storage'
import type { UserSettings } from '@/types/storage'

const isPartialUserSettings = (
  v: unknown,
): v is Partial<UserSettings> =>
  typeof v === 'object' && v !== null

type Theme = 'dark' | 'light' | 'system' | 'user'

const isTheme = (v: unknown): v is Theme =>
  typeof v === 'string' &&
  (v === 'dark' || v === 'light' || v === 'system' || v === 'user')
interface ThemeProviderProps {
  children: React.ReactNode
  defaultTheme?: Theme
  storageKey?: string
}
interface ThemeProviderState {
  theme: Theme
  setTheme: (theme: Theme) => void
}
const initialState: ThemeProviderState = {
  setTheme: () => null,
  theme: 'system',
}
const ThemeProviderContext = createContext<ThemeProviderState>(initialState)

const clearUserThemeColors = (root: HTMLElement) => {
  for (const { key } of colorOptions) {
    root.style.removeProperty(`--${key}`)
  }
}

const applyUserSettingsToRoot = (
  root: HTMLElement,
  userSettings?: Partial<UserSettings>,
  shouldApplyColors = false,
) => {
  root.style.setProperty(
    '--app-font-scale',
    toFontScaleValue(userSettings?.fontSizePercent),
  )

  if (!shouldApplyColors) {
    clearUserThemeColors(root)
    return
  }

  clearUserThemeColors(root)
  const { colors = {} } = userSettings ?? {}
  for (const [key, val] of Object.entries(colors)) {
    root.style.setProperty(`--${key}`, val)
  }
}

export const ThemeProvider = ({
  children,
  defaultTheme = 'system',
  storageKey = 'tab-manager-theme',
  ...props
}: ThemeProviderProps) => {
  const [theme, setThemeState] = useReducer(
    (_state: Theme, nextTheme: Theme) => nextTheme,
    defaultTheme,
  )

  // 初期化時にChrome Storageから設定を読み込む
  useEffect(() => {
    const storageLocal = getChromeStorageLocal()
    if (storageLocal) {
      storageLocal
        .get(storageKey)
        .then((result) => {
          const stored = result[storageKey]
          if (isTheme(stored)) {
            setThemeState(stored)
          }
        })
        .catch(() => {})
    } else {
      warnMissingChromeStorage('テーマ読み込み')
    }

    // ストレージの変更を監視
    const handleStorageChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName === 'local' && changes[storageKey] && isTheme(changes[storageKey].newValue)) {
        setThemeState(changes[storageKey].newValue)
      }
    }
    const storageOnChanged = getChromeStorageOnChanged()
    if (!storageOnChanged) {
      warnMissingChromeStorage('テーマ変更監視')
      return
    }
    storageOnChanged.addListener(handleStorageChange)

    // クリーンアップ関数
    // eslint-disable-next-line typescript/consistent-return
    return () => {
      storageOnChanged.removeListener(handleStorageChange)
    }
  }, [storageKey])
  useEffect(() => {
    const root = window.document.documentElement
    // ライト/ダークのクラス除去
    root.classList.remove('light', 'dark')
    applyUserSettingsToRoot(root)
    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)')
        .matches
        ? 'dark'
        : 'light'
      root.classList.add(systemTheme)
    } else if (theme === 'user') {
      const storageLocal = getChromeStorageLocal()
      if (!storageLocal) {
        warnMissingChromeStorage('ユーザーテーマ適用')
        return
      }
      storageLocal
        .get('userSettings')
        .then((result: { userSettings?: UserSettings }) => {
          applyUserSettingsToRoot(root, result.userSettings, true)
        })
        .catch(() => {})
      return
    } else {
      // Dark または light モードの直接適用
      root.classList.add(theme)
    }

    const storageLocal = getChromeStorageLocal()
    if (!storageLocal) {
      return
    }
    storageLocal
      .get('userSettings')
      .then((result: { userSettings?: UserSettings }) => {
        applyUserSettingsToRoot(root, result.userSettings)
      })
      .catch(() => {})
  }, [theme])

  // ユーザー設定のカラー変更を監視し、即座にCSS変数を更新
  useEffect(() => {
    const listener = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName === 'local' && changes.userSettings) {
        const updated = isPartialUserSettings(changes.userSettings.newValue)
          ? changes.userSettings.newValue
          : undefined
        const root = window.document.documentElement
        applyUserSettingsToRoot(root, updated, theme === 'user')
      }
    }
    const storageOnChanged = getChromeStorageOnChanged()
    if (!storageOnChanged) {
      warnMissingChromeStorage('ユーザーテーマ色監視')
      return
    }
    storageOnChanged.addListener(listener)
    // eslint-disable-next-line typescript/consistent-return
    return () => {
      storageOnChanged.removeListener(listener)
    }
  }, [theme])
  const setTheme = useCallback(
    (nextTheme: Theme) => {
      // Chrome Storageに保存
      const storageLocal = getChromeStorageLocal()
      if (storageLocal) {
        // eslint-disable-next-line typescript/no-floating-promises
        storageLocal.set({
          [storageKey]: nextTheme,
        })
      } else {
        warnMissingChromeStorage('テーマ保存')
      }
      setThemeState(nextTheme)
    },
    [storageKey],
  )
  const value = useMemo(
    () => ({
      setTheme,
      theme,
    }),
    [theme, setTheme],
  )
  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}
/**
 * テーマコンテキストにアクセスするためのカスタムフック
 * @returns テーマ状態と設定関数
 */
export const useTheme = (): ThemeProviderState => {
  const context = use(ThemeProviderContext)
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
