import { useCallback, useRef, useState } from 'react'

import { getSavedTabsOrganizationService } from '@/app/composition/savedTabsOrganization'
import { Button } from '@/components/ui/button'
import { savedTabsOrganizationProposalSchema } from '@/contexts/saved-tabs/public-api'
import type {
  SavedTabsOrganizationPreviewDto,
  SavedTabsOrganizationProposal,
} from '@/contexts/saved-tabs/public-api'
import { AiChartRenderer } from '@/features/ai-chat/components/AiChartRenderer'
import {
  readOrganizationActionOutcome,
  rememberOrganizationActionOutcome,
} from '@/features/ai-chat/lib/organizationActionSession'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import type { AiChartSpec, AiChatToolTrace } from '@/types/ai-chat-protocol'

type ProposalState = {
  busy: boolean
  error: 'apply' | 'undo' | null
  notificationFailed: boolean
  preview: SavedTabsOrganizationPreviewDto | null
  status: 'proposed' | 'applied' | 'undone'
  undoId: string | null
}

const initialState: ProposalState = {
  busy: false,
  error: null,
  notificationFailed: false,
  preview: null,
  status: 'proposed',
  undoId: null,
}

const ProposalPreview = ({
  preview,
  showApprovalNotice,
}: {
  preview: SavedTabsOrganizationPreviewDto
  showApprovalNotice: boolean
}) => {
  const { t } = useI18n()
  return (
    <>
      {showApprovalNotice ? (
        <p className='text-sm'>{t('aiChat.action.approvalNotice')}</p>
      ) : null}
      {preview.proposal.kind !== 'create_project' ? (
        <p className='text-sm font-medium'>
          {t('aiChat.action.count', undefined, {
            count: String(preview.targets.length),
          })}
        </p>
      ) : null}
      {preview.proposal.kind === 'delete_urls' ? (
        <p className='rounded border border-destructive p-2 text-sm font-medium'>
          {t('aiChat.action.deleteNotice')}
        </p>
      ) : null}
      <ul className='max-h-72 space-y-3 overflow-y-auto text-sm'>
        {preview.targets.map((target) => (
          <li className='space-y-1 rounded border p-2' key={target.id}>
            <p className='font-medium wrap-anywhere'>{target.title}</p>
            {target.url ? (
              <p className='text-xs wrap-anywhere text-muted-foreground'>
                {target.url}
              </p>
            ) : null}
            <dl className='grid grid-cols-[auto_1fr] gap-x-2 gap-y-1'>
              <dt>{t('aiChat.action.before')}</dt>
              <dd className='wrap-anywhere'>{target.before}</dd>
              <dt>{t('aiChat.action.after')}</dt>
              <dd className='wrap-anywhere'>{target.after}</dd>
            </dl>
          </li>
        ))}
      </ul>
    </>
  )
}

const ProposalCard = ({
  actionId,
  proposal,
}: {
  actionId: string
  proposal: SavedTabsOrganizationProposal
}) => {
  const { t } = useI18n()
  const [state, setState] = useState<ProposalState>(() => ({
    ...initialState,
    ...readOrganizationActionOutcome(actionId),
  }))
  const pending = useRef(false)

  const run = useCallback(
    async (operation: 'review' | 'apply' | 'undo') => {
      if (pending.current) {
        return
      }
      pending.current = true
      setState((current) => ({ ...current, busy: true, error: null }))
      try {
        const service = getSavedTabsOrganizationService()
        if (operation === 'review') {
          const preview = await service.preview(proposal)
          setState((current) => ({ ...current, preview }))
        } else if (operation === 'apply' && state.preview) {
          const result = await service.execute(state.preview.id)
          rememberOrganizationActionOutcome(actionId, {
            notificationFailed: result.notificationFailed,
            preview: state.preview,
            status: 'applied',
            undoId: result.undoId,
          })
          setState((current) => ({
            ...current,
            notificationFailed: result.notificationFailed,
            status: 'applied',
            undoId: result.undoId,
          }))
        } else if (operation === 'undo' && state.undoId && state.preview) {
          const result = await service.undo(state.undoId)
          rememberOrganizationActionOutcome(actionId, {
            notificationFailed: result.notificationFailed,
            preview: state.preview,
            status: 'undone',
            undoId: null,
          })
          setState((current) => ({
            ...current,
            notificationFailed: result.notificationFailed,
            status: 'undone',
            undoId: null,
          }))
        }
      } catch {
        setState((current) => ({
          ...current,
          error: operation === 'undo' ? 'undo' : 'apply',
          preview: operation === 'undo' ? current.preview : null,
        }))
      } finally {
        pending.current = false
        setState((current) => ({ ...current, busy: false }))
      }
    },
    [actionId, proposal, state.preview, state.undoId],
  )
  const handleReview = useCallback(() => {
    void run('review')
  }, [run])
  const handleApply = useCallback(() => {
    void run('apply')
  }, [run])
  const handleUndo = useCallback(() => {
    void run('undo')
  }, [run])
  const handleCancel = useCallback(() => {
    setState(initialState)
  }, [])

  return (
    <section
      aria-label={t('aiChat.action.title')}
      aria-busy={state.busy}
      className='mt-3 space-y-3 rounded-lg border border-border bg-background p-3 whitespace-normal'
    >
      <p className='text-sm font-semibold'>
        {t(`aiChat.action.${proposal.kind}`)}
      </p>
      {state.preview ? (
        <ProposalPreview
          preview={state.preview}
          showApprovalNotice={state.status === 'proposed'}
        />
      ) : null}
      <p className='text-xs text-muted-foreground'>
        {t('aiChat.action.undoNotice')}
      </p>
      {state.error ? (
        <p role='alert' className='text-sm text-destructive'>
          {t(
            state.error === 'undo'
              ? 'aiChat.action.undoError'
              : 'aiChat.action.error',
          )}
        </p>
      ) : null}
      {state.notificationFailed ? (
        <output className='block text-sm'>
          {t('aiChat.action.notificationFailed')}
        </output>
      ) : null}
      {state.status !== 'proposed' ? (
        <output className='block text-sm'>
          {t(
            state.status === 'applied'
              ? 'aiChat.action.applied'
              : 'aiChat.action.undone',
          )}
        </output>
      ) : null}
      <div className='flex flex-wrap gap-2'>
        {state.status === 'proposed' && !state.preview ? (
          <Button
            disabled={state.busy}
            onClick={handleReview}
            size='sm'
            type='button'
            variant='outline'
          >
            {t('aiChat.action.review')}
          </Button>
        ) : null}
        {state.status === 'proposed' && state.preview ? (
          <>
            <Button
              disabled={state.busy}
              onClick={handleApply}
              size='sm'
              type='button'
            >
              {t('aiChat.action.approve')}
            </Button>
            <Button
              disabled={state.busy}
              onClick={handleCancel}
              size='sm'
              type='button'
              variant='outline'
            >
              {t('aiChat.action.cancel')}
            </Button>
          </>
        ) : null}
        {state.status === 'applied' && state.undoId ? (
          <Button
            disabled={state.busy}
            onClick={handleUndo}
            size='sm'
            type='button'
            variant='outline'
          >
            {t('aiChat.action.undo')}
          </Button>
        ) : null}
      </div>
    </section>
  )
}

const EMPTY_TOOL_TRACES: AiChatToolTrace[] = []

export const SavedTabsActionProposals = ({
  actionScope = '',
  toolTraces = EMPTY_TOOL_TRACES,
  isStreaming = false,
}: {
  actionScope?: string
  toolTraces?: AiChatToolTrace[]
  isStreaming?: boolean
}) => {
  if (isStreaming) {
    return null
  }
  return toolTraces.map((trace) => {
    if (
      trace.toolName !== 'proposeSavedTabsAction' ||
      trace.state !== 'output-available' ||
      typeof trace.output !== 'object' ||
      trace.output === null
    ) {
      return null
    }
    const proposal: unknown = Reflect.get(trace.output, 'proposal')
    const parsed = savedTabsOrganizationProposalSchema.safeParse(proposal)
    const actionId = `${actionScope}:${trace.toolCallId}:${JSON.stringify(parsed.data)}`
    return parsed.success ? (
      <ProposalCard actionId={actionId} key={actionId} proposal={parsed.data} />
    ) : null
  })
}

export const SavedTabsAssistantArtifacts = ({
  actionScope,
  charts,
  toolTraces,
  isStreaming,
}: {
  actionScope: string
  charts?: AiChartSpec[]
  toolTraces?: AiChatToolTrace[]
  isStreaming?: boolean
}) => (
  <>
    <AiChartRenderer {...(charts !== undefined ? { charts } : {})} />
    <SavedTabsActionProposals
      actionScope={actionScope}
      {...(toolTraces !== undefined ? { toolTraces } : {})}
      {...(isStreaming !== undefined ? { isStreaming } : {})}
    />
  </>
)
