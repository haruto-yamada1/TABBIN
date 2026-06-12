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

interface OpenAllTabsConfirmDialogProps {
  open: boolean
  title: string
  description: string
  cancelLabel: string
  openLabel: string
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

export const OpenAllTabsConfirmDialog = ({
  open,
  title,
  description,
  cancelLabel,
  openLabel,
  onOpenChange,
  onConfirm,
}: OpenAllTabsConfirmDialogProps) => (
  <AlertDialog open={open} onOpenChange={onOpenChange}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
        <AlertDialogAction onClick={onConfirm}>{openLabel}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
)
