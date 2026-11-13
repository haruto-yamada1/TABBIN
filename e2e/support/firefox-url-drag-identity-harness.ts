/* eslint-disable no-restricted-imports -- native Firefox exercises the production drag handlers and IndexedDB composition */
import { browser } from 'wxt/browser'

import { getBackgroundSavedTabsDataPlane } from '@/app/composition/backgroundSavedTabsDataPlane'
import {
  clearDraggedUrlInfo,
  handleUrlDragStarted,
  handleUrlDropped,
} from '@/lib/background/url-storage'
import { getChromeStorageLocal } from '@/lib/browser/chrome-storage'
import { defaultSettings } from '@/lib/storage/settings'
import type { BackgroundMessage } from '@/types/background'

const urls = [
  'https://example.com',
  'https://example.com/',
  'https://EXAMPLE.com',
  'https://example.com/#/drag-saved',
  'https://example.com/?drag=query',
  'https://example.com/%64rag',
] as const

export type FirefoxUrlDragIdentitySmokeResult = {
  readonly savedOriginalUrls: boolean
  readonly exactIdRemoved: boolean
  readonly lookalikesPreserved: boolean
  readonly membershipsPreserved: boolean
  readonly hashMismatchPreserved: boolean
  readonly queryMismatchPreserved: boolean
  readonly externalDropDisabledPreserved: boolean
  readonly duplicateDropPreservedNewId: boolean
  readonly clearedDragPreserved: boolean
  readonly restored: boolean
}

const same = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right)

const requireSavedUrlId = (
  records: readonly { readonly id: string; readonly url: string }[],
  rawUrl: string,
): string => {
  const id = records.find(({ url }) => url === rawUrl)?.id
  if (!id) {
    throw new Error('Firefox saved drag URL ID is missing.')
  }
  return id
}

const createNativeTab = async (url: string): Promise<number> => {
  const tab = await browser.tabs.create({ active: false, url })
  if (tab.id === undefined) {
    throw new Error('Firefox did not return the created tab ID.')
  }
  return tab.id
}

/** No mocks: preserve surrounding data and settings even if an assertion fails. */
export const runFirefoxUrlDragIdentitySmoke =
  async (): Promise<FirefoxUrlDragIdentitySmokeResult> => {
    const local = getChromeStorageLocal()
    if (!local) {
      throw new Error('Firefox Promise storage API is unavailable.')
    }
    const dataPlane = getBackgroundSavedTabsDataPlane()
    const before = await dataPlane.readUndoSnapshot()
    const previous: { readonly userSettings?: unknown } = await local.get([
      'userSettings',
    ])
    const ownedTabs: number[] = []
    let result: Omit<FirefoxUrlDragIdentitySmokeResult, 'restored'>
    try {
      await local.set({
        userSettings: {
          ...defaultSettings,
          removeTabAfterOpen: true,
          removeTabAfterExternalDrop: true,
        },
      })
      await dataPlane.saveTabs(urls.map((url) => ({ title: url, url })))
      const saved = await dataPlane.readUndoSnapshot()
      const original = saved.savedTabs.urls.find(({ url }) => url === urls[0])
      if (!original) {
        throw new Error('Firefox save did not retain the original URL.')
      }
      const dragId = crypto.randomUUID()
      handleUrlDragStarted(urls[0], original.id, undefined, dragId)
      const status = await handleUrlDropped(urls[0], true, {
        urlRecordId: original.id,
        dragId,
      })
      const removed = await dataPlane.readUndoSnapshot()
      const expectedUrls = saved.savedTabs.urls.filter(
        ({ id }) => id !== original.id,
      )
      const expectedMemberships = saved.savedTabs.memberships.filter(
        ({ urlId }) => urlId !== original.id,
      )
      const savedOriginalUrls = urls.every((raw) =>
        saved.savedTabs.urls.some(({ url }) => url === raw),
      )
      const exactIdRemoved =
        status === 'removed' &&
        !removed.savedTabs.urls.some(({ id }) => id === original.id)
      const lookalikesPreserved = same(removed.savedTabs.urls, expectedUrls)
      const membershipsPreserved =
        same(removed.savedTabs.memberships, expectedMemberships) &&
        same(removed.savedTabs.categories, saved.savedTabs.categories) &&
        same(removed.savedTabs.collections, saved.savedTabs.collections)

      const checkMismatchedTab = async (source: string, opened: string) => {
        const snapshot = await dataPlane.readUndoSnapshot()
        const sourceId = snapshot.savedTabs.urls.find(
          ({ url }) => url === source,
        )?.id
        if (!sourceId) {
          throw new Error('Firefox drag source ID is missing.')
        }
        handleUrlDragStarted(source, sourceId, undefined, crypto.randomUUID())
        ownedTabs.push(await createNativeTab(opened))
        const after = await dataPlane.readUndoSnapshot()
        clearDraggedUrlInfo()
        return same(after.savedTabs, snapshot.savedTabs)
      }
      const hashMismatchPreserved = await checkMismatchedTab(
        urls[3],
        'https://example.com/#/drag-other',
      )
      const queryMismatchPreserved = await checkMismatchedTab(
        urls[4],
        'https://example.com/?drag=other',
      )

      await dataPlane.saveTabs([{ title: 'Re-saved raw URL', url: urls[0] }])
      const resaved = await dataPlane.readUndoSnapshot()
      const newId = requireSavedUrlId(resaved.savedTabs.urls, urls[0])
      const repeated = await handleUrlDropped(urls[0], true, {
        urlRecordId: original.id,
        dragId,
      })
      const afterRepeat = await dataPlane.readUndoSnapshot()
      const duplicateDropPreservedNewId =
        repeated === 'skipped' &&
        newId !== original.id &&
        same(afterRepeat.savedTabs, resaved.savedTabs)

      const clearedDragId = crypto.randomUUID()
      handleUrlDragStarted(urls[0], newId, undefined, clearedDragId)
      clearDraggedUrlInfo()
      const cleared = await handleUrlDropped(urls[0], true, {
        urlRecordId: newId,
        dragId: clearedDragId,
      })
      const afterClear = await dataPlane.readUndoSnapshot()

      // Opening a matching native tab must not override the external-drop policy.
      await local.set({
        userSettings: {
          ...defaultSettings,
          removeTabAfterOpen: true,
          removeTabAfterExternalDrop: false,
        },
      })
      const disabledDragId = crypto.randomUUID()
      handleUrlDragStarted(urls[0], newId, undefined, disabledDragId)
      ownedTabs.push(await createNativeTab(urls[0]))
      const disabledDrop = await handleUrlDropped(urls[0], true, {
        urlRecordId: newId,
        dragId: disabledDragId,
      })
      const afterDisabledDrop = await dataPlane.readUndoSnapshot()
      result = {
        savedOriginalUrls,
        exactIdRemoved,
        lookalikesPreserved,
        membershipsPreserved,
        hashMismatchPreserved,
        queryMismatchPreserved,
        externalDropDisabledPreserved:
          disabledDrop === 'skipped' &&
          same(afterDisabledDrop.savedTabs, resaved.savedTabs),
        duplicateDropPreservedNewId,
        clearedDragPreserved:
          cleared === 'skipped' &&
          same(afterClear.savedTabs, resaved.savedTabs),
      }
    } finally {
      clearDraggedUrlInfo()
      if (ownedTabs.length > 0) {
        await browser.tabs.remove(ownedTabs)
      }
      await dataPlane.restoreUndoSnapshot(before)
      if (previous.userSettings === undefined) {
        await local.remove('userSettings')
      } else {
        await local.set({ userSettings: previous.userSettings })
      }
    }
    return {
      ...result,
      restored:
        same(
          (await dataPlane.readUndoSnapshot()).savedTabs,
          before.savedTabs,
        ) &&
        same(
          (await local.get(['userSettings'])).userSettings,
          previous.userSettings,
        ),
    }
  }

export type FirefoxUrlDragBackgroundSmokeResult = {
  readonly backgroundMessagesHandled: boolean
  readonly matchingNativeTabPreserved: boolean
  readonly hashMismatchPreserved: boolean
  readonly queryMismatchPreserved: boolean
  readonly exactIdRemoved: boolean
  readonly lookalikesPreserved: boolean
  readonly externalDropDisabledPreserved: boolean
  readonly restored: boolean
}

const readMessageStatus = (response: unknown): string | undefined =>
  typeof response === 'object' &&
  response !== null &&
  'status' in response &&
  typeof response.status === 'string'
    ? response.status
    : undefined

const sendDragMessage = async (message: BackgroundMessage) =>
  readMessageStatus(await browser.runtime.sendMessage(message))

const waitForNativeTab = async (id: number, url: string): Promise<void> => {
  const expectedUrl = new URL(url).href
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop -- Observe the actual native tab commit before checking IndexedDB side effects.
    const tab = await browser.tabs.get(id)
    if (tab.status === 'complete' && tab.url === expectedUrl) {
      return
    }
    // eslint-disable-next-line no-await-in-loop -- Yield between state polls instead of assuming a fixed load duration.
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error('Firefox drag target did not finish navigation.')
}

/** Run from a trusted top-level app page with the production background enabled. */
export const runFirefoxUrlDragBackgroundSmoke =
  async (): Promise<FirefoxUrlDragBackgroundSmokeResult> => {
    const local = getChromeStorageLocal()
    if (!local) {
      throw new Error('Firefox Promise storage API is unavailable.')
    }
    const dataPlane = getBackgroundSavedTabsDataPlane()
    const before = await dataPlane.readUndoSnapshot()
    const previous: { readonly userSettings?: unknown } = await local.get([
      'userSettings',
    ])
    const ownedTabs: number[] = []
    let result: Omit<FirefoxUrlDragBackgroundSmokeResult, 'restored'>
    try {
      await local.set({
        userSettings: {
          ...defaultSettings,
          removeTabAfterOpen: true,
          removeTabAfterExternalDrop: true,
        },
      })
      await dataPlane.saveTabs(urls.map((url) => ({ title: url, url })))
      const saved = await dataPlane.readUndoSnapshot()
      const original = saved.savedTabs.urls.find(({ url }) => url === urls[0])
      if (!original) {
        throw new Error('Firefox background drag source ID is missing.')
      }
      const dragId = crypto.randomUUID()
      const started = await sendDragMessage({
        action: 'urlDragStarted',
        url: urls[0],
        urlRecordId: original.id,
        dragId,
      })
      const matchingTab = await createNativeTab(urls[0])
      ownedTabs.push(matchingTab)
      await waitForNativeTab(matchingTab, urls[0])
      const afterMatching = await dataPlane.readUndoSnapshot()
      const removedStatus = await sendDragMessage({
        action: 'urlDropped',
        fromExternal: true,
        url: urls[0],
        urlRecordId: original.id,
        dragId,
      })
      const removed = await dataPlane.readUndoSnapshot()

      const checkMismatchedTab = async (source: string, opened: string) => {
        const snapshot = await dataPlane.readUndoSnapshot()
        const id = snapshot.savedTabs.urls.find(({ url }) => url === source)?.id
        if (!id) {
          throw new Error('Firefox background mismatch source ID is missing.')
        }
        const token = crypto.randomUUID()
        const status = await sendDragMessage({
          action: 'urlDragStarted',
          url: source,
          urlRecordId: id,
          dragId: token,
        })
        if (status !== 'ok') {
          throw new Error(
            'Firefox production background did not accept the drag.',
          )
        }
        const tabId = await createNativeTab(opened)
        ownedTabs.push(tabId)
        await waitForNativeTab(tabId, opened)
        const after = await dataPlane.readUndoSnapshot()
        await sendDragMessage({
          action: 'urlDropped',
          fromExternal: false,
          url: source,
          urlRecordId: id,
          dragId: token,
        })
        return same(after.savedTabs, snapshot.savedTabs)
      }
      const hashMismatchPreserved = await checkMismatchedTab(
        urls[3],
        'https://example.com/#/drag-other',
      )
      const queryMismatchPreserved = await checkMismatchedTab(
        urls[4],
        'https://example.com/?drag=other',
      )

      await local.set({
        userSettings: {
          ...defaultSettings,
          removeTabAfterOpen: true,
          removeTabAfterExternalDrop: false,
        },
      })
      const disabledId = removed.savedTabs.urls.find(
        ({ url }) => url === urls[1],
      )?.id
      if (!disabledId) {
        throw new Error('Firefox disabled-drop source ID is missing.')
      }
      const disabledDragId = crypto.randomUUID()
      await sendDragMessage({
        action: 'urlDragStarted',
        url: urls[1],
        urlRecordId: disabledId,
        dragId: disabledDragId,
      })
      const disabledTab = await createNativeTab(urls[1])
      ownedTabs.push(disabledTab)
      await waitForNativeTab(disabledTab, urls[1])
      const disabledDrop = await sendDragMessage({
        action: 'urlDropped',
        fromExternal: true,
        url: urls[1],
        urlRecordId: disabledId,
        dragId: disabledDragId,
      })
      const afterDisabled = await dataPlane.readUndoSnapshot()
      result = {
        backgroundMessagesHandled:
          started === 'ok' && removedStatus === 'removed',
        matchingNativeTabPreserved: same(
          afterMatching.savedTabs,
          saved.savedTabs,
        ),
        hashMismatchPreserved,
        queryMismatchPreserved,
        exactIdRemoved: !removed.savedTabs.urls.some(
          ({ id }) => id === original.id,
        ),
        lookalikesPreserved:
          same(
            removed.savedTabs.urls,
            saved.savedTabs.urls.filter(({ id }) => id !== original.id),
          ) &&
          same(
            removed.savedTabs.memberships,
            saved.savedTabs.memberships.filter(
              ({ urlId }) => urlId !== original.id,
            ),
          ) &&
          same(removed.savedTabs.categories, saved.savedTabs.categories),
        externalDropDisabledPreserved:
          disabledDrop === 'skipped' &&
          same(afterDisabled.savedTabs, removed.savedTabs),
      }
    } finally {
      if (ownedTabs.length > 0) {
        await browser.tabs.remove(ownedTabs)
      }
      await dataPlane.restoreUndoSnapshot(before)
      if (previous.userSettings === undefined) {
        await local.remove('userSettings')
      } else {
        await local.set({ userSettings: previous.userSettings })
      }
    }
    return {
      ...result,
      restored:
        same(
          (await dataPlane.readUndoSnapshot()).savedTabs,
          before.savedTabs,
        ) &&
        same(
          (await local.get(['userSettings'])).userSettings,
          previous.userSettings,
        ),
    }
  }
