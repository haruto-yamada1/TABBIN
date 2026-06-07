import { AlertTriangle } from 'lucide-react'
import { useId } from 'react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { autoDeleteOptions } from '@/constants/autoDeleteOptions'
import { useI18n } from '@/features/i18n/context/I18nProvider'

interface ConfirmationState {
  isVisible: boolean
  message: string
  onConfirm: () => void
}

interface AutoDeleteSettingsCardProps {
  confirmationState: ConfirmationState
  hideConfirmation: () => void
  pendingAutoDeletePeriod: string | null | undefined
  selectedAutoDeletePeriod: string
  onAutoDeletePeriodChange: (value: string) => void
  onPrepareAutoDeletePeriod: () => void
}

export const AutoDeleteSettingsCard = ({
  confirmationState,
  hideConfirmation,
  pendingAutoDeletePeriod,
  selectedAutoDeletePeriod,
  onAutoDeletePeriodChange,
  onPrepareAutoDeletePeriod,
}: AutoDeleteSettingsCardProps) => {
  const { t } = useI18n()
  const dialogTitleId = useId()
  const dialogDescriptionId = useId()

  return (
    <section className='rounded-2xl border border-border bg-card p-6 shadow-sm'>
      <div className='mb-5'>
        <h2 className='text-xl font-semibold'>
          {t('options.autoDelete.title')}
        </h2>
        <p className='mt-2 text-sm leading-6 text-muted-foreground'>
          {t('options.autoDelete.description')}
        </p>
      </div>

      <div className='mt-6 mb-4'>
        <Label
          htmlFor='auto-delete-period'
          className='mb-2 block font-medium text-foreground'
        >
          {t('options.autoDelete.periodLabel')}
        </Label>
        <div className='flex items-center gap-2'>
          <Select
            value={pendingAutoDeletePeriod ?? selectedAutoDeletePeriod}
            onValueChange={onAutoDeletePeriodChange}
          >
            <SelectTrigger
              id='auto-delete-period'
              className='w-full cursor-pointer'
            >
              <SelectValue
                placeholder={t('options.autoDelete.selectPlaceholder')}
              />
            </SelectTrigger>
            <SelectContent
              // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
              onPointerDownOutside={(event) => {
                event.preventDefault()
              }}
              className='p-0'
            >
              <ScrollArea className='h-[120px]'>
                <div className='p-1'>
                  {autoDeleteOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {t(option.labelKey)}
                    </SelectItem>
                  ))}
                </div>
              </ScrollArea>
            </SelectContent>
          </Select>

          <Button
            type='button'
            variant='outline'
            onClick={onPrepareAutoDeletePeriod}
            className='cursor-pointer'
          >
            {t('options.autoDelete.apply')}
          </Button>
        </div>

        {confirmationState.isVisible && (
          <dialog
            aria-describedby={dialogDescriptionId}
            aria-labelledby={dialogTitleId}
            aria-modal='true'
            className='mt-3 rounded-md border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-800 dark:bg-yellow-900/30'
            open
            role='alertdialog'
          >
            <div className='flex flex-col gap-3'>
              <h3 className='sr-only' id={dialogTitleId}>
                {t('options.autoDelete.title')}
              </h3>
              <div className='flex items-start'>
                <div className='shrink-0 text-yellow-500'>
                  <AlertTriangle size={24} />
                </div>
                <p
                  className='ml-3 text-sm whitespace-pre-line text-foreground'
                  id={dialogDescriptionId}
                >
                  {confirmationState.message}
                </p>
              </div>

              <div className='flex justify-end gap-2'>
                <Button
                  autoFocus
                  type='button'
                  variant='ghost'
                  onClick={hideConfirmation}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  type='button'
                  variant='destructive'
                  // eslint-disable-next-line react/jsx-handler-names
                  onClick={confirmationState.onConfirm}
                >
                  {t('common.confirm')}
                </Button>
              </div>
            </div>
          </dialog>
        )}

        <p className='mt-2 text-sm text-muted-foreground'>
          {t('options.autoDelete.periodDescription')}
        </p>
      </div>
    </section>
  )
}
