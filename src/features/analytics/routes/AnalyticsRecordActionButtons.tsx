import { ExternalLink, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import type { AiSavedUrlRecord } from '@/features/ai-chat/types'

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
      <div className='flex items-center justify-end gap-1'>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button asChild size='icon-sm' variant='ghost'>
              <a
                aria-label={t('analytics.openAria', undefined, {
                  title: record.title,
                })}
                href={record.url}
                rel='noreferrer'
                target='_blank'
              >
                <ExternalLink className='size-4' />
              </a>
            </Button>
          </TooltipTrigger>
          <TooltipContent side='top'>{t('analytics.open')}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label={t('savedTabs.url.deleteAria')}
              disabled={isDeleteActionDisabled || deletingUrl === record.url}
              onClick={() => handleDeleteClick(record)}
              size='icon-sm'
              type='button'
              variant='ghost'
            >
              <Trash2 className='size-4' />
            </Button>
          </TooltipTrigger>
          <TooltipContent side='top'>{t('common.delete')}</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  )
}
