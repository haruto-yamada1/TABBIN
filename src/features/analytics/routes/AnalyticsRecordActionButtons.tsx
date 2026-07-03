import { ExternalLink, Trash2 } from 'lucide-react'
import { useCallback } from 'react'

import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { AiSavedUrlRecord } from '@/features/ai-chat/types'
import { useI18n } from '@/features/i18n/context/I18nProvider'

const OpenLinkButton = ({
  ariaLabel,
  href,
}: {
  ariaLabel: string
  href: string
}) => {
  const { t } = useI18n()
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button asChild size='icon-sm' variant='ghost'>
          <a
            aria-label={ariaLabel}
            href={href}
            rel='noreferrer'
            target='_blank'
          >
            <ExternalLink className='size-4' />
          </a>
        </Button>
      </TooltipTrigger>
      <TooltipContent side='top'>{t('analytics.open')}</TooltipContent>
    </Tooltip>
  )
}

const DeleteRecordButton = ({
  deletingUrl,
  handleDeleteClick,
  isDeleteActionDisabled,
  record,
}: {
  deletingUrl: string | null
  handleDeleteClick: (record: AiSavedUrlRecord) => void
  isDeleteActionDisabled: boolean
  record: AiSavedUrlRecord
}) => {
  const { t } = useI18n()
  const handleDeleteRecord = useCallback(() => {
    handleDeleteClick(record)
  }, [handleDeleteClick, record])

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={t('savedTabs.url.deleteAria')}
          disabled={isDeleteActionDisabled || deletingUrl === record.url}
          onClick={handleDeleteRecord}
          size='icon-sm'
          type='button'
          variant='ghost'
        >
          <Trash2 className='size-4' />
        </Button>
      </TooltipTrigger>
      <TooltipContent side='top'>{t('common.delete')}</TooltipContent>
    </Tooltip>
  )
}

interface AnalyticsRecordActionButtonsProps {
  deletingUrl: string | null
  handleDeleteClick: (record: AiSavedUrlRecord) => void
  isDeleteActionDisabled: boolean
  record: AiSavedUrlRecord
}

export const AnalyticsRecordActionButtons = ({
  deletingUrl,
  handleDeleteClick,
  isDeleteActionDisabled,
  record,
}: AnalyticsRecordActionButtonsProps) => {
  const { t } = useI18n()

  return (
    <TooltipProvider delayDuration={0}>
      <div
        className='flex items-center justify-end gap-1'
        data-testid={`analytics-action-row-${record.id}`}
      >
        <OpenLinkButton
          ariaLabel={t('analytics.openAria', undefined, {
            title: record.title,
          })}
          href={record.url}
        />
        <DeleteRecordButton
          deletingUrl={deletingUrl}
          handleDeleteClick={handleDeleteClick}
          isDeleteActionDisabled={isDeleteActionDisabled}
          record={record}
        />
      </div>
    </TooltipProvider>
  )
}
