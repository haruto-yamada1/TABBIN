export type SavedTabSelectionItem = {
  groupId: string
  url: string
  title: string
}

type Operation = 'open' | 'delete'
const BULK_OPEN_CONFIRMATION_THRESHOLD = 10
type SelectionMessage = { kind: 'openError' | 'deleteError' }

type Confirmation = {
  operation: Operation
  items: SavedTabSelectionItem[]
}

type SelectionSnapshot = {
  active: boolean
  busy: Operation | null
  selected: ReadonlySet<string>
  confirmation: Confirmation | null
  message: SelectionMessage | null
}

type SelectionCallbacks = {
  confirmDeleteAll: boolean
  onOpen: (items: SavedTabSelectionItem[]) => Promise<void>
  onDelete: (items: SavedTabSelectionItem[]) => Promise<void>
}

export const savedTabSelectionKey = (item: SavedTabSelectionItem) =>
  JSON.stringify([item.groupId, item.url])

export const createSavedTabSelectionStore = () => {
  let snapshot: SelectionSnapshot = {
    active: false,
    busy: null,
    selected: new Set(),
    confirmation: null,
    message: null,
  }
  const listeners = new Set<() => void>()
  const rows = new Map<
    string,
    { item: SavedTabSelectionItem; element: HTMLElement }
  >()
  let anchor: string | null = null
  let scopeVersion = 0
  let pruneScheduled = false

  const update = (partial: Partial<SelectionSnapshot>) => {
    snapshot = { ...snapshot, ...partial }
    for (const listener of listeners) {
      listener()
    }
  }

  const visibleRows = () =>
    Array.from(rows.values())
      .filter(({ element }) => element.isConnected)
      .toSorted((left, right) => {
        if (left.element === right.element) {
          return 0
        }
        return left.element.compareDocumentPosition(right.element) &
          Node.DOCUMENT_POSITION_FOLLOWING
          ? -1
          : 1
      })

  const canChange = () =>
    snapshot.active && !snapshot.busy && !snapshot.confirmation

  const reset = (keepMode = false) => {
    scopeVersion += 1
    anchor = null
    update({
      active: keepMode && snapshot.active,
      selected: new Set(),
      confirmation: null,
      message: null,
    })
  }

  const execute = async (
    operation: Operation,
    items: SavedTabSelectionItem[],
    callbacks: SelectionCallbacks,
  ) => {
    if (snapshot.busy || items.length === 0) {
      return
    }
    const version = scopeVersion
    // This guard changes before invoking callbacks, including synchronous ones.
    update({ busy: operation, confirmation: null, message: null })
    try {
      if (operation === 'open') {
        await callbacks.onOpen(items)
      } else {
        await callbacks.onDelete(items)
        if (version === scopeVersion) {
          update({ selected: new Set() })
        }
      }
    } catch {
      if (version === scopeVersion) {
        update({
          message: { kind: operation === 'open' ? 'openError' : 'deleteError' },
        })
      }
    } finally {
      update({ busy: null })
    }
  }

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    reset,
    enter: () => {
      if (!snapshot.busy) {
        update({ active: true, message: null })
      }
    },
    exit: () => {
      if (canChange()) {
        reset()
      }
    },
    clear: () => {
      if (!canChange()) {
        return
      }
      anchor = null
      update({ selected: new Set(), message: null })
    },
    selectAll: () => {
      if (!canChange()) {
        return
      }
      anchor = null
      update({
        selected: new Set(
          visibleRows().map(({ item }) => savedTabSelectionKey(item)),
        ),
        message: null,
      })
    },
    toggle: (key: string, shift: boolean) => {
      if (!canChange()) {
        return
      }
      const keys = visibleRows().map(({ item }) => savedTabSelectionKey(item))
      const targetIndex = keys.indexOf(key)
      if (targetIndex < 0) {
        return
      }
      const selected = new Set(snapshot.selected)
      const anchorIndex = anchor === null ? -1 : keys.indexOf(anchor)
      if (shift && anchorIndex >= 0) {
        for (const rangeKey of keys.slice(
          Math.min(anchorIndex, targetIndex),
          Math.max(anchorIndex, targetIndex) + 1,
        )) {
          selected.add(rangeKey)
        }
      } else {
        if (selected.has(key)) {
          selected.delete(key)
        } else {
          selected.add(key)
        }
        anchor = key
      }
      update({ selected, message: null })
    },
    register: (item: SavedTabSelectionItem, element: HTMLElement) => {
      const key = savedTabSelectionKey(item)
      rows.set(key, { item, element })
      return () => {
        if (rows.get(key)?.element !== element) {
          return
        }
        rows.delete(key)
        // A collapse can detach thousands of rows in one commit. Prune once.
        if (pruneScheduled) {
          return
        }
        pruneScheduled = true
        queueMicrotask(() => {
          pruneScheduled = false
          const selected = new Set(
            Array.from(snapshot.selected).filter((selectedKey) =>
              rows.has(selectedKey),
            ),
          )
          if (anchor && !rows.has(anchor)) {
            anchor = null
          }
          if (selected.size !== snapshot.selected.size) {
            update({ selected })
          }
        })
      }
    },
    request: (operation: Operation, callbacks: SelectionCallbacks) => {
      if (!canChange()) {
        return
      }
      const items = visibleRows()
        .map(({ item }) => item)
        .filter((item) => snapshot.selected.has(savedTabSelectionKey(item)))
      if (items.length === 0) {
        return
      }
      if (
        (operation === 'delete' && callbacks.confirmDeleteAll) ||
        (operation === 'open' &&
          items.length >= BULK_OPEN_CONFIRMATION_THRESHOLD)
      ) {
        update({ confirmation: { operation, items }, message: null })
      } else {
        void execute(operation, items, callbacks)
      }
    },
    cancelConfirmation: () => {
      if (!snapshot.busy) {
        update({ confirmation: null })
      }
    },
    confirm: (callbacks: SelectionCallbacks) => {
      if (!snapshot.confirmation || snapshot.busy) {
        return
      }
      const { operation, items } = snapshot.confirmation
      void execute(operation, items, callbacks)
    },
  }
}

export type SavedTabSelectionStore = ReturnType<
  typeof createSavedTabSelectionStore
>
