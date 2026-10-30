import { describe, expect, it, vi } from 'vitest'

import { checkPersistenceIntegrity } from '@/contexts/saved-tabs/public-api'

import { createPracticeComposition } from './createPracticeComposition'

describe('Academy practice composition', () => {
  it('starts with deterministic fictional parent, child, Domain and Custom data', () => {
    const practice = createPracticeComposition()
    const state = practice.getSnapshot()
    expect(state.groups).toHaveLength(2)
    expect(state.collections).toHaveLength(4)
    expect(state.urls).toHaveLength(6)
    expect(state.categories.length).toBeGreaterThan(1)
  })
})

it('isolates native APIs and independent practice sessions for normal use-case operations', async () => {
  const forbidden = new Proxy(
    {},
    {
      get: () => {
        throw new Error('Production API called')
      },
    },
  )
  vi.stubGlobal('chrome', forbidden)
  vi.stubGlobal('indexedDB', forbidden)
  try {
    const practice = createPracticeComposition()
    const other = createPracticeComposition()
    const pristine = other.getSnapshot()
    const created = await practice.useCases.createParentCategory({
      name: 'Practice only',
    })
    expect(created.category.name).toBe('Practice only')
    await practice.useCases.setCategoryKeywords({
      tabGroupId: 'practice-domain-0',
      categoryName: 'New child',
      keywords: ['guide'],
    })
    const page = await practice.useCases.getSavedTabsPageData()
    await practice.useCases.moveDomainBetweenCategories({
      domainId: 'practice-domain-0',
      fromCategoryId: 'practice-parent-0',
      tabGroups: page.tabGroups,
      toCategoryId: 'practice-parent-1',
    })
    expect(
      practice
        .getSnapshot()
        .collections.find(({ id }) => id === 'practice-domain-0')?.groupId,
    ).toBe('practice-parent-1')
    expect(
      practice
        .getSnapshot()
        .categories.some(({ name }) => name === 'New child'),
    ).toBe(true)
    await practice.useCases.deleteSavedUrl({
      tabGroupId: 'practice-domain-1',
      url: 'https://market.academy.test/guide',
    })
    expect(practice.getSnapshot().urls).toHaveLength(5)
    expect(other.getSnapshot()).toEqual(pristine)
    expect(checkPersistenceIntegrity(practice.getSnapshot()).isHealthy).toBe(
      true,
    )
  } finally {
    vi.unstubAllGlobals()
  }
})

it('uses the production restore and deletion policy with simulated browser tabs', async () => {
  const practice = createPracticeComposition()
  const result = await practice.useCases.openSavedUrl({
    origin: 'click',
    urlRecordId: 'practice-url-1-0',
    settings: { removeTabAfterOpen: true, removeTabAfterExternalDrop: false },
  })
  expect(practice.getBrowserActions()).toEqual([
    { type: 'open', urls: ['https://market.academy.test/guide'] },
  ])
  expect(practice.getSnapshot().urls).toHaveLength(5)
  expect(result.snapshot).not.toBeNull()
  await practice.useCases.restoreOpenedUrlsSnapshot({
    snapshot: result.snapshot ?? {},
  })
  expect(practice.getSnapshot().urls).toHaveLength(6)
})

it('serializes simultaneous mutations and preserves state when an operation fails', async () => {
  const practice = createPracticeComposition()
  await Promise.all([
    practice.useCases.createParentCategory({ name: 'One' }),
    practice.useCases.createParentCategory({ name: 'Two' }),
  ])
  expect(practice.getSnapshot().groups).toHaveLength(4)
  const before = practice.getSnapshot()
  await expect(
    practice.useCases.createParentCategory({ name: 'one' }),
  ).rejects.toThrow('DUPLICATE_CATEGORY_NAME')
  expect(practice.getSnapshot()).toEqual(before)
  await practice.useCases.createParentCategory({ name: 'Three' })
  expect(practice.getSnapshot().groups).toHaveLength(5)
})

it('provides deterministic empty, reset and disposal without reviving queued work', async () => {
  const practice = createPracticeComposition()
  const saved = practice.getSnapshot()
  expect(saved.urls).toHaveLength(6)
  const pending = practice.useCases.createParentCategory({
    name: 'Late update',
  })
  await Promise.all([
    expect(pending).rejects.toThrow('session has ended'),
    practice.resetPracticeSession('lesson', 'step', 'saved'),
  ])
  expect(practice.getSnapshot()).toEqual(saved)
  expect(practice.getBrowserActions()).toEqual([])
  await practice.resetPracticeSession('lesson', 'next-step', 'empty')
  expect(practice.getSnapshot().urls).toHaveLength(0)
  const finalOperation = practice.useCases.createParentCategory({
    name: 'Too late',
  })
  practice.dispose()
  await expect(finalOperation).rejects.toThrow('session has ended')
  await expect(practice.useCases.getSavedTabsPageData()).rejects.toThrow(
    'session has ended',
  )
  await expect(practice.resetPracticeSession()).rejects.toThrow(
    'session has ended',
  )
  expect(practice.getSnapshot().urls).toHaveLength(0)
})

it('notifies committed changes without creating read-refresh loops and returns detached snapshots', async () => {
  const practice = createPracticeComposition()
  const listener = vi.fn()
  const storageListener = vi.fn()
  const stop = practice.subscribe(listener)
  const stopStorage = practice.deps.storageChangePort.subscribe(storageListener)
  await practice.useCases.getSavedTabsPageData()
  expect(listener).not.toHaveBeenCalled()
  expect(storageListener).not.toHaveBeenCalled()
  await practice.useCases.createParentCategory({ name: 'Notify' })
  expect(listener).toHaveBeenCalledTimes(1)
  expect(storageListener).toHaveBeenCalledTimes(1)
  const detached = practice.getSnapshot()
  Reflect.set(detached.urls[0] ?? {}, 'title', 'Changed outside repository')
  expect(practice.getSnapshot().urls[0]?.title).toBe('notes guide')
  stop()
  stopStorage()
  await practice.useCases.createParentCategory({ name: 'After unsubscribe' })
  expect(listener).toHaveBeenCalledTimes(1)
})

it('keeps search, sort and browser ports local and discards their state on reset', async () => {
  const practice = createPracticeComposition()
  const history = practice.deps.searchHistoryPort
  const sort = practice.deps.sortPreferencesPort
  expect(await history?.record('practice')).toEqual(['practice'])
  await sort?.write('domain', 'practice-domain-0', 'desc')
  expect(await sort?.read('domain', 'practice-domain-0')).toBe('desc')
  await practice.deps.browserTabPort.open({
    url: 'https://notes.academy.test/guide',
  })
  expect(practice.getBrowserActions()).toHaveLength(1)
  await practice.resetPracticeSession()
  expect(await history?.read()).toEqual([])
  expect(await sort?.read('domain', 'practice-domain-0')).toBe('default')
  expect(practice.getBrowserActions()).toHaveLength(0)
})

it('keeps injected use-case identities stable through updates and reset', async () => {
  const practice = createPracticeComposition()
  const read = practice.useCases.getSavedTabsPageData
  expect(practice.useCases.getSavedTabsPageData).toBe(read)
  await practice.useCases.createParentCategory({ name: 'Practice only' })
  expect(practice.useCases.getSavedTabsPageData).toBe(read)
  await practice.resetPracticeSession()
  expect(practice.useCases.getSavedTabsPageData).toBe(read)
  expect((await read()).parentCategories).toHaveLength(2)
})

it('updates the same storage subscribers when resetting to empty and saved data', async () => {
  const practice = createPracticeComposition()
  let visibleParents = (
    await practice.useCases.getSavedTabsPageData()
  ).parentCategories.map(({ name }) => name)
  let visibleDomainCount = (await practice.useCases.getSavedTabs()).length
  const stop = practice.deps.storageChangePort.subscribe((changes) => {
    for (const change of changes) {
      if (change.kind === 'parsed' && change.key === 'parentCategories') {
        visibleParents = change.payload.map(({ name }) => name)
      }
      if (change.kind === 'parsed' && change.key === 'savedTabs') {
        visibleDomainCount = change.payload.length
      }
    }
  })
  await practice.resetPracticeSession('parent-categories', 'step', 'empty')
  expect(visibleParents).toEqual([])
  expect(visibleDomainCount).toBe(0)
  await practice.resetPracticeSession('parent-categories', 'step', 'saved')
  expect(visibleParents).toEqual(['Demo workspace', 'Demo learning'])
  expect(visibleDomainCount).toBe(3)
  stop()
})

it('rejects reset delivery after disposal or supersession without publishing stale data', async () => {
  const practice = createPracticeComposition()
  const storageListener = vi.fn()
  practice.deps.storageChangePort.subscribe(storageListener)
  const first = practice.resetPracticeSession('parent', 'first', 'empty')
  await Promise.all([
    expect(first).rejects.toThrow('session has ended'),
    practice.resetPracticeSession('parent', 'second', 'saved'),
  ])
  expect(storageListener).toHaveBeenCalledTimes(1)
  storageListener.mockClear()
  const finalReset = practice.resetPracticeSession('parent', 'last', 'empty')
  practice.dispose()
  await expect(finalReset).rejects.toThrow('session has ended')
  expect(storageListener).not.toHaveBeenCalled()
})

it('reports reset subscriber errors to the caller', async () => {
  const practice = createPracticeComposition()
  const failure = new Error('Practice view rejected the update')
  practice.deps.storageChangePort.subscribe(() => {
    throw failure
  })
  await expect(practice.resetPracticeSession()).rejects.toBe(failure)
})

it('resets subscribed sort and search views along with the repository', async () => {
  const practice = createPracticeComposition()
  const sortListener = vi.fn()
  const historyListener = vi.fn()
  const sort = practice.deps.sortPreferencesPort
  const history = practice.deps.searchHistoryPort
  await sort?.write('domain', 'practice-domain-0', 'desc')
  await history?.record('sample query')
  sort?.subscribe('domain', 'practice-domain-0', sortListener)
  history?.subscribe(historyListener)
  await practice.resetPracticeSession()
  expect(sortListener).toHaveBeenCalledExactlyOnceWith('default')
  expect(historyListener).toHaveBeenCalledExactlyOnceWith(['sample query'])
  expect(await sort?.read('domain', 'practice-domain-0')).toBe('default')
  expect(await history?.read()).toEqual([])
})

it('delivers reset before queued mutations and lets subscribers reread without deadlock', async () => {
  const practice = createPracticeComposition()
  const views: string[][] = []
  const rereads: ReturnType<typeof practice.useCases.getSavedTabsPageData>[] =
    []
  practice.deps.storageChangePort.subscribe((changes) => {
    for (const change of changes) {
      if (change.kind === 'parsed' && change.key === 'parentCategories') {
        views.push(change.payload.map(({ name }) => name))
      }
    }
    rereads.push(practice.useCases.getSavedTabsPageData())
  })
  const reset = practice.resetPracticeSession('parent', 'step', 'empty')
  const mutation = practice.useCases.createParentCategory({
    name: 'After reset',
  })
  await Promise.all([reset, mutation])
  expect(views).toEqual([[], ['After reset']])
  const refreshed = await Promise.all(rereads)
  expect(
    refreshed.every(
      ({ parentCategories }) => parentCategories[0]?.name === 'After reset',
    ),
  ).toBe(true)
})
