import { Suspense, lazy, useCallback, useEffect } from 'react'
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

const AiChatRoutePage = lazy(async () =>
  import('@/features/ai-chat/routes/AiChatRoute').then(({ AiChatRoute }) => ({
    default: AiChatRoute,
  })),
)

const AnalyticsRoutePage = lazy(async () =>
  import('@/features/analytics/routes/AnalyticsRoute').then(
    ({ AnalyticsRoute }) => ({
      default: AnalyticsRoute,
    }),
  ),
)

const OptionsRoutePage = lazy(async () =>
  import('@/features/options/routes/OptionsRoute').then(({ OptionsRoute }) => ({
    default: OptionsRoute,
  })),
)

const PeriodicExecutionRoutePage = lazy(async () =>
  import('@/features/periodic-execution/routes/PeriodicExecutionRoute').then(
    ({ PeriodicExecutionRoute }) => ({
      default: PeriodicExecutionRoute,
    }),
  ),
)

const SavedTabsRouteComponent = lazy(async () =>
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

  const handleViewModeNavigate = useCallback(
    (mode: 'custom' | 'domain') => {
      const nextRoute = getSavedTabsHrefForMode(mode)
      const currentRoute = `${routerLocation.pathname}${routerLocation.search}`

      if (currentRoute === nextRoute) {
        return
      }

      void navigate(nextRoute, { replace: true })
    },
    [routerLocation.pathname, routerLocation.search, navigate],
  )

  useEffect(() => {
    if (hasModeQuery) {
      return
    }
    const nextRoute = getSavedTabsHrefForMode('domain')
    void navigate(nextRoute, { replace: true })
  }, [hasModeQuery, routerLocation.pathname, routerLocation.search, navigate])

  useEffect(() => {
    if (typeof chrome === 'undefined' || typeof chrome.storage !== 'object' || chrome.storage === null || typeof chrome.storage.local !== 'object' || chrome.storage.local === null || !('remove' in chrome.storage.local)) {
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
    {/* eslint-disable react-perf/jsx-no-jsx-as-prop -- React Router v6 <Route element={...}> は必須の JSX-as-prop API */}
    <Route element={<AppLayout />}>
      <Route
        index
        element={
          /* eslint-disable react-perf/jsx-no-jsx-as-prop -- React Router <Navigate> element prop */
          <Navigate to={getSavedTabsEntryRoute()} replace />
        }
      />

      <Route path='/saved-tabs' element={<SavedTabsRoutePage />} />
      <Route
        path='/ai-chat'
        element={
          /* eslint-disable react-perf/jsx-no-jsx-as-prop -- React Router <Suspense> element prop */
          <Suspense fallback={null}>
            <AiChatRoutePage />
          </Suspense>
        }
      />
      <Route
        path='/analytics'
        element={
          /* eslint-disable react-perf/jsx-no-jsx-as-prop -- React Router <Suspense> element prop */
          <Suspense fallback={null}>
            <AnalyticsRoutePage />
          </Suspense>
        }
      />
      <Route
        path='/options'
        element={
          /* eslint-disable react-perf/jsx-no-jsx-as-prop -- React Router <Suspense> element prop */
          <Suspense fallback={null}>
            <OptionsRoutePage />
          </Suspense>
        }
      />
      <Route
        path='/periodic-execution'
        element={
          /* eslint-disable react-perf/jsx-no-jsx-as-prop -- React Router <Suspense> element prop */
          <Suspense fallback={null}>
            <PeriodicExecutionRoutePage />
          </Suspense>
        }
      />
      <Route
        path='*'
        element={
          /* eslint-disable react-perf/jsx-no-jsx-as-prop -- React Router <Navigate> element prop */
          <Navigate to={getSavedTabsEntryRoute()} replace />
        }
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
