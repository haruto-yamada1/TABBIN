import { useState } from 'react'
import { toast } from 'sonner'

import { autoDeleteOptions } from '@/constants/autoDeleteOptions'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import type { UserSettings } from '@/types/storage'
import { isPeriodShortening } from '@/utils/isPeriodShortening'

interface ConfirmationState {
  isVisible: boolean
  message: string
  onConfirm: () => void
  pendingAction: string
}

export const useAutoDeletePeriod = (
  settings: UserSettings,
  setSettings: React.Dispatch<React.SetStateAction<UserSettings>>,
) => {
  const { t } = useI18n()
  const [pendingAutoDeletePeriod, setPendingAutoDeletePeriod] = useState<
    string | undefined
  >(undefined)

  const [confirmationState, setConfirmationState] = useState<ConfirmationState>(
    {
      isVisible: false,
      message: '',
      onConfirm: () => {},
      pendingAction: '',
    },
  )

  // 確認表示を隠す
  const hideConfirmation = () => {
    setConfirmationState((prev) => ({
      ...prev,
      isVisible: false,
    }))
  }

  // 確認表示を表示する
  const showConfirmation = (
    message: string,
    onConfirm: () => void,
    pendingAction: string,
  ) => {
    setConfirmationState({
      isVisible: true,
      message,
      onConfirm,
      pendingAction,
    })
  }

  // 自動削除期間選択時の処理
  const handleAutoDeletePeriodChange = (value: string) => {
    console.log(`自動削除期間を選択: ${value}`)
    // 選択した値を一時保存
    setPendingAutoDeletePeriod(value)

    // 確認表示を非表示にする
    hideConfirmation()
  }

  // 自動削除期間を確定して保存する処理の前に確認を表示
  const prepareAutoDeletePeriod = () => {
    console.log('自動削除期間設定ボタンが押されました')

    // 保留中の設定がなければ、現在の設定値を使用
    const periodToApply = pendingAutoDeletePeriod ?? settings.autoDeletePeriod

    if (!periodToApply) {
      return
    }

    // 「自動削除しない」の場合は確認なしで直接適用
    if (periodToApply === 'never') {
      applyAutoDeletePeriod()
      return
    }

    // 選択した期間のラベルを取得
    const selectedOption = autoDeleteOptions.find(
      (opt) => opt.value === periodToApply,
    )
    const periodLabel = selectedOption
      ? t(selectedOption.labelKey)
      : periodToApply

    // 警告メッセージを作成
// eslint-disable-next-line typescript/prefer-nullish-coalescing
    const currentPeriod = settings.autoDeletePeriod || 'never'
    const isShortening = isPeriodShortening(currentPeriod, periodToApply)
    const warningMessage = isShortening
      ? t('options.autoDelete.shorterWarning')
      : t('options.autoDelete.validateWarning')

    // 確認メッセージを表示
    const message = t('options.autoDelete.confirmMessage', undefined, {
      periodLabel,
      warningMessage,
    })

    // 確認を表示
    showConfirmation(message, applyAutoDeletePeriod, periodToApply)
  }

  // 実際の適用処理（確認後に実行）
  const applyAutoDeletePeriod = () => {
    const periodToApply = pendingAutoDeletePeriod ?? settings.autoDeletePeriod

    if (!periodToApply) {
      return
    }

    try {
      console.log(`自動削除期間を設定: ${periodToApply}`)

      const newSettings = {
        ...settings,
        autoDeletePeriod: periodToApply,
      }

      // ストレージに直接保存
      chrome.storage.local.set({ userSettings: newSettings }, () => {
        console.log('設定を保存しました:', newSettings)

        // UI状態を更新
        setSettings(newSettings)

        // トースト通知を表示
        if (periodToApply === 'never') {
          toast.success(t('options.autoDelete.disabled'))
        } else {
          const selectedOption = autoDeleteOptions.find(
            (opt) => opt.value === periodToApply,
          )
          const periodLabel = selectedOption
            ? t(selectedOption.labelKey)
            : periodToApply
          toast.success(
            t('options.autoDelete.enabled', undefined, {
              periodLabel,
            }),
          )
        }

        // バックグラウンドに通知
        const needsTimestampUpdate =
          periodToApply === '30sec' || periodToApply === '1min'
        chrome.runtime.sendMessage(
          {
            action: 'checkExpiredTabs',
            forceReload: true,
            period: periodToApply,
            updateTimestamps: needsTimestampUpdate,
          },
          (response) => {
            console.log('応答:', response)
          },
        )
      })

      // 確認を非表示
      hideConfirmation()

      // 保留中の設定をクリア
      setPendingAutoDeletePeriod(undefined)
    } catch (error) {
      console.error('自動削除期間の保存エラー:', error)
      // エラー時のトースト通知
      toast.error(t('options.autoDelete.saveError'))
    }
  }

  return {
    applyAutoDeletePeriod,
    confirmationState,
    handleAutoDeletePeriodChange,
    hideConfirmation,
    pendingAutoDeletePeriod,
    prepareAutoDeletePeriod,
  }
}
