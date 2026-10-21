import { useCallback } from 'react'
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
import type { SavedTabsOrganizationPreviewDto } from '@/contexts/saved-tabs/public-api'
import { useI18n } from '@/features/i18n/context/I18nProvider'

export const ReviewDeleteDialog = ({
  preview,
  busy,
  onCancel,
  onConfirm,
}: {
  readonly preview: SavedTabsOrganizationPreviewDto | null
  readonly busy: boolean
  readonly onCancel: () => void
  readonly onConfirm: () => void
}) => {
  const { t } = useI18n()
  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        onCancel()
      }
    },
    [onCancel],
  )
  const handleConfirm = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
      onConfirm()
    },
    [onConfirm],
  )
  return (
    <AlertDialog open={preview !== null} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('reviewReminder.deleteTitle')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('reviewReminder.deleteDescription')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ul className='max-h-60 space-y-2 overflow-y-auto text-sm'>
          {preview?.targets.map((target) => (
            <li key={target.id} className='rounded border p-2'>
              <p className='font-medium wrap-anywhere'>
                {target.title || target.url}
              </p>
              <p className='text-xs wrap-anywhere text-muted-foreground'>
                {target.url}
              </p>
            </li>
          ))}
        </ul>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy} onClick={onCancel}>
            {t('reviewReminder.cancel')}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            variant='destructive'
            className='text-white'
            onClick={handleConfirm}
          >
            {t('reviewReminder.confirmDelete', undefined, {
              count: String(preview?.targets.length ?? 0),
            })}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
