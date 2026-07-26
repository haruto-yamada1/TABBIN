import { describe, expect, it } from 'vitest'

import {
  createCorruptedPersistenceV2Snapshot,
  createHealthyPersistenceV2Snapshot,
} from '@/contexts/saved-tabs/domain/testing/persistenceV2IntegrityFixtures'

import { checkPersistenceIntegrity } from './PersistenceIntegrityChecker'
import type { StorageIntegrityReport } from './PersistenceIntegrityChecker'
import { createStorageRepairPlan } from './PersistenceRepairPlanner'

describe('createStorageRepairPlan', () => {
  it('creates a destructive dry-run operation for an equivalent duplicate', () => {
    const snapshot = createHealthyPersistenceV2Snapshot()
    const membership = snapshot.memberships[0]
    const report = checkPersistenceIntegrity({
      ...snapshot,
      memberships: [...snapshot.memberships, { ...membership }],
    })

    const plan = createStorageRepairPlan(report)

    expect(plan.destructive).toBe(true)
    expect(plan.operations).toEqual(
      expect.arrayContaining([
        {
          collectionId: 'collection-domain',
          destructive: true,
          removeCount: 1,
          type: 'REMOVE_DUPLICATE_MEMBERSHIP',
          urlId: 'url-alpha',
        },
      ]),
    )
    expect(plan.unresolvedIssues).not.toContainEqual(
      expect.objectContaining({ code: 'DUPLICATE_MEMBERSHIP' }),
    )
  })

  it('never turns an orphan URL into a removal operation', () => {
    const plan = createStorageRepairPlan(
      checkPersistenceIntegrity(createCorruptedPersistenceV2Snapshot()),
    )

    expect(plan.operations).not.toContainEqual(
      expect.objectContaining({ type: 'REMOVE_ORPHAN_URL' }),
    )
    expect(plan.unresolvedIssues).toContainEqual(
      expect.objectContaining({ code: 'ORPHAN_URL' }),
    )
  })

  it('leaves conflicting duplicate memberships unresolved', () => {
    const snapshot = createHealthyPersistenceV2Snapshot()
    const membership = snapshot.memberships[0]
    const report = checkPersistenceIntegrity({
      ...snapshot,
      memberships: [
        ...snapshot.memberships,
        { ...membership, sortOrder: membership.sortOrder + 1 },
      ],
    })

    const plan = createStorageRepairPlan(report)

    expect(plan.operations).not.toContainEqual(
      expect.objectContaining({ type: 'REMOVE_DUPLICATE_MEMBERSHIP' }),
    )
    expect(plan.unresolvedIssues).toContainEqual(
      expect.objectContaining({
        code: 'DUPLICATE_MEMBERSHIP',
        repairability: 'requires-review',
      }),
    )
  })

  it('distinguishes a non-destructive active selection reset', () => {
    const report = {
      isHealthy: false,
      issues: [
        {
          code: 'INVALID_ACTIVE_CHAT_REFERENCE',
          conversationId: 'conversation-missing',
          repairability: 'automatic-safe',
          severity: 'warning',
        },
      ],
    } satisfies StorageIntegrityReport

    expect(createStorageRepairPlan(report)).toStrictEqual({
      destructive: false,
      operations: [
        {
          conversationId: 'conversation-missing',
          destructive: false,
          type: 'RESET_ACTIVE_CHAT_REFERENCE',
        },
      ],
      unresolvedIssues: [],
    })
  })

  it('returns an empty non-destructive plan for a healthy report', () => {
    expect(
      createStorageRepairPlan({ isHealthy: true, issues: [] }),
    ).toStrictEqual({
      destructive: false,
      operations: [],
      unresolvedIssues: [],
    })
  })
})
