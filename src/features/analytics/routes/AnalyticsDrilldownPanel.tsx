import { ExternalLink, Trash2 } from 'lucide-react'
import type { CSSProperties } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { AiSavedUrlRecord } from '@/features/ai-chat/types'
import { AnalyticsRecordActionButtons } from '@/features/analytics/routes/AnalyticsRecordActionButtons'
import type { AnalyticsDrilldownSelection } from '@/features/analytics/routes/analyticsRoute.helpers'
import { getAnalyticsDateLocale } from '@/features/analytics/routes/analyticsRoute.helpers'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import { formatLocaleDateTime } from '@/utils/localDateTime'

const deferredDrilldownCardStyle: CSSProperties = {
  containIntrinsicSize: '96px',
  contentVisibility: 'auto',
}

const DrilldownToolbar = ({
  isDeleteActionDisabled,
  onDeleteAllClick,
  onOpenAllClick,
  t,
}: {
  isDeleteActionDisabled: boolean
  onDeleteAllClick: () => void
  onOpenAllClick: () => void
  t: (key: string) => string
}) => (
  <TooltipProvider delayDuration={0}>
    <div className='flex shrink-0 items-center gap-1'>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-label={t('analytics.openAllAria')}
            onClick={onOpenAllClick}
            size='icon-sm'
            type='button'
            variant='ghost'
          >
            <ExternalLink className='size-4' />
          </Button>
        </TooltipTrigger>
        <TooltipContent side='top'>{t('savedTabs.openAll')}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-label={t('analytics.deleteAllAria')}
            disabled={isDeleteActionDisabled}
            onClick={onDeleteAllClick}
            size='icon-sm'
            type='button'
            variant='ghost'
          >
            <Trash2 className='size-4' />
          </Button>
        </TooltipTrigger>
        <TooltipContent side='top'>{t('savedTabs.deleteAll')}</TooltipContent>
      </Tooltip>
    </div>
  </TooltipProvider>
)

const DrilldownRecordCard = ({
  deletingUrl,
  isDeleteActionDisabled,
  language,
  onDeleteClick,
  record,
}: {
  deletingUrl: string | null
  isDeleteActionDisabled: boolean
  language: string
  onDeleteClick: (record: AiSavedUrlRecord) => void
  record: AiSavedUrlRecord
}) => {
  return (
    <Card
      className='rounded-2xl border-border bg-card p-3 shadow-none'
      style={deferredDrilldownCardStyle}
    >
      <div
        className='grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start'
        data-testid='analytics-card-layout'
      >
        <div className='min-w-0 flex-1'>
          <p className='truncate text-sm font-medium'>{record.title}</p>
          <div className='mt-2 flex flex-wrap gap-2 text-xs'>
            <Badge className='rounded-full' variant='secondary'>
              {record.domain}
            </Badge>
            {record.parentCategories.map((category) => (
              <Badge
                className='rounded-full'
                key={`${record.id}-${category}`}
                variant='secondary'
              >
                {category}
              </Badge>
            ))}
            {record.savedInProjects.map((project) => (
              <Badge
                className='rounded-full'
                key={`${record.id}-${project}`}
                variant='secondary'
              >
                {project}
              </Badge>
            ))}
          </div>
        </div>
        <div
          className='flex shrink-0 flex-col gap-2 sm:items-end'
          data-testid='analytics-action-column'
        >
          <time className='text-xs text-muted-foreground'>
            {formatLocaleDateTime(
              record.savedAt,
              getAnalyticsDateLocale(language),
            )}
          </time>
          <AnalyticsRecordActionButtons
            deletingUrl={deletingUrl}
            handleDeleteClick={onDeleteClick}
            isDeleteActionDisabled={isDeleteActionDisabled}
            record={record}
          />
        </div>
      </div>
    </Card>
  )
}

interface AnalyticsDrilldownPanelProps {
  drilldownSelection: AnalyticsDrilldownSelection | null
  onOpenAllClick: () => void
  onDeleteAllClick: () => void
  isDeleteActionDisabled: boolean
  deletingUrl: string | null
  onDeleteClick: (record: AiSavedUrlRecord) => void
  language: string
}

export const AnalyticsDrilldownPanel = ({
  drilldownSelection,
  onOpenAllClick,
  onDeleteAllClick,
  isDeleteActionDisabled,
  deletingUrl,
  onDeleteClick,
  language,
}: AnalyticsDrilldownPanelProps) => {
  const { t } = useI18n()

  if (!drilldownSelection) {
    return null
  }

  return (
    <Card className='mt-4 rounded-3xl bg-background p-4 shadow-none'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div>
          <h3 className='text-base font-semibold'>
            {t('analytics.drilldownTitle')}
          </h3>
          <p className='mt-1 text-sm text-muted-foreground'>
            {drilldownSelection.specTitle} / {drilldownSelection.label} /{' '}
            {t('analytics.drilldownCount', undefined, {
              count: String(drilldownSelection.matchingRecords.length),
            })}
          </p>
        </div>
        {drilldownSelection.matchingRecords.length > 0 ? (
          <DrilldownToolbar
            isDeleteActionDisabled={isDeleteActionDisabled}
            onDeleteAllClick={onDeleteAllClick}
            onOpenAllClick={onOpenAllClick}
            t={t}
          />
        ) : null}
      </div>
      <div className='mt-4 space-y-3'>
        {drilldownSelection.matchingRecords.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            {t('analytics.drilldownEmpty')}
          </p>
        ) : (
          drilldownSelection.matchingRecords.map((record) => (
            <DrilldownRecordCard
              deletingUrl={deletingUrl}
              isDeleteActionDisabled={isDeleteActionDisabled}
              key={record.id}
              language={language}
              onDeleteClick={onDeleteClick}
              record={record}
            />
          ))
        )}
      </div>
    </Card>
  )
}
