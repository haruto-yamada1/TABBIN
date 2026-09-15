import { ActionConfirmDialog } from './ActionConfirmDialog'

type OpenAllTabsConfirmDialogProps = {
  open: boolean
  title: string
  description: string
  cancelLabel: string
  openLabel: string
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

export const OpenAllTabsConfirmDialog = ({
  openLabel,
  ...props
}: OpenAllTabsConfirmDialogProps) => (
  <ActionConfirmDialog {...props} confirmLabel={openLabel} />
)
