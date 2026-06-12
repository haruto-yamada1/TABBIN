import { createContext, use, useMemo } from 'react'
import type { PropsWithChildren } from 'react'

interface SavedTabsResponsiveLayoutContextValue {
  isCompactLayout: boolean
}

const SavedTabsResponsiveLayoutContext =
  createContext<SavedTabsResponsiveLayoutContextValue>({
    isCompactLayout: false,
  })

interface SavedTabsResponsiveLayoutProviderProps extends PropsWithChildren {
  isCompactLayout: boolean
}

export const SavedTabsResponsiveLayoutProvider = ({
  isCompactLayout,
  children,
}: SavedTabsResponsiveLayoutProviderProps) => {
  const value = useMemo(() => ({ isCompactLayout }), [isCompactLayout])

  return (
    <SavedTabsResponsiveLayoutContext.Provider value={value}>
      {children}
    </SavedTabsResponsiveLayoutContext.Provider>
  )
}

export const useSavedTabsResponsiveLayout = () =>
  use(SavedTabsResponsiveLayoutContext)
