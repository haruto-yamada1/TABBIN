import { useCallback } from 'react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { LoadingState } from '@/components/ui/loading-state'
import { useI18n } from '@/features/i18n/context/I18nProvider'

import { DeletePolicySettings } from './DeletePolicySettings'
import { useSettings } from './hooks/useSettings'
import { KeyboardShortcutsSettings } from './KeyboardShortcutsSettings'
import { LinkCaptureSettings } from './LinkCaptureSettings'
import { SavedTabTitleSettings } from './SavedTabTitleSettings'

export const PageAccessSettings = () => {
  const { isLoading, loadError, retryLoadSettings, settings } = useSettings()
  const { t } = useI18n()

  const handleRetryLoadSettings = useCallback(() => {
    void retryLoadSettings()
  }, [retryLoadSettings])

  // この画面専用の useSettings は読み込み完了まで defaultSettings を返すため、
  // 読み込み中・失敗時は既定値を保存済みの確認条件として見せない
  let deletePolicySection: ReactNode
  if (loadError) {
    deletePolicySection = (
      <div
        role='alert'
        className='mb-8 rounded-lg border border-border bg-card p-6 shadow-md'
      >
        <h2 className='mb-2 text-xl font-semibold text-foreground'>
          {t('options.deletePolicy.title')}
        </h2>
        <p className='text-sm text-muted-foreground'>
          {t(`options.settingsRead.${loadError}`)}
        </p>
        <div className='mt-4'>
          <Button onClick={handleRetryLoadSettings}>
            {t('options.settingsRead.retry')}
          </Button>
        </div>
      </div>
    )
  } else if (isLoading) {
    deletePolicySection = <LoadingState className='mb-8' />
  } else {
    deletePolicySection = (
      <DeletePolicySettings
        confirmDeleteAll={settings.confirmDeleteAll}
        confirmDeleteEach={settings.confirmDeleteEach}
      />
    )
  }

  return (
    <>
      <SavedTabTitleSettings />
      <LinkCaptureSettings />
      <LinkCaptureSettings mode='click' />
      <KeyboardShortcutsSettings />
      {deletePolicySection}
    </>
  )
}
