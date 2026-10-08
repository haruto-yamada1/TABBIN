import { LoadingState } from '@/components/ui/loading-state'
import { Toaster } from '@/components/ui/sonner'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import { ExtensionPageHeader } from '@/features/navigation/components/ExtensionPageHeader'
import { useAutoDeletePeriod } from '@/features/options/hooks/useAutoDeletePeriod'
import { useSettings } from '@/features/options/hooks/useSettings'
import { AutoDeleteSettingsCard } from '@/features/periodic-execution/components/AutoDeleteSettingsCard'
import { ReviewReminderSettings } from '@/features/periodic-execution/components/ReviewReminderSettings'

export const PeriodicExecutionRoute = () => {
  const { t } = useI18n()
  const { settings, setSettings, isLoading } = useSettings()
  const {
    pendingAutoDeletePeriod,
    confirmationState,
    hideConfirmation,
    handleAutoDeletePeriodChange,
    prepareAutoDeletePeriod,
  } = useAutoDeletePeriod(settings, setSettings)

  if (isLoading) {
    return <LoadingState minHeightClassName='min-h-[300px]' />
  }

  return (
    <>
      <Toaster position='top-right' />
      <div className='h-full min-h-0 overflow-y-auto overscroll-contain px-4 py-8 sm:px-6'>
        <ExtensionPageHeader
          title={t('periodicExecution.title')}
          description={t('periodicExecution.description')}
        />

        <div className='space-y-6'>
          <ReviewReminderSettings />
          <AutoDeleteSettingsCard
            confirmationState={confirmationState}
            hideConfirmation={hideConfirmation}
            pendingAutoDeletePeriod={pendingAutoDeletePeriod}
            selectedAutoDeletePeriod={settings.autoDeletePeriod ?? 'never'}
            onAutoDeletePeriodChange={handleAutoDeletePeriodChange}
            onPrepareAutoDeletePeriod={prepareAutoDeletePeriod}
          />
        </div>
      </div>
    </>
  )
}
