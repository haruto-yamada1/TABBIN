import { createContext, useCallback, useContext, useState } from 'react'

export const SAVED_TABS_CARD_COLLAPSE_THRESHOLD = 300

export const SavedTabsCardCollapseContext = createContext({
  collapseByDefault: false,
  isSearching: false,
})

export const useSavedTabsCardCollapse = () => {
  const { collapseByDefault, isSearching } = useContext(
    SavedTabsCardCollapseContext,
  )
  // Keep a mounted card stable if a save or deletion crosses the threshold.
  const [collapse, setCollapse] = useState(() => ({
    initiallyCollapsed: collapseByDefault,
    browse: collapseByDefault,
    search: false,
  }))
  // A manual collapse in search lasts until the query is cleared.
  if (!isSearching && collapse.search) {
    setCollapse({ ...collapse, search: false })
  }
  // Search opens an automatically collapsed card without changing its browse state.
  const scope = collapse.initiallyCollapsed && isSearching ? 'search' : 'browse'
  const setCollapsed = useCallback(
    (value: boolean) => {
      setCollapse((state) =>
        state[scope] === value ? state : { ...state, [scope]: value },
      )
    },
    [scope],
  )
  return [collapse[scope], setCollapsed] as const
}
