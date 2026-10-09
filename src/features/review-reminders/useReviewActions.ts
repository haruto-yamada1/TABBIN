import { useCallback, useRef, useState } from 'react'

import { getSavedTabsOrganizationService } from '@/app/composition/savedTabsOrganization'
import type { SavedTabsOrganizationPreviewDto } from '@/contexts/saved-tabs/public-api'

type ActionState = {
  busy: boolean
  error: 'reviewReminder.actionError' | 'reviewReminder.undoError' | null
  notice: 'deleted' | 'undone' | null
  notificationFailed: boolean
  preview: SavedTabsOrganizationPreviewDto | null
  undoId: string | null
}

export const useReviewActions = (refresh: () => void) => {
  const [state, setState] = useState<ActionState>({
    busy: false,
    error: null,
    notice: null,
    notificationFailed: false,
    preview: null,
    undoId: null,
  })
  const pending = useRef(false)
  const run = useCallback(
    async (operation: () => Promise<void>, error: ActionState['error']) => {
      if (pending.current) {
        return
      }
      pending.current = true
      setState((current) => ({ ...current, busy: true, error: null }))
      try {
        await operation()
      } catch {
        setState((current) => ({ ...current, error, preview: null }))
      } finally {
        pending.current = false
        setState((current) => ({ ...current, busy: false }))
      }
    },
    [],
  )
  const handleRequestDelete = useCallback(
    (urlIds: string[]) => {
      void run(async () => {
        const preview = await getSavedTabsOrganizationService().preview({
          kind: 'delete_urls',
          urlIds,
        })
        setState((current) => ({ ...current, preview }))
      }, 'reviewReminder.actionError')
    },
    [run],
  )
  const handleConfirmDelete = useCallback(() => {
    if (!state.preview) {
      return
    }
    const previewId = state.preview.id
    void run(async () => {
      const result = await getSavedTabsOrganizationService().execute(previewId)
      setState((current) => ({
        ...current,
        preview: null,
        undoId: result.undoId,
        notice: 'deleted',
        notificationFailed: result.notificationFailed,
      }))
      refresh()
    }, 'reviewReminder.actionError')
  }, [refresh, run, state.preview])
  const handleUndo = useCallback(() => {
    if (!state.undoId) {
      return
    }
    const undoId = state.undoId
    void run(async () => {
      const result = await getSavedTabsOrganizationService().undo(undoId)
      setState((current) => ({
        ...current,
        undoId: null,
        notice: 'undone',
        notificationFailed: result.notificationFailed,
      }))
      refresh()
    }, 'reviewReminder.undoError')
  }, [refresh, run, state.undoId])
  const handleCancelDelete = useCallback(() => {
    if (!pending.current) {
      setState((current) => ({ ...current, preview: null }))
    }
  }, [])
  return {
    state,
    handleRequestDelete,
    handleConfirmDelete,
    handleCancelDelete,
    handleUndo,
  }
}
