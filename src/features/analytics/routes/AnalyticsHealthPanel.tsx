import { useCallback } from 'react'

import type { SavedTabsInsightRecord } from '@/app/composition/backgroundSavedTabsDataPlaneTypes'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { AnalyticsHealth } from '@/features/analytics/lib/analyticsHealth'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import {
  getAppEntryHref,
  getSavedTabsHrefForMode,
} from '@/features/navigation/lib/pageNavigation'

const PERCENTAGE_MULTIPLIER = 100
const HALF_SHARE = 1 / 2
const percent = (count: number, total: number) =>
  `${Math.round(total === 0 ? 0 : (count / total) * PERCENTAGE_MULTIPLIER)}%`

type ReviewHealth = (records: SavedTabsInsightRecord[], label: string) => void

const ReviewHealthButton = ({
  records,
  label,
  onReview,
}: {
  records: SavedTabsInsightRecord[]
  label: string
  onReview: ReviewHealth
}) => {
  const handleClick = useCallback(() => {
    onReview(records, label)
  }, [records, label, onReview])
  return (
    <Button
      aria-label={label}
      type='button'
      variant='outline'
      size='sm'
      onClick={handleClick}
    >
      {label} ({records.length})
    </Button>
  )
}

export const AnalyticsHealthPanel = ({
  health,
  onReview,
}: {
  health: AnalyticsHealth
  onReview: (records: SavedTabsInsightRecord[], label: string) => void
}) => {
  const { t } = useI18n()
  const largestCategory = health.categories[0]
  const metrics = [
    {
      key: 'uncategorized',
      value: percent(health.uncategorized.length, health.total),
      count: health.uncategorized.length,
    },
    {
      key: 'duplicates',
      value: percent(health.duplicates.length, health.total),
      count: health.duplicates.length,
    },
    {
      key: 'concentration',
      value: percent(health.concentration, 1),
      count: health.categories[0]?.records.length ?? 0,
    },
  ]
  const suggestions = [
    {
      key: 'uncategorized',
      records: health.uncategorized,
      label: t('analytics.health.reviewUncategorized'),
    },
    {
      key: 'duplicates',
      records: health.duplicates,
      label: t('analytics.health.reviewDuplicates'),
    },
    {
      key: 'stale',
      records: health.stale,
      label: t('analytics.health.reviewOld'),
    },
  ]
  return (
    <section aria-label={t('analytics.health.title')}>
      <Card className='mb-4 gap-4 rounded-3xl p-4 shadow-none'>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div>
            <h2 className='text-lg font-semibold'>
              {t('analytics.health.title')}
            </h2>
            <p className='text-sm text-muted-foreground'>
              {t('analytics.health.scope', undefined, {
                count: String(health.total),
              })}
            </p>
          </div>
          <output
            aria-label={t('analytics.health.score')}
            className='text-3xl font-semibold tabular-nums'
          >
            {health.score === null ? '—' : `${health.score} / 100`}
          </output>
        </div>
        {health.total === 0 ? (
          <p>{t('analytics.health.empty')}</p>
        ) : (
          <>
            <dl className='grid gap-3 sm:grid-cols-3'>
              {metrics.map((metric) => (
                <div key={metric.key} className='rounded-2xl bg-muted/50 p-3'>
                  <dt className='text-sm text-muted-foreground'>
                    {t(`analytics.health.${metric.key}`)}
                  </dt>
                  <dd className='text-xl font-semibold tabular-nums'>
                    {metric.value}
                  </dd>
                  <dd className='text-xs text-muted-foreground'>
                    {t('analytics.health.count', undefined, {
                      count: String(metric.count),
                    })}
                  </dd>
                </div>
              ))}
            </dl>
            <div className='flex flex-wrap gap-2'>
              {largestCategory && health.concentration > HALF_SHARE ? (
                <ReviewHealthButton
                  records={largestCategory.records}
                  label={t('analytics.health.reviewLargest', undefined, {
                    mode: t(`analytics.health.mode.${largestCategory.kind}`),
                    name: largestCategory.label,
                  })}
                  onReview={onReview}
                />
              ) : null}
              {suggestions
                .filter((item) => item.records.length > 0)
                .map((item) => (
                  <ReviewHealthButton
                    key={item.key}
                    records={item.records}
                    label={item.label}
                    onReview={onReview}
                  />
                ))}
            </div>
            <ul className='space-y-2 text-sm'>
              {health.uncategorizedDomains.map((item) => (
                <li
                  key={item.label}
                  className='flex flex-wrap items-center justify-between gap-2'
                >
                  <span className='break-all'>
                    {t('analytics.health.domainSuggestion', undefined, {
                      name: item.label,
                      count: String(item.records.length),
                    })}
                  </span>
                  <ReviewHealthButton
                    records={item.records}
                    label={t('analytics.health.reviewDomain', undefined, {
                      name: item.label,
                    })}
                    onReview={onReview}
                  />
                </li>
              ))}
              {health.growingCategories.map((item) => (
                <li
                  key={`${item.kind}:${item.label}`}
                  className='flex flex-wrap items-center justify-between gap-2'
                >
                  <span className='break-all'>
                    {t('analytics.health.growthSuggestion', undefined, {
                      mode: t(`analytics.health.mode.${item.kind}`),
                      name: item.label,
                      count: String(item.records.length),
                    })}
                  </span>
                  <ReviewHealthButton
                    records={item.records}
                    label={t('analytics.health.reviewCategory', undefined, {
                      name: item.label,
                    })}
                    onReview={onReview}
                  />
                </li>
              ))}
            </ul>
            <p className='text-xs text-muted-foreground'>
              {t('analytics.health.oldBasis', undefined, {
                count: String(health.knownLastSaved),
                total: String(health.total),
              })}
            </p>
            <details className='text-sm'>
              <summary className='cursor-pointer'>
                {t('analytics.health.explanation')}
              </summary>
              <p className='mt-2 text-muted-foreground'>
                {t('analytics.health.formula')}
              </p>
              <p className='mt-2 text-muted-foreground'>
                {t('analytics.health.definitions')}
              </p>
            </details>
          </>
        )}
        <p className='text-xs text-muted-foreground'>
          {t('analytics.health.noHistory')}
        </p>
        <a
          className='text-sm text-primary underline underline-offset-4'
          href={getAppEntryHref(getSavedTabsHrefForMode('domain'))}
        >
          {t('analytics.health.organize')}
        </a>
      </Card>
    </section>
  )
}
