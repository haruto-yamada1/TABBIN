import { ExternalLink, Settings, Trash } from 'lucide-react'
import { useCallback, useState } from 'react'

import { useI18n } from '@/features/i18n/context/I18nProvider'

import { ActionConfirmDialog } from './ActionConfirmDialog'
import { CardActionButton } from './CardActionButton'

type CardGroupActionsProps = {
  onOpenAll?: () => void
  onDeleteAll?: () => void
  onManage?: () => void
  onConfirmOpenAll?: boolean
  onConfirmDeleteAll?: boolean
  openAllThreshold?: number
  openAllCount?: number
  itemName?: string
  warningMessage?: string
  manageLabel?: string
  manageAriaLabel?: string
  manageTooltip?: string
  openAllAriaLabel?: string
  openAllTooltip?: string
  openAllConfirmDescription?: string
  deleteAllAriaLabel?: string
  deleteAllTooltip?: string
  deleteAllConfirmDescription?: string
}

const ManageAction = ({
  onManage,
  manageLabel,
  manageAriaLabel,
  manageTooltip,
}: CardGroupActionsProps & { onManage: () => void }) => {
  const { t } = useI18n()
  const label = manageLabel ?? t('common.manage')

  return (
    <CardActionButton
      icon={Settings}
      label={label}
      accessibleLabel={manageAriaLabel ?? label}
      tooltip={manageTooltip ?? label}
      onClick={onManage}
    />
  )
}

const OpenAllAction = ({
  onOpenAll,
  onConfirmOpenAll = false,
  openAllThreshold = 10,
  openAllCount,
  openAllAriaLabel,
  openAllTooltip,
  openAllConfirmDescription,
}: CardGroupActionsProps & { onOpenAll: () => void }) => {
  const { t } = useI18n()
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const handleClick = useCallback(() => {
    if (onConfirmOpenAll) {
      setIsConfirmOpen(true)
    } else {
      onOpenAll()
    }
  }, [onConfirmOpenAll, onOpenAll])

  return (
    <>
      <CardActionButton
        icon={ExternalLink}
        label={t('savedTabs.openAll')}
        accessibleLabel={openAllAriaLabel ?? t('savedTabs.openAllTabs')}
        tooltip={openAllTooltip ?? t('savedTabs.openAllTabs')}
        onClick={handleClick}
      />
      <ActionConfirmDialog
        open={isConfirmOpen}
        onOpenChange={setIsConfirmOpen}
        title={t('savedTabs.openAllConfirmTitle')}
        description={
          openAllConfirmDescription ??
          t('savedTabs.openAllConfirmDescription', undefined, {
            count: String(openAllCount ?? openAllThreshold),
          })
        }
        cancelLabel={t('common.cancel')}
        confirmLabel={t('common.open')}
        onConfirm={onOpenAll}
      />
    </>
  )
}

const DeleteAllAction = ({
  onDeleteAll,
  onConfirmDeleteAll = false,
  itemName,
  warningMessage,
  deleteAllAriaLabel,
  deleteAllTooltip,
  deleteAllConfirmDescription,
}: CardGroupActionsProps & { onDeleteAll: () => void }) => {
  const { t } = useI18n()
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const handleClick = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation()
      event.preventDefault()
      if (onConfirmDeleteAll) {
        setIsConfirmOpen(true)
      } else {
        onDeleteAll()
      }
    },
    [onConfirmDeleteAll, onDeleteAll],
  )

  return (
    <>
      <CardActionButton
        icon={Trash}
        label={t('savedTabs.deleteAll')}
        accessibleLabel={deleteAllAriaLabel ?? t('savedTabs.deleteAll')}
        tooltip={deleteAllTooltip ?? t('savedTabs.deleteAll')}
        onClick={handleClick}
      />
      <ActionConfirmDialog
        open={isConfirmOpen}
        onOpenChange={setIsConfirmOpen}
        title={t('savedTabs.deleteAllTitle', undefined, {
          itemName: itemName ?? t('savedTabs.openAllTabs'),
        })}
        description={
          deleteAllConfirmDescription ??
          warningMessage ??
          t('savedTabs.deleteAllDefaultWarning')
        }
        cancelLabel={t('common.cancel')}
        confirmLabel={t('common.delete')}
        variant='destructive'
        onConfirm={onDeleteAll}
      />
    </>
  )
}

/** カード操作ごとに表示と確認状態を管理する。 */
export const CardGroupActions = (props: CardGroupActionsProps) => (
  <div className='pointer-events-auto ml-2 flex shrink-0 gap-2'>
    {props.onManage && <ManageAction {...props} onManage={props.onManage} />}
    {props.onOpenAll && (
      <OpenAllAction {...props} onOpenAll={props.onOpenAll} />
    )}
    {props.onDeleteAll && (
      <DeleteAllAction {...props} onDeleteAll={props.onDeleteAll} />
    )}
  </div>
)
