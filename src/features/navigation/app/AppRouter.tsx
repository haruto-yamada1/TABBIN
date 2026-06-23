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

import { createSavedTabsUseCasesDeps } from '@/app/composition/createSavedTabsUseCases'
import { createSavedTabsUseCases } from '@/contexts/saved-tabs/application/createSavedTabsUseCases'
import type { SavedTabsDepsFactory } from '@/contexts/saved-tabs/presentation/routes/SavedTabsRoute'
import {
  getSavedTabsEntryRoute,
  getSavedTabsHrefForMode,
} from '@/features/navigation/lib/pageNavigation'

import { AppLayout } from './AppLayout'

interface AppRouterProps {
  initialEntries?: string[]
}

interface StorageLocalRemove {
  remove: (key: string) => Promise<void>
}

const getStorageLocalRemove = (): StorageLocalRemove | null => {
  const chromeValue: unknown = Reflect.get(globalThis, 'chrome')
  if (typeof chromeValue !== 'object' || chromeValue === null) {
    return null
  }
  const storageValue: unknown = Reflect.get(chromeValue, 'storage')
  if (typeof storageValue !== 'object' || storageValue === null) {
    return null
  }
  const localValue: unknown = Reflect.get(storageValue, 'local')
  if (typeof localValue !== 'object' || localValue === null) {
    return null
  }
  const removeValue: unknown = Reflect.get(localValue, 'remove')
  if (typeof removeValue !== 'function') {
    return null
  }
  return {
    remove: async (key) => {
      await Reflect.apply(removeValue, localValue, [key])
    },
  }
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

const createSavedTabsPresentationDependencies: SavedTabsDepsFactory = (
  options,
) => {
  const deps = createSavedTabsUseCasesDeps(options)
  return {
    deps: {
      browserTabPort: deps.browserTabPort,
      categoryAssignmentPort: deps.categoryAssignmentPort,
      messagingPort: deps.messagingPort,
      migrationPort: deps.migrationPort,
      storageChangePort: deps.storageChangePort,
    },
    useCases: createSavedTabsUseCases(deps),
  }
}

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
    const storageLocal = getStorageLocalRemove()
    if (!storageLocal) {
      return
    }
    void storageLocal.remove('viewMode')
  }, [])

  if (!hasModeQuery) {
    return null
  }

  return (
    <Suspense fallback={null}>
      <SavedTabsRouteComponent
        createDeps={createSavedTabsPresentationDependencies}
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
