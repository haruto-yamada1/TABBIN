import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useI18n } from '@/features/i18n/context/I18nProvider'

export const DeleteConversationDialog = ({
  open,
  onOpenChange,
  onCancel,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCancel: () => void
  onConfirm: () => void
}) => {
  const { t } = useI18n()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('aiChat.deleteTitle')}</DialogTitle>
          <DialogDescription>{t('aiChat.deleteDescription')}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type='button' variant='outline' onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button type='button' variant='destructive' onClick={onConfirm}>
            {t('common.delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
