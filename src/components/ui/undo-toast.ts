import { toast } from 'sonner'

export const UNDO_TOAST_DURATION_MS = 10_000

type UndoAction = {
  readonly onUndone: () => Promise<void>
  readonly undo: () => Promise<void>
}

type Translate = (key: string) => string

const runUndo = async (action: UndoAction, t: Translate): Promise<void> => {
  try {
    await action.undo()
  } catch {
    toast.error(t('savedTabs.undo.operationError'))
    return
  }
  toast.success(t('savedTabs.undo.operationUndone'))
  await action.onUndone()
}

export const showUndoToast = ({
  message,
  onUndone,
  t,
  undo,
}: UndoAction & {
  readonly message: string
  readonly t: Translate
}): void => {
  const expiresAt = Date.now() + UNDO_TOAST_DURATION_MS
  let pending: UndoAction | undefined = { undo, onUndone }
  let timer: ReturnType<typeof setTimeout> | undefined
  const release = () => {
    clearTimeout(timer)
    pending = undefined
  }
  const toastId = toast.info(message, {
    description: t('savedTabs.undo.availabilityNote'),
    duration: UNDO_TOAST_DURATION_MS,
    onAutoClose: release,
    onDismiss: release,
    action: {
      label: t('common.undo'),
      onClick: () => {
        const action = pending
        release()
        if (action && Date.now() < expiresAt) {
          void runUndo(action, t).catch(() =>
            toast.error(t('savedTabs.undo.refreshError')),
          )
        }
      },
    },
  })
  // The action and its data expire even when no Toaster is mounted.
  timer = setTimeout(() => {
    release()
    toast.dismiss(toastId)
  }, UNDO_TOAST_DURATION_MS)
}
