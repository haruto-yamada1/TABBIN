import { Suspense, lazy, useEffect } from 'react'
import {
  HashRouter,
  MemoryRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom'

import {
  getSavedTabsEntryRoute,
  getSavedTabsHrefForMode,
} from '@/features/navigation/lib/pageNavigation'

import { AppLayout } from './AppLayout'

interface AppRouterProps {
  initialEntries?: string[]
}

const AiChatRoutePage = lazy(() =>
  import('@/features/ai-chat/routes/AiChatRoute').then(({ AiChatRoute }) => ({
    default: AiChatRoute,
  })),
)

const AnalyticsRoutePage = lazy(() =>
  import('@/features/analytics/routes/AnalyticsRoute').then(
    ({ AnalyticsRoute }) => ({
      default: AnalyticsRoute,
    }),
  ),
)

const OptionsRoutePage = lazy(() =>
  import('@/features/options/routes/OptionsRoute').then(({ OptionsRoute }) => ({
    default: OptionsRoute,
  })),
)

const PeriodicExecutionRoutePage = lazy(() =>
  import('@/features/periodic-execution/routes/PeriodicExecutionRoute').then(
    ({ PeriodicExecutionRoute }) => ({
      default: PeriodicExecutionRoute,
    }),
  ),
)

const SavedTabsRouteComponent = lazy(() =>
  import('@/contexts/saved-tabs/presentation/routes/SavedTabsRoute').then(
    ({ SavedTabsRoute }) => ({
      default: SavedTabsRoute,
    }),
  ),
)

const SavedTabsRoutePage = () => {
  const routerLocation = useLocation()
  const navigate = useNavigate()
  const hasModeQuery = new URLSearchParams(routerLocation.search).has('mode')

  // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
  const handleViewModeNavigate = (mode: 'custom' | 'domain') => {
    const nextRoute = getSavedTabsHrefForMode(mode)
    const currentRoute = `${routerLocation.pathname}${routerLocation.search}`

    if (currentRoute === nextRoute) {
      return
    }

    // eslint-disable-next-line typescript/no-floating-promises
    navigate(nextRoute, { replace: true })
  }

  useEffect(() => {
    if (hasModeQuery) {
      return
    }
    const nextRoute = getSavedTabsHrefForMode('domain')
    // eslint-disable-next-line typescript/no-floating-promises
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
    <Suspense fallback={null}>
      <SavedTabsRouteComponent
        search={routerLocation.search}
        onViewModeNavigate={handleViewModeNavigate}
      />
    </Suspense>
  )
}

const AppRoutes = () => (
  <Routes>
    {/* eslint-disable-next-line react-perf/jsx-no-jsx-as-prop */}
    <Route element={<AppLayout />}>
      <Route
        index
        // eslint-disable-next-line react-perf/jsx-no-jsx-as-prop
        element={<Navigate to={getSavedTabsEntryRoute()} replace />}
      />
      {/* eslint-disable-next-line react-perf/jsx-no-jsx-as-prop */}
      <Route path='/saved-tabs' element={<SavedTabsRoutePage />} />
      <Route
        path='/ai-chat'
        element={
          // eslint-disable-next-line react-perf/jsx-no-jsx-as-prop
          <Suspense fallback={null}>
            <AiChatRoutePage />
          </Suspense>
        }
      />
      <Route
        path='/analytics'
        element={
          // eslint-disable-next-line react-perf/jsx-no-jsx-as-prop
          <Suspense fallback={null}>
            <AnalyticsRoutePage />
          </Suspense>
        }
      />
      <Route
        path='/options'
        element={
          // eslint-disable-next-line react-perf/jsx-no-jsx-as-prop
          <Suspense fallback={null}>
            <OptionsRoutePage />
          </Suspense>
        }
      />
      <Route
        path='/periodic-execution'
        element={
          // eslint-disable-next-line react-perf/jsx-no-jsx-as-prop
          <Suspense fallback={null}>
            <PeriodicExecutionRoutePage />
          </Suspense>
        }
      />
      <Route
        path='*'
        // eslint-disable-next-line react-perf/jsx-no-jsx-as-prop
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
