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

type ActionConfirmDialogProps = {
  open: boolean
  title: string
  description: string
  cancelLabel: string
  confirmLabel: string
  variant?: 'default' | 'destructive'
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

export const ActionConfirmDialog = ({
  open,
  title,
  description,
  cancelLabel,
  confirmLabel,
  variant = 'default',
  onOpenChange,
  onConfirm,
}: ActionConfirmDialogProps) => (
  <AlertDialog open={open} onOpenChange={onOpenChange}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
        <AlertDialogAction variant={variant} onClick={onConfirm}>
          {confirmLabel}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
)
