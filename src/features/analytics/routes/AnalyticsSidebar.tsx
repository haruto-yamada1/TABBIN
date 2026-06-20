import { useCallback } from 'react'
import type { ChangeEvent } from 'react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { AnalyticsQuery } from '@/features/analytics/lib/analytics'
import {
  parseChartType,
  parseGroupBy,
} from '@/features/analytics/routes/analyticsRoute.helpers'
import type { ViewNameValidationError } from '@/features/analytics/routes/analyticsRoute.helpers'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import type { SavedAnalyticsView } from '@/lib/storage/analytics'

interface AnalyticsSidebarProps {
  query: AnalyticsQuery
  viewName: string
  viewNameError: ViewNameValidationError | null
  savedViews: SavedAnalyticsView[]
  analyticsGroupByOptions: readonly {
    label: string
    value: AnalyticsQuery['groupBy']
  }[]
  analyticsChartTypeOptions: readonly {
    label: string
    value: AnalyticsQuery['chartType']
  }[]
  onApplyQuery: (query: AnalyticsQuery, viewName?: string) => void
  onViewNameChange: (value: string) => void
  onSaveView: () => void
  onDeleteView: (viewId: string) => void
  onResetQuery: () => void
}

const ViewNameField = ({
  onViewNameChange,
  t,
  viewName,
  viewNameError,
}: {
  onViewNameChange: (value: string) => void
  t: (key: string, fallback?: string, values?: Record<string, string>) => string
  viewName: string
  viewNameError: ViewNameValidationError | null
}) => {
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onViewNameChange(event.target.value)
    },
    [onViewNameChange],
  )

  return (
    <Field className='gap-1.5' data-invalid={viewNameError !== null}>
      <FieldLabel className='text-sm' htmlFor='analytics-view-name'>
        {t('analytics.viewName')}
      </FieldLabel>
      <Input
        aria-label={t('analytics.viewName')}
        aria-describedby={
          viewNameError ? 'analytics-view-name-error' : undefined
        }
        aria-invalid={viewNameError !== null}
        className='rounded-xl bg-background'
        id='analytics-view-name'
        onChange={handleChange}
        value={viewName}
      />
      {viewNameError ? (
        <FieldError id='analytics-view-name-error'>
          {viewNameError === 'required'
            ? t('analytics.viewNameRequired')
            : t('analytics.viewNameDuplicate')}
        </FieldError>
      ) : null}
    </Field>
  )
}

const GroupBySelector = ({
  analyticsGroupByOptions,
  onApplyQuery,
  query,
  t,
}: {
  analyticsGroupByOptions: readonly {
    label: string
    value: AnalyticsQuery['groupBy']
  }[]
  onApplyQuery: (query: AnalyticsQuery, viewName?: string) => void
  query: AnalyticsQuery
  t: (key: string, fallback?: string, values?: Record<string, string>) => string
}) => {
  const handleChange = useCallback(
    (value: string) => {
      onApplyQuery({
        ...query,
        groupBy: parseGroupBy(value),
      })
    },
    [onApplyQuery, query],
  )

  return (
    <div className='grid gap-1.5'>
      <Label className='text-sm' htmlFor='analytics-group-by'>
        {t('analytics.groupByLabel')}
      </Label>
      <Select onValueChange={handleChange} value={query.groupBy}>
        <SelectTrigger
          aria-label={t('analytics.groupByLabel')}
          className='rounded-xl bg-background'
          id='analytics-group-by'
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {analyticsGroupByOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

const ChartTypeSelector = ({
  analyticsChartTypeOptions,
  onApplyQuery,
  query,
  t,
}: {
  analyticsChartTypeOptions: readonly {
    label: string
    value: AnalyticsQuery['chartType']
  }[]
  onApplyQuery: (query: AnalyticsQuery, viewName?: string) => void
  query: AnalyticsQuery
  t: (key: string, fallback?: string, values?: Record<string, string>) => string
}) => {
  const handleChange = useCallback(
    (value: string) => {
      onApplyQuery({
        ...query,
        chartType: parseChartType(value),
      })
    },
    [onApplyQuery, query],
  )

  return (
    <div className='grid gap-1.5'>
      <Label className='text-sm' htmlFor='analytics-chart-type'>
        {t('analytics.chartTypeLabel')}
      </Label>
      <Select onValueChange={handleChange} value={query.chartType}>
        <SelectTrigger
          aria-label={t('analytics.chartTypeLabel')}
          className='rounded-xl bg-background'
          id='analytics-chart-type'
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {analyticsChartTypeOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

const LimitInput = ({
  onApplyQuery,
  query,
  t,
}: {
  onApplyQuery: (query: AnalyticsQuery, viewName?: string) => void
  query: AnalyticsQuery
  t: (key: string, fallback?: string, values?: Record<string, string>) => string
}) => {
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onApplyQuery({
        ...query,
        limit: Math.max(1, Number(event.target.value) || 1),
      })
    },
    [onApplyQuery, query],
  )

  return (
    <div className='grid gap-1.5'>
      <Label className='text-sm' htmlFor='analytics-limit'>
        {t('analytics.limitLabel')}
      </Label>
      <Input
        aria-label={t('analytics.limitLabel')}
        className='rounded-xl bg-background'
        id='analytics-limit'
        min={1}
        onChange={handleChange}
        type='number'
        value={query.limit}
      />
    </div>
  )
}

const SavedViewCard = ({
  onApplyQuery,
  onDeleteView,
  t,
  view,
}: {
  onApplyQuery: (query: AnalyticsQuery, viewName?: string) => void
  onDeleteView: (viewId: string) => void
  t: (key: string, fallback?: string, values?: Record<string, string>) => string
  view: SavedAnalyticsView
}) => {
  const handleApplyView = useCallback(() => {
    onApplyQuery(view.query, view.name)
  }, [onApplyQuery, view])

  const handleDeleteViewAction = useCallback(() => {
    onDeleteView(view.id)
  }, [onDeleteView, view.id])

  return (
    <Card className='rounded-2xl border-border p-3 shadow-none'>
      <div className='flex items-center justify-between gap-2'>
        <Button
          className='min-w-0 flex-1 justify-start px-0 text-left hover:bg-transparent'
          onClick={handleApplyView}
          type='button'
          variant='ghost'
        >
          <span className='truncate text-sm font-medium'>{view.name}</span>
        </Button>
        <Button
          aria-label={t('analytics.deleteViewAria', undefined, {
            name: view.name,
          })}
          onClick={handleDeleteViewAction}
          size='sm'
          type='button'
          variant='outline'
          className='cursor-pointer rounded-lg'
        >
          {t('common.delete')}
        </Button>
      </div>
    </Card>
  )
}

const SavedViewsCard = ({
  onApplyQuery,
  onDeleteView,
  savedViews,
  t,
}: {
  onApplyQuery: (query: AnalyticsQuery, viewName?: string) => void
  onDeleteView: (viewId: string) => void
  savedViews: SavedAnalyticsView[]
  t: (key: string, fallback?: string, values?: Record<string, string>) => string
}) => (
  <Card className='rounded-3xl border-border p-5 shadow-none'>
    <CardHeader className='gap-1 p-0'>
      <CardTitle className='text-lg'>
        {t('analytics.savedViewsTitle')}
      </CardTitle>
      <CardDescription>{t('analytics.savedViewsDescription')}</CardDescription>
    </CardHeader>
    <CardContent className='mt-4 p-0'>
      {savedViews.length === 0 ? (
        <p className='text-sm text-muted-foreground'>
          {t('analytics.savedViewsEmpty')}
        </p>
      ) : (
        <div className='space-y-2'>
          {savedViews.map((view) => (
            <SavedViewCard
              key={view.id}
              onApplyQuery={onApplyQuery}
              onDeleteView={onDeleteView}
              t={t}
              view={view}
            />
          ))}
        </div>
      )}
    </CardContent>
  </Card>
)

export const AnalyticsSidebar = ({
  query,
  viewName,
  viewNameError,
  savedViews,
  analyticsGroupByOptions,
  analyticsChartTypeOptions,
  onApplyQuery,
  onViewNameChange,
  onSaveView,
  onDeleteView,
  onResetQuery,
}: AnalyticsSidebarProps) => {
  const { t } = useI18n()

  return (
    <aside
      className='min-h-0 min-w-0'
      data-testid='analytics-sidebar-pane-container'
    >
      <ScrollArea
        className='h-full overflow-y-auto overscroll-contain'
        data-testid='analytics-sidebar-pane'
      >
        <div className='space-y-4 pr-3'>
          <Card className='rounded-3xl border-border p-5 shadow-none'>
            <CardHeader className='gap-1 p-0'>
              <CardTitle className='text-lg'>
                {t('analytics.conditionsTitle')}
              </CardTitle>
            </CardHeader>
            <CardContent className='mt-4 grid gap-3 p-0'>
              <ViewNameField
                onViewNameChange={onViewNameChange}
                t={t}
                viewName={viewName}
                viewNameError={viewNameError}
              />
              <GroupBySelector
                analyticsGroupByOptions={analyticsGroupByOptions}
                onApplyQuery={onApplyQuery}
                query={query}
                t={t}
              />
              <ChartTypeSelector
                analyticsChartTypeOptions={analyticsChartTypeOptions}
                onApplyQuery={onApplyQuery}
                query={query}
                t={t}
              />
              <LimitInput onApplyQuery={onApplyQuery} query={query} t={t} />
            </CardContent>
            <div className='mt-4 grid grid-cols-2 gap-2'>
              <Button
                className='w-full cursor-pointer rounded-xl'
                // eslint-disable-next-line typescript/no-misused-promises
                onClick={onSaveView}
                type='button'
              >
                {t('analytics.saveView')}
              </Button>
              <Button
                className='w-full cursor-pointer rounded-xl'
                onClick={onResetQuery}
                type='button'
                variant='outline'
              >
                {t('common.reset')}
              </Button>
            </div>
          </Card>

          <SavedViewsCard
            onApplyQuery={onApplyQuery}
            onDeleteView={onDeleteView}
            savedViews={savedViews}
            t={t}
          />
        </div>
      </ScrollArea>
    </aside>
  )
}
