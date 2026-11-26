import { AlertTriangle } from 'lucide-react'
import { useCallback, useEffect, useRef } from 'react'
import type { MouseEvent } from 'react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
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

type ConfirmationState = {
  isVisible: boolean
  message: string
  onConfirm: () => void
}

type AutoDeleteSettingsCardProps = {
  confirmationState: ConfirmationState
  hideConfirmation: () => void
  pendingAutoDeletePeriod: string | null | undefined
  selectedAutoDeletePeriod: string
  onAutoDeletePeriodChange: (value: string) => void
  onPrepareAutoDeletePeriod: () => void
}

const SelectContentArea = ({
  autoDeletePeriod,
  onAutoDeletePeriodChange,
}: {
  autoDeletePeriod: string
  onAutoDeletePeriodChange: (value: string) => void
}) => {
  const { t } = useI18n()
  const handlePointerDownOutside = useCallback((event: Event) => {
    event.preventDefault()
  }, [])

  return (
    <Select value={autoDeletePeriod} onValueChange={onAutoDeletePeriodChange}>
      <SelectTrigger id='auto-delete-period' className='w-full cursor-pointer'>
        <SelectValue placeholder={t('options.autoDelete.selectPlaceholder')} />
      </SelectTrigger>
      <SelectContent
        onPointerDownOutside={handlePointerDownOutside}
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
  )
}

const ConfirmationDialog = ({
  confirmationState,
  hideConfirmation,
}: {
  confirmationState: ConfirmationState
  hideConfirmation: () => void
}) => {
  const { t } = useI18n()
  const handleEscapeKeyDown = useCallback(() => {
    hideConfirmation()
  }, [hideConfirmation])
  const handleConfirm = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
      confirmationState.onConfirm()
    },
    [confirmationState],
  )

  return (
    <AlertDialog open={confirmationState.isVisible}>
      <AlertDialogContent onEscapeKeyDown={handleEscapeKeyDown}>
        <AlertDialogHeader>
          <AlertDialogTitle className='flex items-center gap-2'>
            <span className='shrink-0 text-yellow-500'>
              <AlertTriangle size={24} />
            </span>
            {t('options.autoDelete.title')}
          </AlertDialogTitle>
          <AlertDialogDescription className='whitespace-pre-line'>
            {confirmationState.message}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={hideConfirmation}>
            {t('common.cancel')}
          </AlertDialogCancel>
          <AlertDialogAction variant='destructive' onClick={handleConfirm}>
            {t('common.confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
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
  const applyButtonRef = useRef<HTMLButtonElement>(null)
  const wasConfirmationVisibleRef = useRef(false)

  useEffect(() => {
    if (confirmationState.isVisible) {
      wasConfirmationVisibleRef.current = true
      return
    }
    if (wasConfirmationVisibleRef.current) {
      wasConfirmationVisibleRef.current = false
      applyButtonRef.current?.focus()
    }
  }, [confirmationState.isVisible])

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
          <SelectContentArea
            autoDeletePeriod={
              pendingAutoDeletePeriod ?? selectedAutoDeletePeriod
            }
            onAutoDeletePeriodChange={onAutoDeletePeriodChange}
          />

          <Button
            ref={applyButtonRef}
            type='button'
            variant='outline'
            onClick={onPrepareAutoDeletePeriod}
            className='cursor-pointer'
          >
            {t('options.autoDelete.apply')}
          </Button>
        </div>

        <ConfirmationDialog
          confirmationState={confirmationState}
          hideConfirmation={hideConfirmation}
        />

        <p className='mt-2 text-sm text-muted-foreground'>
          {t('options.autoDelete.periodDescription')}
        </p>
      </div>
    </section>
  )
}
