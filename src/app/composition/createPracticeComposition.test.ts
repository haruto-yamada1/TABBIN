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

it('provides deterministic empty, save, reset and disposal without reviving queued work', async () => {
  const practice = createPracticeComposition('empty')
  expect(practice.getSnapshot().urls).toHaveLength(0)
  await practice.saveDemoTabs()
  const saved = practice.getSnapshot()
  expect(saved.urls).toHaveLength(6)
  expect(practice.getBrowserActions()[0]?.type).toBe('close')
  const pending = practice.useCases.createParentCategory({
    name: 'Late update',
  })
  practice.resetPracticeSession('lesson', 'step', 'saved')
  await expect(pending).rejects.toThrow('session has ended')
  expect(practice.getSnapshot()).toEqual(saved)
  expect(practice.getBrowserActions()).toEqual([])
  practice.resetPracticeSession('lesson', 'next-step', 'empty')
  expect(practice.getSnapshot().urls).toHaveLength(0)
  const finalOperation = practice.useCases.createParentCategory({
    name: 'Too late',
  })
  practice.dispose()
  await expect(finalOperation).rejects.toThrow('session has ended')
  await expect(practice.useCases.getSavedTabsPageData()).rejects.toThrow(
    'session has ended',
  )
  expect(() => practice.resetPracticeSession()).toThrow('session has ended')
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
  practice.resetPracticeSession()
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
  practice.resetPracticeSession()
  expect(practice.useCases.getSavedTabsPageData).toBe(read)
  expect((await read()).parentCategories).toHaveLength(2)
})
