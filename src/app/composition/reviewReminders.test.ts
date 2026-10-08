import { beforeEach, describe, expect, it, vi } from 'vitest'

import { defaultReviewReminderSettings } from '@/features/review-reminders/lib/reviewReminderSettings'

import {
  buildReviewReminderUrl,
  getReviewCandidates,
  getReviewCategories,
} from './reviewReminders'

const mocks = vi.hoisted(() => ({ ready: vi.fn(), readUndoSnapshot: vi.fn() }))
vi.mock('@/app/composition/persistenceBootstrap', () => ({
  getPersistenceBootstrapRuntime: () => ({ bootstrap: { ready: mocks.ready } }),
}))
vi.mock('@/app/composition/backgroundSavedTabsDataPlane', () => ({
  getBackgroundSavedTabsDataPlane: () => ({
    readUndoSnapshot: mocks.readUndoSnapshot,
  }),
}))
vi.mock('@/lib/browser/runtime', () => ({
  getExtensionUrl: () => 'chrome-extension://extension-id/app.html',
}))

describe('review reminder composition', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.ready.mockResolvedValue(undefined)
    mocks.readUndoSnapshot.mockResolvedValue({
      savedTabs: {
        collections: [{ id: 'project', name: 'Reading' }],
        categories: [
          { id: 'category / # ?', name: 'Docs', collectionId: 'project' },
        ],
        memberships: [
          {
            urlId: 'url',
            collectionId: 'project',
            categoryId: 'category / # ?',
          },
        ],
        urls: [
          {
            id: 'url',
            url: 'https://example.com/',
            title: 'Project-only URL',
            firstSavedAt: 100,
            firstSavedAtProvenance: 'exact',
          },
        ],
      },
    })
  })

  it('reads project-only candidates and categories from the canonical gated snapshot', async () => {
    await expect(
      getReviewCandidates(
        {
          ...defaultReviewReminderSettings,
          target: 'category',
          categoryId: 'category / # ?',
        },
        1000,
      ),
    ).resolves.toMatchObject([{ id: 'url', title: 'Project-only URL' }])
    await expect(getReviewCategories()).resolves.toEqual([
      { id: 'category / # ?', name: 'Reading / Docs' },
    ])
    expect(mocks.ready).toHaveBeenCalledTimes(2)
  })

  it('blocks candidate reads when persistence readiness fails', async () => {
    mocks.ready.mockRejectedValue(new Error('integrity unavailable'))
    await expect(
      getReviewCandidates(defaultReviewReminderSettings, 1000),
    ).rejects.toThrow('integrity unavailable')
    expect(mocks.readUndoSnapshot).not.toHaveBeenCalled()
  })

  it('encodes only notified criteria and reference time in a fixed extension route', () => {
    const url = new URL(
      buildReviewReminderUrl(
        {
          ...defaultReviewReminderSettings,
          target: 'category',
          categoryId: 'category / # ?',
        },
        1000,
      ),
    )
    expect(url.origin).toBe('null')
    expect(url.protocol).toBe('chrome-extension:')
    expect(url.hostname).toBe('extension-id')
    expect(url.hash.startsWith('#/saved-tabs?')).toBe(true)
    const params = new URLSearchParams(url.hash.split('?').slice(1).join('?'))
    expect(params.get('categoryId')).toBe('category / # ?')
    expect(params.get('reviewAt')).toBe('1000')
    expect(params.has('url')).toBe(false)
  })
})
