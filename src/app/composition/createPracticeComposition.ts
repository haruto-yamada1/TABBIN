/* eslint-disable typescript/require-await -- memory ports preserve the asynchronous application contracts without external I/O */
import { createSavedTabsUseCases } from '@/contexts/saved-tabs/application/createSavedTabsUseCases'
import type { SavedTabsPresentationPorts } from '@/contexts/saved-tabs/application/ports/SavedTabsPresentationPorts'
import type { SortOrder } from '@/contexts/saved-tabs/application/ports/SavedTabsSortPreferencesPort'
import type { TypedSavedTabsStorageChange } from '@/contexts/saved-tabs/application/ports/StorageChangePort'
import type { SavedTabsUseCases } from '@/contexts/saved-tabs/application/SavedTabsUseCases'
import type { SavedTabsUseCasesDeps } from '@/contexts/saved-tabs/application/SavedTabsUseCasesDeps'
import { defaultUserSettings } from '@/contexts/saved-tabs/domain/services/UserSettingsDefaults'
import type { IndexedDbSavedTabsMutableState } from '@/contexts/saved-tabs/infrastructure/composition/IndexedDbSavedTabsSessionService'
import { createNativeSavedTabsPersistenceAdapters } from '@/contexts/saved-tabs/infrastructure/composition/NativeSavedTabsPersistenceAdapters'
import type {
  PracticeBrowserAction,
  PracticeSeed,
  PracticeSnapshotDto,
} from '@/features/academy/application/dto/PracticeSessionDto'
import { createPracticeSeed } from '@/features/academy/infrastructure/practice/practiceSeed'

const PRACTICE_TIME = 1_700_000_000_000
const PRACTICE_HISTORY_LIMIT = 50

type ExternalDeps = Pick<
  SavedTabsUseCasesDeps,
  | 'browserTabPort'
  | 'browserWindowPort'
  | 'clock'
  | 'idGenerator'
  | 'messagingPort'
  | 'notificationPort'
  | 'storageChangePort'
  | 'userSettingsRepository'
>

type PracticeSession = {
  state: IndexedDbSavedTabsMutableState
  actions: PracticeBrowserAction[]
  settings: SavedTabsUseCasesDeps['userSettingsRepository'] extends {
    findAll: () => Promise<infer Settings>
  }
    ? Settings
    : never
  queue: Promise<void>
  nextId: number
}

export type PracticeComposition = {
  readonly deps: SavedTabsPresentationPorts
  readonly useCases: SavedTabsUseCases
  readonly getSnapshot: () => PracticeSnapshotDto
  readonly getBrowserActions: () => readonly PracticeBrowserAction[]
  readonly subscribe: (listener: () => void) => () => void
  readonly saveDemoTabs: () => Promise<void>
  readonly resetPracticeSession: (
    lessonId?: string,
    stepId?: string,
    seed?: PracticeSeed,
  ) => void
  readonly dispose: () => void
}

const createSession = (seed: PracticeSeed): PracticeSession => {
  const fixture = createPracticeSeed(seed)
  return {
    actions: [],
    nextId: 0,
    queue: Promise.resolve(),
    settings: structuredClone(defaultUserSettings),
    state: {
      categories: [...fixture.categories],
      collections: [...fixture.collections],
      groups: [...fixture.groups],
      memberships: [...fixture.memberships],
      urls: [...fixture.urls],
    },
  }
}

/**
 * The only dependencies are memory and the existing saved-tabs domain/use cases.
 * There is deliberately no production factory or browser-global fallback.
 */
export const createPracticeComposition = (
  initialSeed: PracticeSeed = 'saved',
): PracticeComposition => {
  let current = createSession(initialSeed)
  let disposed = false
  const listeners = new Set<() => void>()
  const storageListeners = new Set<
    (changes: readonly TypedSavedTabsStorageChange[]) => void
  >()
  const sortPreferences = new Map<string, SortOrder>()
  const sortListeners = new Map<string, Set<(order: SortOrder) => void>>()
  const historyListeners = new Set<(removed: readonly string[]) => void>()
  let searchHistory: string[] = []

  const ensureActive = (session = current): void => {
    if (disposed || session !== current) {
      throw new Error('Academy practice session has ended')
    }
  }
  const notify = (): void => {
    for (const listener of listeners) {
      listener()
    }
  }
  const storageChangePort: SavedTabsUseCasesDeps['storageChangePort'] = {
    subscribe: (listener) => {
      storageListeners.add(listener)
      return () => storageListeners.delete(listener)
    },
  }
  const externalFor = (
    session: PracticeSession,
    owner: PracticeSession = current,
  ): ExternalDeps => ({
    browserTabPort: {
      open: async (input) => {
        ensureActive(owner)
        session.actions.push({ type: 'open', urls: [input.url] })
        return { url: input.url }
      },
    },
    browserWindowPort: {
      openWithUrls: async (input) => {
        ensureActive(owner)
        session.actions.push({ type: 'window', urls: [...input.urls] })
        return { urls: [...input.urls], windowId: 1 }
      },
    },
    clock: { now: () => PRACTICE_TIME },
    idGenerator: { generate: () => `practice-created-${session.nextId++}` },
    messagingPort: { send: async () => undefined },
    notificationPort: {
      error: () => undefined,
      info: () => undefined,
      success: () => undefined,
    },
    storageChangePort,
    userSettingsRepository: {
      findAll: async () => structuredClone(session.settings),
      save: async (settings) => {
        ensureActive(owner)
        session.settings = structuredClone(settings)
      },
    },
  })
  const publishChanges = async (session: PracticeSession): Promise<void> => {
    const repositories = createNativeSavedTabsPersistenceAdapters(
      session.state,
      externalFor(session),
    )
    const [groups, parents, projects, order] = await Promise.all([
      repositories.tabGroupRepository.findAll(),
      repositories.parentCategoryRepository.findAll(),
      repositories.customProjectRepository.findAll(),
      repositories.customProjectRepository.findOrder(),
    ])
    ensureActive(session)
    const changes: readonly TypedSavedTabsStorageChange[] = [
      {
        key: 'savedTabs',
        kind: 'parsed',
        oldValue: null,
        payload: [...groups],
      },
      {
        key: 'parentCategories',
        kind: 'parsed',
        oldValue: null,
        payload: [...parents],
      },
      {
        key: 'customProjects',
        kind: 'parsed',
        oldValue: null,
        payload: [...projects],
      },
      {
        key: 'customProjectOrder',
        kind: 'parsed',
        oldValue: null,
        payload: [...order],
      },
      { key: 'urls', kind: 'noPayload', oldValue: null, newValue: null },
    ]
    for (const listener of storageListeners) {
      listener(changes)
    }
    notify()
  }
  const run = async <Result>(
    operation: (
      session: PracticeSession,
      repositories: SavedTabsUseCasesDeps,
    ) => Result | Promise<Result>,
  ): Promise<Result> => {
    const source = current
    const work = source.queue.then(async () => {
      ensureActive(source)
      const working: PracticeSession = {
        ...source,
        actions: structuredClone(source.actions),
        settings: structuredClone(source.settings),
        state: structuredClone(source.state),
      }
      const before = JSON.stringify([
        source.state,
        source.settings,
        source.actions,
      ])
      const result = await operation(
        working,
        createNativeSavedTabsPersistenceAdapters(
          working.state,
          externalFor(working),
        ),
      )
      ensureActive(source)
      source.state = working.state
      source.actions = working.actions
      source.settings = working.settings
      source.nextId = working.nextId
      if (
        before !==
        JSON.stringify([source.state, source.settings, source.actions])
      ) {
        await publishChanges(source)
      }
      return result
    })
    source.queue = work.then(
      () => undefined,
      () => undefined,
    )
    return work
  }
  // A typed real use-case object supplies the operation table. Only dispatch is
  // decorated: algorithms and domain rules remain the production implementations.
  const target = createSavedTabsUseCases(
    createNativeSavedTabsPersistenceAdapters(
      current.state,
      externalFor(current),
    ),
  )
  // Hooks subscribe using these identities; a fresh function per access would
  // reload modal state on every parent render and discard the user's selection.
  const boundOperations = new Map<
    PropertyKey,
    (...args: readonly unknown[]) => Promise<unknown>
  >()
  const useCases = new Proxy(target, {
    get: (operations, property): unknown => {
      const operation: unknown = Reflect.get(operations, property)
      if (typeof operation !== 'function') {
        return operation
      }
      const cached = boundOperations.get(property)
      if (cached) {
        return cached
      }
      const boundOperation = async (...args: readonly unknown[]) =>
        run(async (_session, repositories) => {
          const bound = createSavedTabsUseCases(repositories)
          const selected: unknown = Reflect.get(bound, property)
          if (typeof selected !== 'function') {
            throw new TypeError('Unknown Academy practice operation')
          }
          const result: unknown = Reflect.apply(selected, bound, args)
          return result
        })
      boundOperations.set(property, boundOperation)
      return boundOperation
    },
  })
  const recordHistory = async (query: string): Promise<string[]> => {
    ensureActive()
    const term = query.trim()
    if (term) {
      searchHistory = [
        term,
        ...searchHistory.filter((item) => item !== term),
      ].slice(0, PRACTICE_HISTORY_LIMIT)
    }
    return [...searchHistory]
  }
  const deps: SavedTabsPresentationPorts = {
    browserTabPort: {
      open: async (input) =>
        run(async (session) => externalFor(session).browserTabPort.open(input)),
    },
    categoryAssignmentPort: {
      saveParentCategories: async (categories) =>
        run(async (_session, repos) =>
          repos.categoryAssignmentPort.saveParentCategories(categories),
        ),
      saveTabGroups: async (groups) =>
        run(async (_session, repos) =>
          repos.categoryAssignmentPort.saveTabGroups(groups),
        ),
    },
    messagingPort: { send: async () => undefined },
    openSavedTabsPort: {
      getSnapshot: () => false,
      subscribe: () => () => undefined,
    },
    searchHistoryPort: {
      read: async () => [...searchHistory],
      record: recordHistory,
      schedule: async (query, signal) =>
        signal.aborted ? [...searchHistory] : recordHistory(query),
      remove: async (query) => {
        ensureActive()
        searchHistory = searchHistory.filter((item) => item !== query)
        for (const listener of historyListeners) {
          listener([query])
        }
        return [...searchHistory]
      },
      subscribe: (listener) => {
        historyListeners.add(listener)
        return () => historyListeners.delete(listener)
      },
    },
    sortPreferencesPort: {
      read: async (scope, id) =>
        sortPreferences.get(`${scope}:${id}`) ?? 'default',
      write: async (scope, id, order) => {
        ensureActive()
        const key = `${scope}:${id}`
        sortPreferences.set(key, order)
        for (const listener of sortListeners.get(key) ?? []) {
          listener(order)
        }
      },
      subscribe: (scope, id, listener) => {
        const key = `${scope}:${id}`
        const subscriptions = sortListeners.get(key) ?? new Set()
        subscriptions.add(listener)
        sortListeners.set(key, subscriptions)
        return () => subscriptions.delete(listener)
      },
    },
    storageChangePort,
  }
  return {
    deps,
    useCases,
    getSnapshot: () => structuredClone(current.state),
    getBrowserActions: () => structuredClone(current.actions),
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    saveDemoTabs: async () =>
      run((session) => {
        if (session.state.collections.length > 0) {
          return
        }
        session.state = createSession('saved').state
        session.actions.push({
          type: 'close',
          urls: session.state.urls.map(({ url }) => url),
        })
      }),
    resetPracticeSession: (_lessonId, _stepId, seed = initialSeed) => {
      ensureActive()
      current = createSession(seed)
      sortPreferences.clear()
      searchHistory = []
      notify()
    },
    dispose: () => {
      disposed = true
      current = createSession('empty')
      listeners.clear()
      storageListeners.clear()
      sortListeners.clear()
      sortPreferences.clear()
      historyListeners.clear()
      searchHistory = []
    },
  }
}
