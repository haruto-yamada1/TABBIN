import { toast } from 'sonner'

import { useTheme } from '@/components/theme-provider'
import { colorOptions } from '@/constants/colorOptions'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import { saveUserSettings } from '@/lib/storage/settings'
import type { UserSettings } from '@/types/storage'

export const useColorSettings = (
  settings: UserSettings,
  setSettings: React.Dispatch<React.SetStateAction<UserSettings>>,
) => {
  const { setTheme } = useTheme()
  const { t } = useI18n()
  // カラー設定ハンドラ
  const handleColorChange = async (key: string, value: string) => {
    try {
      const newColors = { ...settings.colors, [key]: value }
      const newSettings = { ...settings, colors: newColors }
      setSettings(newSettings)

      // カラー変更時に自動的にユーザー設定モードに切り替え
      setTheme('user')

      // ライブプレビュー: 即座にCSS変数を更新
      document.documentElement.style.setProperty(`--${key}`, value)
      await saveUserSettings(newSettings)
      return true
    } catch (error) {
      console.error(`カラー ${key} 保存エラー:`, error)
      return false
    }
  }

  // カラー設定をリセットするハンドラ
  const handleResetColors = async () => {
    try {
      // 色設定を削除した新しい設定を作成
      const newSettings = { ...settings, colors: {} }
      setSettings(newSettings)

      // CSS変数をリセット（デフォルトテーマに戻す）
      for (const { key } of colorOptions) {
        document.documentElement.style.removeProperty(`--${key}`)
      }

      // ストレージから色設定を削除
      await saveUserSettings(newSettings)

      // テーマをシステムに戻す
// eslint-disable-next-line typescript/no-floating-promises
      chrome.storage.local.set({ 'tab-manager-theme': 'system' })

      // 成功メッセージを表示
      toast.success(t('options.color.resetSuccess'))
      return true
    } catch (error) {
      console.error('カラーリセットエラー:', error)
      toast.error(t('options.color.resetError'))
      return false
    }
  }

  return {
    handleColorChange,
    handleResetColors,
  }
}
