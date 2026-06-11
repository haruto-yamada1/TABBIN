import type { Dispatch, SetStateAction } from 'react'

const getNextPendingDeleteHistoryItem = <T>(
  currentItem: T | null,
  open: boolean,
): T | null => (open ? currentItem : null)

const createPendingDeleteHistoryOpenChangeHandler =
  <T>(setPendingItem: Dispatch<SetStateAction<T | null>>) =>
  (open: boolean): void => {
    setPendingItem((currentItem) =>
      getNextPendingDeleteHistoryItem(currentItem, open),
    )
  }

export {
  createPendingDeleteHistoryOpenChangeHandler,
  getNextPendingDeleteHistoryItem,
}
