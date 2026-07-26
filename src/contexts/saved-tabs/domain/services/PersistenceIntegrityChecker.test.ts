import { describe, expect, it, vi } from 'vitest'

import { PERSISTENCE_V2_INVARIANT_CODES } from '@/contexts/saved-tabs/domain/entities/PersistenceModelV2'
import {
  createCorruptedPersistenceV2Snapshot,
  createHealthyPersistenceV2Snapshot,
} from '@/contexts/saved-tabs/domain/testing/persistenceV2IntegrityFixtures'

import {
  checkPersistenceIntegrity,
  PERSISTENCE_V2_INVARIANT_POLICY,
} from './PersistenceIntegrityChecker'

describe('checkPersistenceIntegrity', () => {
  it('reports a healthy logical snapshot without changing it', () => {
    const snapshot = createHealthyPersistenceV2Snapshot()
    const before = structuredClone(snapshot)

    expect(checkPersistenceIntegrity(snapshot)).toStrictEqual({
      isHealthy: true,
      issues: [],
    })
    expect(snapshot).toStrictEqual(before)
  })

  it('detects the corrupted fixture invariants required by Issue #712', () => {
    const report = checkPersistenceIntegrity(
      createCorruptedPersistenceV2Snapshot(),
    )

    expect(report.isHealthy).toBe(false)
    expect(new Set(report.issues.map(({ code }) => code))).toEqual(
      new Set([
        'CATEGORY_COLLECTION_MISMATCH',
        'CATEGORY_MISSING',
        'COLLECTION_MISSING',
        'DUPLICATE_DOMAIN_COLLECTION',
        'DUPLICATE_MEMBERSHIP',
        'DUPLICATE_NORMALIZED_URL',
        'DUPLICATE_URL_ID',
        'GROUP_MISSING',
        'INVALID_CATEGORY_ORDER',
        'INVALID_COLLECTION_ORDER',
        'INVALID_GROUP_ORDER',
        'INVALID_MEMBERSHIP_ORDER',
        'INVALID_TIMESTAMP_RELATION',
        'NON_JSON_SAFE_VALUE',
        'ORPHAN_CATEGORY',
        'ORPHAN_URL',
        'URL_MISSING',
      ]),
    )
  })

  it('returns review metadata for a conflicting duplicate membership', () => {
    const report = checkPersistenceIntegrity(
      createCorruptedPersistenceV2Snapshot(),
    )

    expect(
      report.issues.find(
        (issue) =>
          issue.code === 'DUPLICATE_MEMBERSHIP' &&
          issue.collectionId === 'collection-domain',
      ),
    ).toStrictEqual({
      code: 'DUPLICATE_MEMBERSHIP',
      collectionId: 'collection-domain',
      occurrenceCount: 2,
      repairability: 'requires-review',
      severity: 'error',
      urlId: 'url-alpha',
    })
  })

  it('allows automatic repair for metadata-equivalent memberships', () => {
    const snapshot = createHealthyPersistenceV2Snapshot()
    const membership = snapshot.memberships[0]
    const report = checkPersistenceIntegrity({
      ...snapshot,
      memberships: [...snapshot.memberships, { ...membership }],
    })

    expect(
      report.issues.find(({ code }) => code === 'DUPLICATE_MEMBERSHIP'),
    ).toEqual(
      expect.objectContaining({
        code: 'DUPLICATE_MEMBERSHIP',
        repairability: 'automatic-safe',
      }),
    )
  })

  it('requires review when duplicate memberships have conflicting metadata', () => {
    const snapshot = createHealthyPersistenceV2Snapshot()
    const membership = snapshot.memberships[0]
    const report = checkPersistenceIntegrity({
      ...snapshot,
      memberships: [
        ...snapshot.memberships,
        { ...membership, notes: 'different private note' },
      ],
    })

    expect(
      report.issues.find(({ code }) => code === 'DUPLICATE_MEMBERSHIP'),
    ).toEqual(
      expect.objectContaining({
        code: 'DUPLICATE_MEMBERSHIP',
        repairability: 'requires-review',
      }),
    )
  })

  it('does not depend on locale-sensitive comparison for finding order', () => {
    const localeCompare = vi
      .spyOn(String.prototype, 'localeCompare')
      .mockImplementation(() => {
        throw new Error('locale-sensitive comparison must not be used')
      })

    try {
      expect(() =>
        checkPersistenceIntegrity(createCorruptedPersistenceV2Snapshot()),
      ).not.toThrow()
    } finally {
      localeCompare.mockRestore()
    }
  })

  it('keeps identical findings stable while sorting', () => {
    const snapshot = createHealthyPersistenceV2Snapshot()
    const missingMembership = {
      ...snapshot.memberships[0],
      collectionId: 'collection-missing',
      urlId: 'url-missing',
    }
    const report = checkPersistenceIntegrity({
      ...snapshot,
      memberships: [missingMembership, { ...missingMembership }],
    })

    expect(
      report.issues.filter(({ code }) => code === 'COLLECTION_MISSING'),
    ).toHaveLength(2)
  })

  it('defines severity and repairability for every Issue #725 code', () => {
    expect(Object.keys(PERSISTENCE_V2_INVARIANT_POLICY)).toStrictEqual([
      ...PERSISTENCE_V2_INVARIANT_CODES,
    ])
  })

  it('returns deterministic findings without leaking user content', () => {
    const snapshot = createCorruptedPersistenceV2Snapshot()
    const first = checkPersistenceIntegrity(snapshot)
    const second = checkPersistenceIntegrity(snapshot)
    const serialized = JSON.stringify(first)

    expect(first).toStrictEqual(second)
    expect(serialized).not.toContain('private-path')
    expect(serialized).not.toContain('Private ')
    expect(serialized).not.toContain('private membership note')
    expect(serialized).not.toContain('alpha.test')
  })

  it.each([
    [1n, 'bigint'],
    [() => 'not persisted', 'function'],
    [Number.NaN, 'non-finite-number'],
    [-0, 'negative-zero'],
    [new Date(0), 'object'],
    [Symbol('not persisted'), 'symbol'],
    [[undefined], 'array'],
    [undefined, 'undefined'],
  ])(
    'classifies a non-JSON-safe field without copying it',
    (value, typeClass) => {
      const snapshot = createHealthyPersistenceV2Snapshot()
      Object.defineProperty(snapshot.urls[0], 'title', {
        configurable: true,
        enumerable: true,
        value,
      })

      expect(
        checkPersistenceIntegrity(snapshot).issues.find(
          ({ code }) => code === 'NON_JSON_SAFE_VALUE',
        ),
      ).toStrictEqual({
        code: 'NON_JSON_SAFE_VALUE',
        path: 'urls[0].title',
        repairability: 'not-repairable',
        severity: 'error',
        typeClass,
      })
    },
  )

  it('reports a non-plain record without exposing its fields', () => {
    const snapshot = createHealthyPersistenceV2Snapshot()
    Object.setPrototypeOf(snapshot.urls[0], Date.prototype)

    expect(
      checkPersistenceIntegrity(snapshot).issues.find(
        ({ code }) => code === 'NON_JSON_SAFE_VALUE',
      ),
    ).toStrictEqual({
      code: 'NON_JSON_SAFE_VALUE',
      path: 'urls[0]',
      repairability: 'not-repairable',
      severity: 'error',
      typeClass: 'object',
    })
  })
})
