/* eslint-disable no-restricted-imports -- native Firefox regression exercises the production capture and persistence boundaries */
import { getBackgroundSavedTabsDataPlane } from '@/app/composition/backgroundSavedTabsDataPlane'
import {
  handleExtensionActionClick,
  handleSaveAllWindowsTabs,
  handleSaveCurrentTab,
  handleSaveSameDomainTabs,
  handleSaveWindowTabs,
} from '@/lib/background/extension-actions'
import { TabFilteringError } from '@/lib/background/utils'
import { getChromeStorageLocal } from '@/lib/browser/chrome-storage'
import { defaultSettings, UserSettingsReadError } from '@/lib/storage/settings'

import { waitForRoute } from './firefox-saved-tabs-page-harness'

export type FirefoxCaptureSafetySmokeResult = {
  readonly directFailures: number
  readonly toolbarFailures: number
  readonly fixtureTabs: number
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

const nativeTabSnapshot = async () =>
  (await browser.tabs.query({}))
    .map(({ id, url, pinned, windowId }) => ({ id, url, pinned, windowId }))
    .toSorted((left, right) => (left.id ?? 0) - (right.id ?? 0))

/** Every override is scoped to this harness and restored even on assertion failure. */
const replaceMethod = (target: object, key: string, value: unknown) => {
  const previous = Object.getOwnPropertyDescriptor(target, key)
  Object.defineProperty(target, key, { configurable: true, value })
  return () => {
    if (previous) {
      Object.defineProperty(target, key, previous)
    } else {
      Reflect.deleteProperty(target, key)
    }
    requireFact(
      sameValue(Object.getOwnPropertyDescriptor(target, key), previous),
      `Firefox capture smoke did not restore ${key}.`,
    )
  }
}

/** Failed capture must preserve real Firefox native tabs and committed data. */
export const runFirefoxCaptureSafetySmoke =
  async (): Promise<FirefoxCaptureSafetySmokeResult> => {
    const local = getChromeStorageLocal()
    if (!local) {
      throw new Error('Firefox Promise storage API is unavailable.')
    }
    const previous: { readonly userSettings?: unknown } = await local.get([
      'userSettings',
    ])
    const previousTabs = await nativeTabSnapshot()
    const previouslyActive = (
      await browser.tabs.query({ active: true })
    ).flatMap(({ id }) => (id === undefined ? [] : [id]))
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
      // Production handlers use Promise APIs. Delegate to Firefox's native
      // Promise namespace; only returned fixture tab copies carry injected faults.
      restorers.push(
        replaceMethod(
          chrome.tabs,
          'query',
          async (query: chrome.tabs.QueryInfo) =>
            inspectTabs(await browser.tabs.query(query)),
        ),
        replaceMethod(
          chrome.windows,
          'getAll',
          async (query: chrome.windows.QueryOptions) =>
            (await browser.windows.getAll(query)).map((window) => ({
              ...window,
              tabs: inspectTabs(window.tabs ?? []),
            })),
        ),
      )
      for (const [index, suffix] of [
        'active',
        'pinned',
        'excluded',
      ].entries()) {
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
      result = {
        directFailures,
        toolbarFailures,
        fixtureTabs: ownedIds.size,
        tabsUnchanged: true,
        persistenceUnchanged: true,
        settingsUnchanged: true,
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
      const remaining = (await browser.tabs.query({})).flatMap(({ id }) =>
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
          (await local.get(['userSettings'])).userSettings,
          previous.userSettings,
        ),
    }
  }
