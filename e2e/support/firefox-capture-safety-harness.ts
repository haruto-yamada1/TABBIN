/* eslint-disable no-restricted-imports -- native Firefox regression exercises the production capture and persistence boundaries */
import { browser } from 'wxt/browser'

import { getBackgroundSavedTabsDataPlane } from '@/app/composition/backgroundSavedTabsDataPlane'
import { TabFilteringError } from '@/lib/background/capture-plan'
import {
  handleExtensionActionClick,
  handleSaveAllWindowsTabs,
  handleSaveCurrentTab,
  handleSaveSameDomainTabs,
  handleSaveWindowTabs,
} from '@/lib/background/extension-actions'
import { getChromeStorageLocal } from '@/lib/browser/chrome-storage'
import { defaultSettings, UserSettingsReadError } from '@/lib/storage/settings'

import { waitForRoute } from './firefox-saved-tabs-page-harness'

export type FirefoxCaptureSafetySmokeResult = {
  readonly completedTabClosed: boolean
  readonly directFailures: number
  readonly toolbarFailures: number
  readonly fixtureTabs: number
  readonly loadingTabPreserved: boolean
  readonly tabsUnchanged: boolean
  readonly persistenceUnchanged: boolean
  readonly settingsUnchanged: boolean
  readonly restored: boolean
}

const operations = [
  { clickBehavior: 'saveCurrentTab', run: handleSaveCurrentTab },
  { clickBehavior: 'saveSameDomainTabs', run: handleSaveSameDomainTabs },
  { clickBehavior: 'saveWindowTabs', run: handleSaveWindowTabs },
  { clickBehavior: 'saveAllWindowsTabs', run: handleSaveAllWindowsTabs },
] as const

const failures = [
  'settings-unavailable',
  'invalid-exclude-patterns',
  'filter-evaluation',
  'persistence',
] as const
type Failure = (typeof failures)[number]

const persistenceFailure = new DOMException(
  'Firefox capture smoke write failure.',
  'AbortError',
)

const requireFact = (fact: boolean, message: string): void => {
  if (!fact) {
    throw new Error(message)
  }
}

const sameValue = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right)

const sameDescriptor = (
  left: PropertyDescriptor | undefined,
  right: PropertyDescriptor | undefined,
): boolean =>
  left === right ||
  (left !== undefined &&
    right !== undefined &&
    Object.is(left.value, right.value) &&
    left.get === right.get &&
    left.set === right.set &&
    left.writable === right.writable &&
    left.enumerable === right.enumerable &&
    left.configurable === right.configurable)

const expectedError = (failure: Failure): Error => {
  if (failure === 'settings-unavailable') {
    return new UserSettingsReadError('unavailable')
  }
  if (failure === 'invalid-exclude-patterns') {
    return new UserSettingsReadError('invalid')
  }
  if (failure === 'filter-evaluation') {
    return new TabFilteringError('evaluation-failed')
  }
  return persistenceFailure
}

const matchesFailure = (error: unknown, failure: Failure): boolean => {
  if (failure === 'settings-unavailable') {
    return (
      error instanceof UserSettingsReadError && error.status === 'unavailable'
    )
  }
  if (failure === 'invalid-exclude-patterns') {
    return error instanceof UserSettingsReadError && error.status === 'invalid'
  }
  if (failure === 'filter-evaluation') {
    return (
      error instanceof TabFilteringError && error.reason === 'evaluation-failed'
    )
  }
  return error === persistenceFailure
}

/** Every override is scoped to this harness and restored even on assertion failure. */
export const replaceMethod = (target: object, key: string, value: unknown) => {
  const previous = Object.getOwnPropertyDescriptor(target, key)
  Object.defineProperty(target, key, { configurable: true, value })
  return () => {
    if (previous) {
      Object.defineProperty(target, key, previous)
    } else {
      Reflect.deleteProperty(target, key)
    }
    requireFact(
      sameDescriptor(Object.getOwnPropertyDescriptor(target, key), previous),
      `Firefox capture smoke did not restore ${key}.`,
    )
  }
}

const waitForTabStatus = async (
  id: number,
  status: 'complete' | 'loading',
  readTab: typeof browser.tabs.get,
  url?: string,
): Promise<chrome.tabs.Tab> =>
  new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer)
      browser.tabs.onUpdated.removeListener(onUpdated)
    }
    const fail = (error: unknown) => {
      cleanup()
      reject(error instanceof Error ? error : new Error(String(error)))
    }
    const inspect = (tab: chrome.tabs.Tab) => {
      if (tab.status === status && (url === undefined || tab.url === url)) {
        cleanup()
        resolve(tab)
      }
    }
    const onUpdated: Parameters<
      typeof browser.tabs.onUpdated.addListener
    >[0] = (tabId, _change, tab) => {
      if (tabId === id) {
        inspect(tab)
      }
    }
    const timer = setTimeout(() => {
      fail(new Error(`Firefox capture tab ${id} did not reach ${status}.`))
    }, 5_000)
    browser.tabs.onUpdated.addListener(onUpdated)
    void readTab(id).then(inspect).catch(fail)
  })

const verifyCommittedCapture = async (
  origin: string,
  ownedIds: Set<number>,
  queryTabs: typeof browser.tabs.query,
) => {
  const readTab = browser.tabs.get.bind(browser.tabs)
  const createSource = async (url: string) => {
    const tab = await browser.tabs.create({ active: true, url })
    if (tab.id === undefined) {
      throw new Error('Firefox capture source is missing a tab ID.')
    }
    ownedIds.add(tab.id)
    await waitForTabStatus(tab.id, 'complete', readTab, url)
    return tab.id
  }
  const completedUrl = `${origin}/capture-complete`
  const completedId = await createSource(completedUrl)
  const [completed] = await handleSaveCurrentTab()
  requireFact(completed?.url === completedUrl, 'Complete tab was not saved.')
  const completedTabClosed = !(await queryTabs({})).some(
    ({ id }) => id === completedId,
  )

  const capturedUrl = `${origin}/capture-source`
  const capturedId = await createSource(capturedUrl)
  let loadingTab: chrome.tabs.Tab | undefined
  const restoreGet = replaceMethod(browser.tabs, 'get', async (id: number) => {
    if (id === capturedId && !loadingTab) {
      // Start a real navigation after persistence has returned its receipt.
      await browser.tabs.update(id, { url: `${origin}/capture-loading` })
      loadingTab = await waitForTabStatus(id, 'loading', readTab)
      return loadingTab
    }
    return readTab(id)
  })
  try {
    const [captured] = await handleSaveCurrentTab()
    requireFact(captured?.url === capturedUrl, 'Navigating tab was not saved.')
  } finally {
    restoreGet()
  }
  requireFact(
    loadingTab?.url === capturedUrl && loadingTab.pendingUrl === undefined,
    'Firefox capture did not observe the original URL while navigation was pending.',
  )
  const loadingTabPreserved = (await queryTabs({})).some(
    ({ id, status }) => id === capturedId && status === 'loading',
  )
  const { savedTabs } =
    await getBackgroundSavedTabsDataPlane().readUndoSnapshot()
  const committedUrls = new Set(savedTabs.urls.map(({ url }) => url))
  requireFact(
    committedUrls.has(completedUrl) && committedUrls.has(capturedUrl),
    'Firefox capture URLs were not committed.',
  )
  return { completedTabClosed, loadingTabPreserved }
}

/** Capture protects native Firefox state on failure and while navigating. */
export const runFirefoxCaptureSafetySmoke = async (
  captureOrigin: string,
): Promise<FirefoxCaptureSafetySmokeResult> => {
  const local = getChromeStorageLocal()
  if (!local) {
    throw new Error('Firefox Promise storage API is unavailable.')
  }
  const previous: { readonly userSettings?: unknown } = await local.get([
    'userSettings',
  ])
  const queryTabs = browser.tabs.query.bind(browser.tabs)
  const getWindows = browser.windows.getAll.bind(browser.windows)
  const nativeTabSnapshot = async () =>
    (await queryTabs({}))
      .map(({ id, url, pinned, windowId }) => ({ id, url, pinned, windowId }))
      .toSorted((left, right) => (left.id ?? 0) - (right.id ?? 0))
  const previousTabs = await nativeTabSnapshot()
  const previouslyActive = (await queryTabs({ active: true })).flatMap(
    ({ id }) => (id === undefined ? [] : [id]),
  )
  const ownedIds = new Set<number>()
  const dataPlane = getBackgroundSavedTabsDataPlane()
  const persistedBefore = await dataPlane.readUndoSnapshot()
  const restorers: (() => void)[] = []
  let directFailures = 0
  let toolbarFailures = 0
  let filterFailure = false
  let filterHits = 0
  let result: Omit<FirefoxCaptureSafetySmokeResult, 'restored'>
  const inspectTabs = (tabs: chrome.tabs.Tab[]) =>
    tabs
      .filter(({ id }) => id !== undefined && ownedIds.has(id))
      .map((tab) => {
        if (!filterFailure || tab.pinned) {
          return tab
        }
        return Object.defineProperty({ ...tab }, 'pinned', {
          get: () => {
            filterHits += 1
            throw new Error('Firefox capture smoke tab getter failure.')
          },
        })
      })
  try {
    // Inject only into capture queries. Snapshots still observe every native tab.
    restorers.push(
      replaceMethod(
        browser.tabs,
        'query',
        async (query: chrome.tabs.QueryInfo) =>
          inspectTabs(await queryTabs(query)),
      ),
      replaceMethod(
        browser.windows,
        'getAll',
        async (query: chrome.windows.QueryOptions) =>
          (await getWindows(query)).map((window) => ({
            ...window,
            tabs: inspectTabs(window.tabs ?? []),
          })),
      ),
    )
    for (const [index, suffix] of ['active', 'pinned', 'excluded'].entries()) {
      const url = `https://capture-safety.example/${suffix}`
      // eslint-disable-next-line no-await-in-loop -- Real fixture tabs are created and observed in order.
      const tab = await browser.tabs.create({
        active: index === 0,
        pinned: suffix === 'pinned',
        url,
      })
      if (tab.id === undefined) {
        throw new Error('Firefox capture fixture has no native tab ID.')
      }
      ownedIds.add(tab.id)
      // eslint-disable-next-line no-await-in-loop -- Wait for each real URL before taking invariant snapshots.
      await waitForRoute(tab.id, url)
    }
    const scenarios = failures.flatMap((failure) =>
      operations.flatMap((operation) =>
        [false, true].map((toolbar) => ({ failure, operation, toolbar })),
      ),
    )
    const runScenario = async ({
      failure,
      operation,
      toolbar,
    }: (typeof scenarios)[number]) => {
      const settings = {
        ...defaultSettings,
        clickBehavior: operation.clickBehavior,
        excludePatterns: ['capture-safety.example/excluded'],
        excludePinnedTabs: true,
      }
      const storedSettings =
        failure === 'invalid-exclude-patterns'
          ? { ...settings, excludePatterns: [false] }
          : settings
      await local.set({ userSettings: storedSettings })
      const tabsBefore = await nativeTabSnapshot()
      const restoreFailure: (() => void)[] = []
      const errors: unknown[][] = []
      const originalError = console.error
      filterHits = 0
      try {
        restoreFailure.push(
          replaceMethod(console, 'error', (...args: unknown[]) => {
            errors.push(args)
            originalError(...args)
          }),
        )
        if (failure === 'settings-unavailable') {
          restoreFailure.push(
            replaceMethod(local, 'get', async () => {
              await Promise.resolve()
              throw new Error('Firefox settings read failure.')
            }),
          )
        }
        filterFailure = failure === 'filter-evaluation'
        if (failure === 'persistence') {
          const transaction: IDBDatabase['transaction'] = Reflect.get(
            IDBDatabase.prototype,
            'transaction',
          )
          restoreFailure.push(
            replaceMethod(
              IDBDatabase.prototype,
              'transaction',
              function failingTransaction(
                this: IDBDatabase,
                ...args: Parameters<IDBDatabase['transaction']>
              ) {
                if (args[1] === 'readwrite') {
                  throw persistenceFailure
                }
                return transaction.apply(this, args)
              },
            ),
          )
        }
        if (toolbar) {
          await handleExtensionActionClick()
          requireFact(
            errors.some((args) =>
              args.includes(expectedError(failure).message),
            ),
            `${operation.clickBehavior}: toolbar did not observe ${failure}.`,
          )
          toolbarFailures += 1
        } else {
          let observed: unknown
          try {
            await operation.run()
          } catch (error) {
            observed = error
          }
          requireFact(
            matchesFailure(observed, failure),
            `${operation.clickBehavior}: capture did not reject ${failure}: ${String(observed)}`,
          )
          directFailures += 1
        }
        if (failure === 'filter-evaluation') {
          requireFact(filterHits > 0, 'Native filter fault was not reached.')
        }
      } finally {
        filterFailure = false
        for (const restore of restoreFailure.toReversed()) {
          restore()
        }
      }
      requireFact(
        sameValue(await nativeTabSnapshot(), tabsBefore),
        `${operation.clickBehavior}: ${failure} changed native tab IDs, URLs, pins or count.`,
      )
      requireFact(
        sameValue(await dataPlane.readUndoSnapshot(), persistedBefore),
        `${operation.clickBehavior}: ${failure} changed committed capture data.`,
      )
      requireFact(
        sameValue(
          (await local.get(['userSettings'])).userSettings,
          storedSettings,
        ),
        `${operation.clickBehavior}: ${failure} repaired settings during capture.`,
      )
    }
    for (const scenario of scenarios) {
      // eslint-disable-next-line no-await-in-loop -- Native fault scenarios share tabs and API boundaries.
      await runScenario(scenario)
    }
    await local.set({ userSettings: defaultSettings })
    try {
      result = {
        directFailures,
        toolbarFailures,
        fixtureTabs: ownedIds.size,
        tabsUnchanged: true,
        persistenceUnchanged: true,
        settingsUnchanged: true,
        ...(await verifyCommittedCapture(captureOrigin, ownedIds, queryTabs)),
      }
    } finally {
      await dataPlane.restoreUndoSnapshot(persistedBefore)
    }
  } finally {
    filterFailure = false
    for (const restore of restorers.toReversed()) {
      restore()
    }
    if (previous.userSettings === undefined) {
      await local.remove('userSettings')
    } else {
      await local.set({ userSettings: previous.userSettings })
    }
    const remaining = (await queryTabs({})).flatMap(({ id }) =>
      id !== undefined && ownedIds.has(id) ? [id] : [],
    )
    if (remaining.length > 0) {
      await browser.tabs.remove(remaining)
    }
    for (const id of previouslyActive) {
      // eslint-disable-next-line no-await-in-loop -- Restore the active fixture predecessor in each native window.
      await browser.tabs.update(id, { active: true })
    }
  }
  return {
    ...result,
    restored:
      sameValue(await nativeTabSnapshot(), previousTabs) &&
      sameValue(
        (await dataPlane.readUndoSnapshot()).savedTabs,
        persistedBefore.savedTabs,
      ) &&
      sameValue(
        (await local.get(['userSettings'])).userSettings,
        previous.userSettings,
      ),
  }
}
