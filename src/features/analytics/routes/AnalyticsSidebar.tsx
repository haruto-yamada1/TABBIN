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
              <Field
                className='gap-1.5'
                data-invalid={viewNameError !== null}
              >
                <FieldLabel
                  className='text-sm'
                  htmlFor='analytics-view-name'
                >
                  {t('analytics.viewName')}
                </FieldLabel>
                <Input
                  aria-label={t('analytics.viewName')}
                  aria-describedby={
                    viewNameError
                      ? 'analytics-view-name-error'
                      : undefined
                  }
                  aria-invalid={viewNameError !== null}
                  className='rounded-xl bg-background'
                  id='analytics-view-name'
                  onChange={(event) => {
                    onViewNameChange(event.target.value)
                  }}
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
              <div className='grid gap-1.5'>
                <Label className='text-sm' htmlFor='analytics-group-by'>
                  {t('analytics.groupByLabel')}
                </Label>
                <Select
                  onValueChange={(value) => {
                    onApplyQuery({
                      ...query,
                      groupBy: parseGroupBy(value),
                    })
                  }}
                  value={query.groupBy}
                >
                  <SelectTrigger
                    aria-label={t('analytics.groupByLabel')}
                    className='rounded-xl bg-background'
                    id='analytics-group-by'
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {analyticsGroupByOptions.map((option) => (
                      <SelectItem
                        key={option.value}
                        value={option.value}
                      >
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className='grid gap-1.5'>
                <Label
                  className='text-sm'
                  htmlFor='analytics-chart-type'
                >
                  {t('analytics.chartTypeLabel')}
                </Label>
                <Select
                  onValueChange={(value) => {
                    onApplyQuery({
                      ...query,
                      chartType: parseChartType(value),
                    })
                  }}
                  value={query.chartType}
                >
                  <SelectTrigger
                    aria-label={t('analytics.chartTypeLabel')}
                    className='rounded-xl bg-background'
                    id='analytics-chart-type'
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {analyticsChartTypeOptions.map((option) => (
                      <SelectItem
                        key={option.value}
                        value={option.value}
                      >
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className='grid gap-1.5'>
                <Label className='text-sm' htmlFor='analytics-limit'>
                  {t('analytics.limitLabel')}
                </Label>
                <Input
                  aria-label={t('analytics.limitLabel')}
                  className='rounded-xl bg-background'
                  id='analytics-limit'
                  min={1}
                  onChange={(event) => {
                    onApplyQuery({
                      ...query,
                      limit: Math.max(
                        1,
                        Number(event.target.value) || 1,
                      ),
                    })
                  }}
                  type='number'
                  value={query.limit}
                />
              </div>
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

          <Card className='rounded-3xl border-border p-5 shadow-none'>
            <CardHeader className='gap-1 p-0'>
              <CardTitle className='text-lg'>
                {t('analytics.savedViewsTitle')}
              </CardTitle>
              <CardDescription>
                {t('analytics.savedViewsDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent className='mt-4 p-0'>
              {savedViews.length === 0 ? (
                <p className='text-sm text-muted-foreground'>
                  {t('analytics.savedViewsEmpty')}
                </p>
              ) : (
                <div className='space-y-2'>
                  {savedViews.map((view) => (
                    <Card
                      className='rounded-2xl border-border p-3 shadow-none'
                      key={view.id}
                    >
                      <div className='flex items-center justify-between gap-2'>
                        <Button
                          className='min-w-0 flex-1 justify-start px-0 text-left hover:bg-transparent'
                          onClick={() => {
                            onApplyQuery(view.query, view.name)
                          }}
                          type='button'
                          variant='ghost'
                        >
                          <span className='truncate text-sm font-medium'>
                            {view.name}
                          </span>
                        </Button>
                        <Button
                          aria-label={t(
                            'analytics.deleteViewAria',
                            undefined,
                            { name: view.name },
                          )}
                          onClick={() =>{   onDeleteView(view.id); }}
                          size='sm'
                          type='button'
                          variant='outline'
                          className='cursor-pointer rounded-lg'
                        >
                          {t('common.delete')}
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </aside>
  )
}
