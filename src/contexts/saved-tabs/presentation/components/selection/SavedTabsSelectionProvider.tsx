import type { MouseEvent, ReactNode } from 'react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ActionConfirmDialog } from '@/contexts/saved-tabs/presentation/components/shared/ActionConfirmDialog'
import { useI18n } from '@/features/i18n/context/I18nProvider'

import type {
  SavedTabSelectionItem,
  SavedTabSelectionStore,
} from './savedTabSelectionStore'
import {
  createSavedTabSelectionStore,
  savedTabSelectionKey,
} from './savedTabSelectionStore'

export type { SavedTabSelectionItem } from './savedTabSelectionStore'

type SavedTabsSelectionProviderProps = {
  children: ReactNode
  scopeKey: string
  confirmDeleteAll: boolean
  onOpen: (items: SavedTabSelectionItem[]) => Promise<void>
  onDelete: (items: SavedTabSelectionItem[]) => Promise<void>
}

type SelectionSnapshot = ReturnType<SavedTabSelectionStore['getSnapshot']>
type SelectionCallbacks = Omit<
  SavedTabsSelectionProviderProps,
  'children' | 'scopeKey'
>
const SelectionContext = createContext<SavedTabSelectionStore | null>(null)
const emptySubscribe = () => () => {}
const ACTIVE = 1
const BUSY = 2
const CONFIRMING = 4
const SELECTED = 8

const SelectionConfirmation = ({
  confirmation,
  store,
  callbacks,
}: {
  confirmation: SelectionSnapshot['confirmation']
  store: SavedTabSelectionStore
  callbacks: SelectionCallbacks
}) => {
  const { t } = useI18n()
  const deleting = confirmation?.operation === 'delete'
  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        store.cancelConfirmation()
      }
    },
    [store],
  )
  const handleConfirm = useCallback(() => {
    store.confirm(callbacks)
  }, [callbacks, store])
  return (
    <ActionConfirmDialog
      open={Boolean(confirmation)}
      onOpenChange={handleOpenChange}
      onConfirm={handleConfirm}
      title={t(
        deleting
          ? 'savedTabs.selection.deleteConfirmTitle'
          : 'savedTabs.selection.openConfirmTitle',
        undefined,
        { count: String(confirmation?.items.length ?? 0) },
      )}
      description={t(
        deleting
          ? 'savedTabs.selection.deleteConfirmDescription'
          : 'savedTabs.selection.openConfirmDescription',
      )}
      cancelLabel={t('common.cancel')}
      confirmLabel={t(
        deleting ? 'savedTabs.selection.delete' : 'savedTabs.selection.open',
      )}
      variant={deleting ? 'destructive' : 'default'}
    />
  )
}

const SelectionError = ({
  message,
}: {
  message: SelectionSnapshot['message']
}) => {
  const { t } = useI18n()
  if (!message) {
    return null
  }
  return (
    <p role='alert' className='mb-3 text-sm text-destructive'>
      {t(`savedTabs.selection.${message.kind}`)}
    </p>
  )
}

const SelectionToolbar = ({
  store,
  ...callbacks
}: SelectionCallbacks & { store: SavedTabSelectionStore }) => {
  const { t } = useI18n()
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const instructionsId = useId()
  const startButtonRef = useRef<HTMLButtonElement>(null)
  const wasActive = useRef(false)
  useLayoutEffect(() => {
    if (wasActive.current && !state.active) {
      startButtonRef.current?.focus()
    }
    wasActive.current = state.active
  }, [state.active])
  const handleOpen = useCallback(() => {
    store.request('open', callbacks)
  }, [callbacks, store])
  const handleDelete = useCallback(() => {
    store.request('delete', callbacks)
  }, [callbacks, store])
  const handleSelectAll = store.selectAll
  const handleClear = store.clear
  const handleExit = store.exit
  const handleEnter = store.enter
  const locked = state.busy !== null || state.confirmation !== null
  const empty = state.selected.size === 0
  return (
    <>
      <fieldset
        className='mb-3 flex flex-wrap items-center gap-2'
        aria-label={t('savedTabs.selection.toolbar')}
        aria-describedby={state.active ? instructionsId : undefined}
        aria-busy={state.busy !== null}
        disabled={locked}
      >
        {state.active ? (
          <>
            <output
              aria-live='polite'
              aria-atomic='true'
              className='mr-2 text-sm font-medium'
            >
              {t('savedTabs.selection.count', undefined, {
                count: String(state.selected.size),
              })}
            </output>
            <Button size='sm' variant='outline' onClick={handleSelectAll}>
              {t('savedTabs.selection.selectAll')}
            </Button>
            <Button
              size='sm'
              variant='outline'
              disabled={empty}
              onClick={handleClear}
            >
              {t('savedTabs.selection.clear')}
            </Button>
            <Button size='sm' disabled={empty} onClick={handleOpen}>
              {t(
                state.busy === 'open'
                  ? 'savedTabs.selection.opening'
                  : 'savedTabs.selection.open',
              )}
            </Button>
            <Button
              size='sm'
              variant='destructive'
              disabled={empty}
              onClick={handleDelete}
            >
              {t(
                state.busy === 'delete'
                  ? 'savedTabs.selection.deleting'
                  : 'savedTabs.selection.delete',
              )}
            </Button>
            <Button size='sm' variant='ghost' onClick={handleExit}>
              {t('savedTabs.selection.done')}
            </Button>
          </>
        ) : (
          <Button
            ref={startButtonRef}
            size='sm'
            variant='outline'
            onClick={handleEnter}
          >
            {t('savedTabs.selection.start')}
          </Button>
        )}
      </fieldset>
      {state.active && (
        <p id={instructionsId} className='mb-3 text-sm text-muted-foreground'>
          {t('savedTabs.selection.instructions')}
        </p>
      )}
      <SelectionError message={state.message} />
      <SelectionConfirmation
        confirmation={state.confirmation}
        store={store}
        callbacks={callbacks}
      />
    </>
  )
}

export const SavedTabsSelectionProvider = ({
  children,
  scopeKey,
  ...callbacks
}: SavedTabsSelectionProviderProps) => {
  // The external store owns its updates; its identity is stable for this mount.
  // eslint-disable-next-line react/hook-use-state
  const [store] = useState(createSavedTabSelectionStore)
  useLayoutEffect(() => {
    store.reset(true)
  }, [scopeKey, store])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) {
        return
      }
      const state = store.getSnapshot()
      if (!state.active || state.busy || state.confirmation) {
        return
      }
      event.preventDefault()
      store.exit()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [store])
  return (
    <SelectionContext value={store}>
      <SelectionToolbar store={store} {...callbacks} />
      {children}
    </SelectionContext>
  )
}

const SelectionCheckbox = ({
  item: { groupId, url, title },
  store,
  checked,
  disabled,
}: {
  item: SavedTabSelectionItem
  store: SavedTabSelectionStore
  checked: boolean
  disabled: boolean
}) => {
  const { t } = useI18n()
  const cleanupRef = useRef<(() => void) | null>(null)
  const setNode = useCallback(
    (node: HTMLButtonElement | null) => {
      cleanupRef.current?.()
      cleanupRef.current = node
        ? store.register({ groupId, url, title }, node)
        : null
    },
    [groupId, url, title, store],
  )
  const handleClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      store.toggle(
        savedTabSelectionKey({ groupId, url, title }),
        event.shiftKey,
      )
    },
    [groupId, url, title, store],
  )
  return (
    <Checkbox
      ref={setNode}
      checked={checked}
      disabled={disabled}
      aria-label={t('savedTabs.selection.item', undefined, { title })}
      className='mx-2 shrink-0'
      onClick={handleClick}
    />
  )
}

export const useSavedTabSelectionItem = (item: SavedTabSelectionItem) => {
  const store = useContext(SelectionContext)
  const key = savedTabSelectionKey(item)
  // A change to a different row does not schedule a React render for this row.
  const flags = useSyncExternalStore(store?.subscribe ?? emptySubscribe, () => {
    if (!store) {
      return 0
    }
    const state = store.getSnapshot()
    return (
      (state.active ? ACTIVE : 0) |
      (state.busy ? BUSY : 0) |
      (state.confirmation ? CONFIRMING : 0) |
      (state.selected.has(key) ? SELECTED : 0)
    )
  })
  const active = Boolean(flags & ACTIVE)
  const disabled = Boolean(flags & (BUSY | CONFIRMING))
  const handleSelectionClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (!store?.getSnapshot().active) {
        return false
      }
      event.preventDefault()
      event.stopPropagation()
      if (event.button === 0) {
        store.toggle(key, event.shiftKey)
      }
      return true
    },
    [key, store],
  )
  return {
    checkbox:
      active && store ? (
        <SelectionCheckbox
          item={item}
          store={store}
          checked={Boolean(flags & SELECTED)}
          disabled={disabled}
        />
      ) : null,
    handleSelectionClick,
    isSelectionMode: active,
    isSelectionBusy: disabled,
  }
}
