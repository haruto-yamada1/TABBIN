import { useI18n } from '@/features/i18n/context/I18nProvider'
import { OnboardingGuide } from '@/features/onboarding/OnboardingGuide'

import { ImportExportSettings } from './ImportExportSettings'

export const OptionsIntroduction = () => {
  const { t } = useI18n()
  return (
    <>
      <OnboardingGuide />
      <div className='mb-8 rounded-lg border border-border bg-card p-6 shadow-md'>
        <h2 className='mb-4 text-xl font-semibold text-foreground'>
          {t('options.backupRestore')}
        </h2>
        <ImportExportSettings />
      </div>
    </>
  )
}
