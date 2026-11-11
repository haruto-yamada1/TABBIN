/* eslint-disable no-restricted-imports -- native Firefox exercises the production drag handlers and IndexedDB composition */
import { getBackgroundSavedTabsDataPlane } from '@/app/composition/backgroundSavedTabsDataPlane'
import {
  clearDraggedUrlInfo,
  handleUrlDragStarted,
  handleUrlDropped,
} from '@/lib/background/url-storage'
import { getChromeStorageLocal } from '@/lib/browser/chrome-storage'
import { defaultSettings } from '@/lib/storage/settings'

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
      handleUrlDragStarted(urls[0])
      const status = await handleUrlDropped(urls[0], true)
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
        handleUrlDragStarted(source)
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
      const newId = resaved.savedTabs.urls.find(
        ({ url }) => url === urls[0],
      )?.id
      const repeated = await handleUrlDropped(urls[0], true)
      const afterRepeat = await dataPlane.readUndoSnapshot()
      const duplicateDropPreservedNewId =
        repeated === 'skipped' &&
        newId !== undefined &&
        newId !== original.id &&
        same(afterRepeat.savedTabs, resaved.savedTabs)

      handleUrlDragStarted(urls[0])
      clearDraggedUrlInfo()
      const cleared = await handleUrlDropped(urls[0], true)
      const afterClear = await dataPlane.readUndoSnapshot()

      // Opening a matching native tab must not override the external-drop policy.
      await local.set({
        userSettings: {
          ...defaultSettings,
          removeTabAfterOpen: true,
          removeTabAfterExternalDrop: false,
        },
      })
      handleUrlDragStarted(urls[0])
      ownedTabs.push(await createNativeTab(urls[0]))
      const disabledDrop = await handleUrlDropped(urls[0], true)
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
