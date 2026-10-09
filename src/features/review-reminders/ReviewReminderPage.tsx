import { Button } from '@/components/ui/button'
import { useI18n } from '@/features/i18n/context/I18nProvider'

import { ReviewCandidateList } from './ReviewCandidateList'
import { ReviewDeleteDialog } from './ReviewDeleteDialog'
import { useReviewActions } from './useReviewActions'
import { useReviewCandidates } from './useReviewCandidates'

const ReviewActionFeedback = ({
  state,
  disabled,
  onUndo,
}: {
  readonly state: ReturnType<typeof useReviewActions>['state']
  readonly disabled: boolean
  readonly onUndo: () => void
}) => {
  const { t } = useI18n()
  return (
    <>
      {state.error && <p role='alert'>{t(state.error)}</p>}
      {state.notice && (
        <div className='flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3'>
          <output className='text-sm'>
            {t(`reviewReminder.${state.notice}`)}
          </output>
          {state.undoId && (
            <Button
              variant='outline'
              size='sm'
              disabled={disabled}
              onClick={onUndo}
            >
              {t('reviewReminder.undo')}
            </Button>
          )}
        </div>
      )}
      {state.notificationFailed && (
        <p role='alert' className='text-sm'>
          {t('reviewReminder.notificationFailed')}
        </p>
      )}
    </>
  )
}

export const ReviewReminderPage = ({ search }: { readonly search: string }) => {
  return <ReviewReminderWorkspace key={search} search={search} />
}

const ReviewReminderWorkspace = ({ search }: { readonly search: string }) => {
  const { t } = useI18n()
  const { state, refreshing, handleRefresh } = useReviewCandidates(search)
  const actions = useReviewActions(handleRefresh)
  const disabled =
    refreshing || actions.state.busy || actions.state.preview !== null

  return (
    <section
      className='h-full min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6'
      aria-labelledby='review-title'
    >
      <div className='mx-auto max-w-4xl space-y-5'>
        <h1 id='review-title' className='text-2xl font-semibold'>
          {t('reviewReminder.listTitle')}
        </h1>
        <p className='text-sm text-muted-foreground'>
          {t('reviewReminder.description')}
        </p>
        <nav className='flex flex-wrap items-center gap-4'>
          <a href='#/saved-tabs?mode=domain' className='text-primary underline'>
            {t('reviewReminder.backToSavedTabs')}
          </a>
          <a href='#/periodic-execution' className='text-primary underline'>
            {t('reviewReminder.configure')}
          </a>
          <Button variant='outline' onClick={handleRefresh} disabled={disabled}>
            {t('reviewReminder.refresh')}
          </Button>
        </nav>
        {refreshing && <output>{t('reviewReminder.loading')}</output>}
        {(state.status === 'error' ||
          (state.status === 'ready' && state.refreshError)) && (
          <p role='alert'>{t('reviewReminder.listError')}</p>
        )}
        <ReviewActionFeedback
          state={actions.state}
          disabled={disabled}
          onUndo={actions.handleUndo}
        />
        {state.status === 'ready' && (
          <ReviewCandidateList
            candidates={state.candidates}
            disabled={disabled || Boolean(state.refreshError)}
            onDelete={actions.handleRequestDelete}
          />
        )}
      </div>
      <ReviewDeleteDialog
        preview={actions.state.preview}
        busy={actions.state.busy}
        onCancel={actions.handleCancelDelete}
        onConfirm={actions.handleConfirmDelete}
      />
    </section>
  )
}
