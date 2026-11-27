import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { AiChartRenderer } from '@/features/ai-chat/components/AiChartRenderer'
import type { AiChartSpec } from '@/features/ai-chat/types'
import type { AnalyticsHealth } from '@/features/analytics/lib/analyticsHealth'
import { AnalyticsHealthPanel } from '@/features/analytics/routes/AnalyticsHealthPanel'
import { noop } from '@/features/analytics/routes/analyticsRoute.helpers'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import {
  getAppEntryHref,
  getSavedTabsHrefForMode,
} from '@/features/navigation/lib/pageNavigation'

const AnalyticsGhostPreview = ({
  chartSpecs,
  health,
}: {
  chartSpecs: AiChartSpec[]
  health: AnalyticsHealth
}) => {
  const { t } = useI18n()
  return (
    <section
      aria-label={t('analytics.ghost.title')}
      data-testid='analytics-ghost-preview'
    >
      <Card className='mb-4 gap-3 rounded-3xl border-dashed p-4 shadow-none'>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <h2 className='text-lg font-semibold'>
            {t('analytics.ghost.title')}
          </h2>
          <Badge variant='secondary'>{t('analytics.ghost.badge')}</Badge>
        </div>
        <p className='text-sm text-muted-foreground'>
          {t('analytics.ghost.description')}
        </p>
        <a
          className='text-sm text-primary underline underline-offset-4'
          href={getAppEntryHref(getSavedTabsHrefForMode('domain'))}
        >
          {t('analytics.ghost.openSavedTabs')}
        </a>
      </Card>
      <div
        aria-hidden='true'
        className='pointer-events-none opacity-40 saturate-0 select-none'
        data-testid='analytics-ghost-sample'
        inert
      >
        <AnalyticsHealthPanel health={health} onReview={noop} />
        <Card className='min-w-0 rounded-3xl border-dashed bg-background/70 p-4 shadow-none'>
          <AiChartRenderer charts={chartSpecs} />
        </Card>
      </div>
    </section>
  )
}

export { AnalyticsGhostPreview }
