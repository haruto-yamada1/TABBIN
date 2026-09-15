import { useI18n } from '@/features/i18n/context/I18nProvider'

import { ActionConfirmDialog } from './ActionConfirmDialog'

type DeleteUrlConfirmDialogProps = {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

export const DeleteUrlConfirmDialog = ({
  isOpen,
  onOpenChange,
  onConfirm,
}: DeleteUrlConfirmDialogProps) => {
  const { t } = useI18n()

  return (
    <ActionConfirmDialog
      open={isOpen}
      onOpenChange={onOpenChange}
      onConfirm={onConfirm}
      title={t('savedTabs.url.deleteConfirmTitle')}
      description={t('savedTabs.url.deleteConfirmDescription')}
      cancelLabel={t('common.cancel')}
      confirmLabel={t('common.delete')}
      variant='destructive'
    />
  )
}
