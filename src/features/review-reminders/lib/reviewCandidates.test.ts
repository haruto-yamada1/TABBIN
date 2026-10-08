import { describe, expect, it } from 'vitest'

import type { ReviewCandidateSnapshot } from './reviewCandidates'
import { selectReviewCandidates } from './reviewCandidates'
import { defaultReviewReminderSettings } from './reviewReminderSettings'

const now = new Date(2026, 9, 8, 12).getTime()
const day = 24 * 60 * 60 * 1000
const url = (
  id: string,
  firstSavedAt = now - 31 * day,
  firstSavedAtProvenance: 'exact' | 'legacy-fallback' | null = 'exact',
): ReviewCandidateSnapshot['urls'][number] => ({
  firstSavedAt,
  ...(firstSavedAtProvenance !== null ? { firstSavedAtProvenance } : {}),
  id,
  title: id,
  url: `https://${id}.example/`,
})

const snapshot: ReviewCandidateSnapshot = {
  urls: [
    url('domain-category'),
    url('project-category'),
    url('unclassified'),
    url('new', now - 2 * day),
    url('legacy', now - 100 * day, 'legacy-fallback'),
    url('missing-provenance', now - 100 * day, null),
  ],
  categories: [
    { id: 'domain-reading', collectionId: 'domain' },
    { id: 'project-reading', collectionId: 'project' },
  ],
  memberships: [
    {
      collectionId: 'domain',
      categoryId: 'domain-reading',
      urlId: 'domain-category',
    },
    { collectionId: 'domain', urlId: 'project-category' },
    {
      collectionId: 'project',
      categoryId: 'project-reading',
      urlId: 'project-category',
    },
    { collectionId: 'project', urlId: 'unclassified' },
    { collectionId: 'domain', urlId: 'new' },
    { collectionId: 'domain', urlId: 'legacy' },
    { collectionId: 'domain', urlId: 'missing-provenance' },
  ],
}

describe('review candidates', () => {
  it('returns each canonical URL once, including custom-only saves', () => {
    const selected = selectReviewCandidates(
      snapshot,
      defaultReviewReminderSettings,
      now,
    )
    expect(selected.map(({ id }) => id)).toEqual(
      snapshot.urls.map(({ id }) => id),
    )
    expect(selected[0]).toEqual({
      id: 'domain-category',
      title: 'domain-category',
      url: 'https://domain-category.example/',
      firstSavedAt: now - 31 * day,
    })
    expect(selected.find(({ id }) => id === 'legacy')).not.toHaveProperty(
      'firstSavedAt',
    )
    expect(
      selected.find(({ id }) => id === 'missing-provenance'),
    ).not.toHaveProperty('firstSavedAt')
  })

  it('considers project categories when selecting uncategorized URLs', () => {
    expect(
      selectReviewCandidates(
        snapshot,
        { ...defaultReviewReminderSettings, target: 'uncategorized' },
        now,
      ).map(({ id }) => id),
    ).toEqual(['unclassified', 'new', 'legacy', 'missing-provenance'])
  })

  it('matches stable category IDs instead of names or a project itself', () => {
    expect(
      selectReviewCandidates(
        snapshot,
        {
          ...defaultReviewReminderSettings,
          target: 'category',
          categoryId: 'project-reading',
        },
        now,
      ).map(({ id }) => id),
    ).toEqual(['project-category'])
    expect(
      selectReviewCandidates(
        snapshot,
        { ...defaultReviewReminderSettings, target: 'category' },
        now,
      ),
    ).toEqual([])
  })

  it('requires exact first-save times for older candidates, with an inclusive boundary', () => {
    const dated: ReviewCandidateSnapshot = {
      ...snapshot,
      urls: [...snapshot.urls, url('boundary', now - 30 * day)],
    }
    expect(
      selectReviewCandidates(
        dated,
        {
          ...defaultReviewReminderSettings,
          target: 'older',
          olderThanDays: 30,
        },
        now,
      ).map(({ id }) => id),
    ).toEqual([
      'domain-category',
      'project-category',
      'unclassified',
      'boundary',
    ])
  })

  it('does not treat a category from a different collection as real classification', () => {
    const mismatched: ReviewCandidateSnapshot = {
      urls: [url('mismatch')],
      categories: snapshot.categories,
      memberships: [
        {
          collectionId: 'domain',
          categoryId: 'project-reading',
          urlId: 'mismatch',
        },
      ],
    }
    expect(
      selectReviewCandidates(
        mismatched,
        { ...defaultReviewReminderSettings, target: 'uncategorized' },
        now,
      ).map(({ id }) => id),
    ).toEqual(['mismatch'])
  })

  it('excludes unknown, invalid, and future save times from older candidates', () => {
    const dated: ReviewCandidateSnapshot = {
      categories: [],
      memberships: [],
      urls: [
        url('nan', Number.NaN),
        url('infinite', Number.POSITIVE_INFINITY),
        url('negative', -1),
        url('future', now + day),
      ],
    }
    expect(
      selectReviewCandidates(
        dated,
        { ...defaultReviewReminderSettings, target: 'older' },
        now,
      ),
    ).toEqual([])
    expect(
      selectReviewCandidates(
        { ...dated, urls: [] },
        defaultReviewReminderSettings,
        now,
      ),
    ).toEqual([])
  })
})
