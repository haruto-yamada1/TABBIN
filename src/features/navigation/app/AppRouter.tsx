import { useEffect } from 'react'
import {
  HashRouter,
  MemoryRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom'

import { AiChatRoute } from '@/features/ai-chat/routes/AiChatRoute'
import { AnalyticsRoute } from '@/features/analytics/routes/AnalyticsRoute'
import {
  getSavedTabsEntryRoute,
  getSavedTabsHrefForMode,
} from '@/features/navigation/lib/pageNavigation'
import { OptionsRoute } from '@/features/options/routes/OptionsRoute'
import { PeriodicExecutionRoute } from '@/features/periodic-execution/routes/PeriodicExecutionRoute'
import { SavedTabsRoute } from '@/features/saved-tabs/routes/SavedTabsRoute'

import { AppLayout } from './AppLayout'

interface AppRouterProps {
  initialEntries?: string[]
}

const SavedTabsRoutePage = () => {
  const routerLocation = useLocation()
  const navigate = useNavigate()
  const hasModeQuery = new URLSearchParams(routerLocation.search).has('mode')

  const handleViewModeNavigate = (mode: 'custom' | 'domain') => {
    const nextRoute = getSavedTabsHrefForMode(mode)
    const currentRoute = `${routerLocation.pathname}${routerLocation.search}`

    if (currentRoute === nextRoute) {
      return
    }

    navigate(nextRoute, { replace: true })
  }

  useEffect(() => {
    if (hasModeQuery) {
      return
    }
    const nextRoute = getSavedTabsHrefForMode('domain')
    const currentRoute = `${routerLocation.pathname}${routerLocation.search}`
    /* v8 ignore next -- /saved-tabs without a mode query cannot equal the domain route. */
    if (currentRoute === nextRoute) {
      return
    }
    navigate(nextRoute, { replace: true })
  }, [hasModeQuery, routerLocation.pathname, routerLocation.search, navigate])

  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.storage?.local?.remove) {
      return
    }
    void chrome.storage.local.remove('viewMode')
  }, [])

  if (!hasModeQuery) {
    return null
  }

  return (
    <SavedTabsRoute
      search={routerLocation.search}
      onViewModeNavigate={handleViewModeNavigate}
    />
  )
}

const AppRoutes = () => (
  <Routes>
    <Route element={<AppLayout />}>
      <Route
        index
        element={<Navigate to={getSavedTabsEntryRoute()} replace />}
      />
      <Route path='/saved-tabs' element={<SavedTabsRoutePage />} />
      <Route path='/ai-chat' element={<AiChatRoute />} />
      <Route path='/analytics' element={<AnalyticsRoute />} />
      <Route path='/options' element={<OptionsRoute />} />
      <Route path='/periodic-execution' element={<PeriodicExecutionRoute />} />
      <Route
        path='*'
        element={<Navigate to={getSavedTabsEntryRoute()} replace />}
      />
    </Route>
  </Routes>
)

export const AppRouter = ({ initialEntries }: AppRouterProps) => {
  if (initialEntries) {
    return (
      <MemoryRouter initialEntries={initialEntries}>
        <AppRoutes />
      </MemoryRouter>
    )
  }

  return (
    <HashRouter>
      <AppRoutes />
    </HashRouter>
  )
}
