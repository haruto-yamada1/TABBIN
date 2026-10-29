import { useId } from 'react'

import { Button } from '@/components/ui/button'
import { useI18n } from '@/features/i18n/context/I18nProvider'

import { useOnboardingGuide } from './useOnboardingGuide'

const STEPS = ['save', 'organize', 'restore', 'backup'] as const

export const OnboardingGuide = ({
  automatic = false,
}: {
  automatic?: boolean
}) => {
  const { t } = useI18n()
  const id = useId()
  const { state, isSaving, hasSaveError, show, dismiss } =
    useOnboardingGuide(automatic)
  if (automatic && (state === 'hidden' || state === 'loading')) {
    return null
  }
  const expanded = state === 'expanded'
  return (
    <section
      aria-labelledby={`${id}-title`}
      className='mb-4 min-w-0 rounded-lg border border-border bg-card p-4 text-card-foreground'
    >
      <h2 id={`${id}-title`} className='text-lg font-semibold'>
        {t(automatic ? 'onboarding.title' : 'onboarding.optionsTitle')}
      </h2>
      <p className='mt-1 text-sm text-muted-foreground'>
        {t('onboarding.description')}
      </p>
      <div id={`${id}-steps`} hidden={!expanded}>
        {expanded && (
          <ol className='mt-4 grid gap-4 sm:grid-cols-2'>
            {STEPS.map((step, index) => (
              <li key={step} className='min-w-0'>
                <h3 className='font-medium'>
                  <span
                    className='mr-2 text-muted-foreground'
                    aria-hidden='true'
                  >
                    {index + 1}.
                  </span>
                  {t(`onboarding.${step}.title`)}
                </h3>
                <p className='mt-1 text-sm text-muted-foreground'>
                  {t(`onboarding.${step}.body`)}
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>
      {hasSaveError && (
        <p role='alert' className='mt-3 text-sm text-destructive'>
          {t('onboarding.saveError')}
        </p>
      )}
      <div className='mt-3 flex flex-wrap gap-2'>
        <Button
          type='button'
          variant='outline'
          size='sm'
          aria-expanded={expanded}
          aria-controls={`${id}-steps`}
          disabled={isSaving}
          onClick={expanded ? dismiss : show}
        >
          {t(expanded ? 'onboarding.close' : 'onboarding.show')}
        </Button>
        {automatic && !expanded && (
          <Button
            type='button'
            variant='ghost'
            size='sm'
            disabled={isSaving}
            onClick={dismiss}
          >
            {t('onboarding.skip')}
          </Button>
        )}
      </div>
    </section>
  )
}
