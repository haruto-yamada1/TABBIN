import {
  ArrowRight,
  Bell,
  CalendarClock,
  Moon,
  SlidersHorizontal,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, SubmitEvent } from 'react'

import { getReviewCategories } from '@/app/composition/reviewReminders'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import type { TranslateFn } from '@/features/i18n/context/I18nProvider'
import type { ReviewReminderSettings as ReminderSettings } from '@/features/review-reminders/lib/reviewReminderSettings'
import {
  defaultReviewReminderSettings,
  ReviewReminderSettingsSchema,
} from '@/features/review-reminders/lib/reviewReminderSettings'
import { getExtensionUrl } from '@/lib/browser/runtime'
import {
  readReviewReminderSettings,
  saveReviewReminderSettings,
} from '@/lib/storage/review-reminders'

type Draft = {
  enabled: boolean
  target: string
  categoryId: string
  olderThanDays: string
  frequency: string
  hour: string
  weekday: string
  quietHoursEnabled: boolean
  quietStartHour: string
  quietEndHour: string
}
type Category = { id: string; name: string }
type SettingsState = {
  draft: Draft | null
  persistedOlderThanDays: number
  categories: Category[]
  categoriesError: boolean
  status: 'loading' | 'ready' | 'dirty' | 'saving' | 'saved' | 'error'
  errorKey: string | null
}
type FieldChange = (
  event: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
) => void
type FieldsProps = { draft: Draft; onChange: FieldChange; t: TranslateFn }
type SelectOption = { value: string; label: string }

const HOURS_PER_DAY = 24
const DAYS_PER_WEEK = 7
const hourOptions = Array.from({ length: HOURS_PER_DAY }, (_, hour) => ({
  value: String(hour),
  label: `${String(hour).padStart(2, '0')}:00`,
}))
const fieldClassName =
  'h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50'

const createDraft = (settings: ReminderSettings): Draft => ({
  ...settings,
  olderThanDays: String(settings.olderThanDays),
  hour: String(settings.hour),
  weekday: String(settings.weekday),
  quietStartHour: String(settings.quietStartHour),
  quietEndHour: String(settings.quietEndHour),
})
const parseNumber = (value: string) =>
  value.trim() ? Number(value) : Number.NaN
const parseDraft = (draft: Draft, persistedOlderThanDays: number) => {
  const days = parseNumber(draft.olderThanDays)
  const validAge =
    ReviewReminderSettingsSchema.shape.olderThanDays.safeParse(days)
  const ageIsActive = draft.enabled && draft.target === 'older'
  return ReviewReminderSettingsSchema.safeParse({
    ...draft,
    olderThanDays:
      !validAge.success && !ageIsActive ? persistedOlderThanDays : days,
    hour: parseNumber(draft.hour),
    weekday: parseNumber(draft.weekday),
    quietStartHour: parseNumber(draft.quietStartHour),
    quietEndHour: parseNumber(draft.quietEndHour),
  })
}

const ReviewSelect = ({
  name,
  label,
  value,
  options,
  onChange,
}: {
  name: string
  label: string
  value: string
  options: SelectOption[]
  onChange: FieldChange
}) => (
  <div>
    <Label htmlFor={`review-${name}`} className='mb-2 block'>
      {label}
    </Label>
    <select
      id={`review-${name}`}
      name={name}
      value={value}
      onChange={onChange}
      className={fieldClassName}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  </div>
)

const TargetFields = ({
  draft,
  categories,
  onChange,
  t,
}: FieldsProps & { categories: Category[] }) => {
  const targetOptions = useMemo(
    () =>
      ['all', 'uncategorized', 'older', 'category'].map((target) => ({
        value: target,
        label: t(`options.review.target.${target}`),
      })),
    [t],
  )
  const categoryOptions = useMemo(() => {
    const options = [
      { value: '', label: t('options.review.chooseCategory') },
      ...categories.map((category) => ({
        value: category.id,
        label: category.name,
      })),
    ]
    if (
      draft.categoryId &&
      !categories.some(({ id }) => id === draft.categoryId)
    ) {
      options.push({
        value: draft.categoryId,
        label: t('options.review.missingCategory'),
      })
    }
    return options
  }, [categories, draft.categoryId, t])
  return (
    <div className='space-y-4'>
      <ReviewSelect
        name='target'
        label={t('options.review.target')}
        value={draft.target}
        options={targetOptions}
        onChange={onChange}
      />
      {draft.target === 'category' ? (
        <ReviewSelect
          name='categoryId'
          label={t('options.review.category')}
          value={draft.categoryId}
          options={categoryOptions}
          onChange={onChange}
        />
      ) : null}
      {draft.target === 'older' ? (
        <div>
          <Label htmlFor='review-olderThanDays' className='mb-2 block'>
            {t('options.review.olderThanDays')}
          </Label>
          <input
            id='review-olderThanDays'
            name='olderThanDays'
            type='number'
            min='1'
            step='1'
            value={draft.olderThanDays}
            aria-describedby='review-older-help'
            onChange={onChange}
            className={fieldClassName}
          />
          <p
            id='review-older-help'
            className='mt-2 text-sm text-muted-foreground'
          >
            {t('options.review.olderHelp')}
          </p>
        </div>
      ) : null}
    </div>
  )
}

const ScheduleFields = ({ draft, onChange, t }: FieldsProps) => {
  const frequencies = useMemo(
    () =>
      ['daily', 'weekly'].map((frequency) => ({
        value: frequency,
        label: t(`options.review.frequency.${frequency}`),
      })),
    [t],
  )
  const weekdays = useMemo(
    () =>
      Array.from({ length: DAYS_PER_WEEK }, (_, weekday) => ({
        value: String(weekday),
        label: t(`options.review.weekday.${weekday}`),
      })),
    [t],
  )
  return (
    <div className='grid gap-4 sm:grid-cols-2'>
      <ReviewSelect
        name='frequency'
        label={t('options.review.frequency')}
        value={draft.frequency}
        options={frequencies}
        onChange={onChange}
      />
      <ReviewSelect
        name='hour'
        label={t('options.review.hour')}
        value={draft.hour}
        options={hourOptions}
        onChange={onChange}
      />
      {draft.frequency === 'weekly' ? (
        <ReviewSelect
          name='weekday'
          label={t('options.review.weekday')}
          value={draft.weekday}
          options={weekdays}
          onChange={onChange}
        />
      ) : null}
    </div>
  )
}

const QuietHoursFields = ({ draft, onChange, t }: FieldsProps) => (
  <div className='space-y-4'>
    <label className='flex cursor-pointer items-start gap-3 text-sm font-medium'>
      <input
        name='quietHoursEnabled'
        type='checkbox'
        checked={draft.quietHoursEnabled}
        onChange={onChange}
        className='mt-0.5 size-4 shrink-0 accent-primary'
      />
      {t('options.review.quietEnabled')}
    </label>
    {draft.quietHoursEnabled ? (
      <div className='grid gap-4 sm:grid-cols-2'>
        <ReviewSelect
          name='quietStartHour'
          label={t('options.review.quietStart')}
          value={draft.quietStartHour}
          options={hourOptions}
          onChange={onChange}
        />
        <ReviewSelect
          name='quietEndHour'
          label={t('options.review.quietEnd')}
          value={draft.quietEndHour}
          options={hourOptions}
          onChange={onChange}
        />
      </div>
    ) : null}
    <p className='text-sm leading-6 text-muted-foreground'>
      {t('options.review.quietHelp')}
    </p>
  </div>
)

const ReminderEnabledToggle = ({ draft, onChange, t }: FieldsProps) => (
  <label className='flex cursor-pointer items-center justify-between gap-4 rounded-xl bg-muted/50 px-4 py-4'>
    <span className='text-sm font-medium'>{t('options.review.enabled')}</span>
    <span className='relative flex shrink-0 items-center'>
      <input
        name='enabled'
        type='checkbox'
        checked={draft.enabled}
        onChange={onChange}
        className='peer absolute inset-0 z-10 size-full cursor-pointer opacity-0 disabled:cursor-default'
      />
      <span
        aria-hidden='true'
        className='h-6 w-11 rounded-full bg-input peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-disabled:opacity-50'
      />
      <span
        aria-hidden='true'
        className='pointer-events-none absolute left-0.5 size-5 rounded-full bg-background shadow-sm peer-checked:translate-x-5'
      />
    </span>
  </label>
)

const ReminderDetailsFields = ({
  draft,
  categories,
  onChange,
  t,
}: FieldsProps & { categories: Category[] }) => (
  <div className='grid gap-6 lg:grid-cols-2'>
    <div className='min-w-0 space-y-4'>
      <h3 className='flex items-center gap-2 text-sm font-semibold'>
        <SlidersHorizontal
          aria-hidden='true'
          className='size-4 text-muted-foreground'
        />
        {t('periodicExecution.review.targetTitle')}
      </h3>
      <TargetFields
        draft={draft}
        categories={categories}
        onChange={onChange}
        t={t}
      />
      <p className='text-sm leading-6 text-muted-foreground'>
        {t('options.review.noHistory')}
      </p>
    </div>
    <div className='min-w-0 space-y-4'>
      <h3 className='flex items-center gap-2 text-sm font-semibold'>
        <CalendarClock
          aria-hidden='true'
          className='size-4 text-muted-foreground'
        />
        {t('periodicExecution.review.scheduleTitle')}
      </h3>
      <ScheduleFields draft={draft} onChange={onChange} t={t} />
      <p className='text-sm leading-6 text-muted-foreground'>
        {t('options.review.localTime')}
      </p>
    </div>
  </div>
)

const ReminderForm = ({
  draft,
  categories,
  isSaving,
  onChange,
  onSubmit,
  t,
  reviewUrl,
}: FieldsProps & {
  categories: Category[]
  isSaving: boolean
  onSubmit: (event: SubmitEvent<HTMLFormElement>) => void
  reviewUrl: string
}) => (
  <form aria-label={t('options.review.title')} onSubmit={onSubmit} noValidate>
    <fieldset disabled={isSaving} className='space-y-6'>
      <ReminderEnabledToggle draft={draft} onChange={onChange} t={t} />
      <ReminderDetailsFields
        draft={draft}
        categories={categories}
        onChange={onChange}
        t={t}
      />
      <div className='space-y-4 rounded-xl border border-border bg-muted/20 p-4 sm:p-5'>
        <h3 className='flex items-center gap-2 text-sm font-semibold'>
          <Moon aria-hidden='true' className='size-4 text-muted-foreground' />
          {t('periodicExecution.review.quietTitle')}
        </h3>
        <QuietHoursFields draft={draft} onChange={onChange} t={t} />
      </div>
      <div className='flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5'>
        <Button
          type='submit'
          disabled={isSaving}
          className='w-full cursor-pointer sm:w-auto'
        >
          {t(isSaving ? 'options.review.saving' : 'options.review.save')}
        </Button>
        <ReviewNowLink
          reviewUrl={reviewUrl}
          label={t('options.review.reviewNow')}
        />
      </div>
    </fieldset>
  </form>
)

const useReviewReminderSettings = () => {
  const [state, setState] = useState<SettingsState>({
    draft: null,
    persistedOlderThanDays: defaultReviewReminderSettings.olderThanDays,
    categories: [],
    categoriesError: false,
    status: 'loading',
    errorKey: null,
  })
  const savePending = useRef(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const [settings, categories] = await Promise.allSettled([
        readReviewReminderSettings(),
        getReviewCategories(),
      ])
      if (cancelled) {
        return
      }
      setState({
        draft:
          settings.status === 'fulfilled' ? createDraft(settings.value) : null,
        persistedOlderThanDays:
          settings.status === 'fulfilled'
            ? settings.value.olderThanDays
            : defaultReviewReminderSettings.olderThanDays,
        categories: categories.status === 'fulfilled' ? categories.value : [],
        categoriesError: categories.status === 'rejected',
        status: settings.status === 'fulfilled' ? 'ready' : 'error',
        errorKey:
          settings.status === 'fulfilled' ? null : 'options.review.loadError',
      })
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const handleChange: FieldChange = (event) => {
    const { name, value } = event.currentTarget
    const nextValue =
      event.currentTarget instanceof HTMLInputElement &&
      event.currentTarget.type === 'checkbox'
        ? event.currentTarget.checked
        : value
    setState((previous) => ({
      ...previous,
      draft: previous.draft ? { ...previous.draft, [name]: nextValue } : null,
      status: 'dirty',
      errorKey: null,
    }))
  }

  const save = async () => {
    if (savePending.current || !state.draft) {
      return
    }
    const parsed = parseDraft(state.draft, state.persistedOlderThanDays)
    if (
      !parsed.success ||
      (parsed.data.enabled &&
        parsed.data.target === 'category' &&
        !state.categories.some(({ id }) => id === parsed.data.categoryId))
    ) {
      setState((previous) => ({
        ...previous,
        errorKey: 'options.review.invalid',
      }))
      return
    }
    savePending.current = true
    setState((previous) => ({ ...previous, status: 'saving', errorKey: null }))
    try {
      await saveReviewReminderSettings(parsed.data)
      setState((previous) => ({
        ...previous,
        draft: createDraft(parsed.data),
        persistedOlderThanDays: parsed.data.olderThanDays,
        status: 'saved',
      }))
    } catch {
      setState((previous) => ({
        ...previous,
        status: 'dirty',
        errorKey: 'options.review.saveError',
      }))
    } finally {
      savePending.current = false
    }
  }
  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    void save()
  }
  return { state, handleChange, handleSubmit }
}

export const ReviewReminderSettings = () => {
  const { t } = useI18n()
  const { state, handleChange, handleSubmit } = useReviewReminderSettings()
  const reviewUrl = `${getExtensionUrl('app.html') ?? 'app.html'}#/saved-tabs?review=1`
  return (
    <section
      aria-labelledby='review-settings-title'
      className='overflow-hidden rounded-2xl border border-border bg-card shadow-sm'
    >
      <div className='flex items-start gap-4 border-b border-border p-5 sm:p-6'>
        <div className='flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary'>
          <Bell aria-hidden='true' className='size-5' />
        </div>
        <div className='min-w-0'>
          <h2 id='review-settings-title' className='text-xl font-semibold'>
            {t('options.review.title')}
          </h2>
          <p className='mt-2 text-sm leading-6 text-muted-foreground'>
            {t('options.review.description')}
          </p>
        </div>
      </div>
      <div className='p-5 sm:p-6'>
        {state.draft ? (
          <ReminderForm
            draft={state.draft}
            categories={state.categories}
            isSaving={state.status === 'saving'}
            onChange={handleChange}
            onSubmit={handleSubmit}
            t={t}
            reviewUrl={reviewUrl}
          />
        ) : null}
        {state.categoriesError ? (
          <p className='mt-3 text-sm text-destructive'>
            {t('options.review.categoriesError')}
          </p>
        ) : null}
        {state.errorKey ? (
          <p role='alert' className='mt-3 text-sm text-destructive'>
            {t(state.errorKey)}
          </p>
        ) : null}
        {state.status === 'loading' ||
        state.status === 'dirty' ||
        state.status === 'saved' ? (
          <output className='mt-3 block text-sm text-muted-foreground'>
            {t(
              `options.review.${state.status === 'dirty' ? 'unsaved' : state.status}`,
            )}
          </output>
        ) : null}
        {!state.draft ? (
          <div className='mt-4'>
            <ReviewNowLink
              reviewUrl={reviewUrl}
              label={t('options.review.reviewNow')}
            />
          </div>
        ) : null}
      </div>
    </section>
  )
}

const ReviewNowLink = ({
  reviewUrl,
  label,
}: {
  reviewUrl: string
  label: string
}) => (
  <a
    href={reviewUrl}
    className='inline-flex items-center gap-2 rounded-md px-1 py-2 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'
  >
    {label}
    <ArrowRight aria-hidden='true' className='size-4' />
  </a>
)
