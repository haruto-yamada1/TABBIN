import { Trash } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipTrigger } from '@/components/ui/tooltip'
import {
  SavedTabsResponsiveLabel,
  SavedTabsResponsiveTooltipContent,
} from '@/contexts/saved-tabs/presentation/components/shared/SavedTabsResponsive'

interface DeleteEntityConfirmPanelProps {
  description: ReactNode
  cancelLabel: string
  deleteLabel: string
  deleteTooltip: string
  isProcessing: boolean
  onCancel: () => void
  onDelete: () => void
}

export const DeleteEntityConfirmPanel = ({
  description,
  cancelLabel,
  deleteLabel,
  deleteTooltip,
  isProcessing,
  onCancel,
  onDelete,
}: DeleteEntityConfirmPanelProps) => (
  <div className='mt-1 mb-3 rounded border p-3'>
    <p className='mb-2 text-zinc-700 dark:text-zinc-300'>{description}</p>
    <div className='flex justify-end gap-2'>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant='ghost'
            size='sm'
            onClick={onCancel}
            disabled={isProcessing}
          >
            {cancelLabel}
          </Button>
        </TooltipTrigger>
        <SavedTabsResponsiveTooltipContent side='top'>
          {cancelLabel}
        </SavedTabsResponsiveTooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant='destructive'
            size='sm'
            onClick={onDelete}
            disabled={isProcessing}
          >
            <Trash size={14} />
            <SavedTabsResponsiveLabel>{deleteLabel}</SavedTabsResponsiveLabel>
          </Button>
        </TooltipTrigger>
        <SavedTabsResponsiveTooltipContent side='top'>
          {deleteTooltip}
        </SavedTabsResponsiveTooltipContent>
      </Tooltip>
    </div>
  </div>
)
