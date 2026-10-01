import { lazy } from 'react'

export const LazySavedTabsRoute = lazy(async () =>
  import('@/contexts/saved-tabs/presentation/routes/SavedTabsRoute').then(
    ({ SavedTabsRoute }) => ({ default: SavedTabsRoute }),
  ),
)
