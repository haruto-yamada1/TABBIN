import { describe, expect, it, vi } from 'vitest' // eslint-disable-line

import {
  assessPersistenceCapacity,
  classifyPersistenceWriteFailure,
  createPersistenceFailureOutcome,
  measureSerializedBytes,
  runPersistenceCapacityPreflight,
} from './capacity'
import type { PersistenceCapacityPlan } from './capacity'

const plan = {
  minimumReserveBytes: 200,
  reserveRatio: 0.2,
  sourceEntityCounts: {
    collections: 4,
    urls: 10,
  },
  sourceSerializedBytes: 1_000,
  targetExpansionRatio: 1.5,
} as const

describe('persistence capacity policy', () => {
  it('measures the UTF-8 byte size of the serialized legacy source', () => {
    const source = {
      title: '保存データ',
      urls: ['https://example.com'],
    }

    expect(measureSerializedBytes(source)).toBe(
      new TextEncoder().encode(JSON.stringify(source)).byteLength,
    )
    expect(() => measureSerializedBytes(undefined)).toThrow(/JSON-serializable/)
  })

  it('requires projected target bytes plus a reserve while source data remains', () => {
    expect(
      assessPersistenceCapacity(plan, {
        quota: 10_000,
        usage: 4_000,
      }),
    ).toEqual({
      availableBytes: 6_000,
      diagnostics: {
        approximateSourceBytes: 1_000,
        estimatedQuotaBytes: 10_000,
        estimatedUsageBytes: 4_000,
        sourceEntityCounts: {
          collections: 4,
          urls: 10,
        },
      },
      projectedTargetBytes: 1_500,
      requiredHeadroomBytes: 1_800,
      reserveBytes: 300,
      status: 'ready',
    })
  })

  it('blocks near-capacity migration before the target write starts', () => {
    expect(
      assessPersistenceCapacity(plan, {
        quota: 10_000,
        usage: 8_500,
      }),
    ).toMatchObject({
      availableBytes: 1_500,
      errorCode: 'PERSISTENCE_QUOTA_EXCEEDED',
      requiredHeadroomBytes: 1_800,
      status: 'blocked',
    })
  })

  it('blocks when the browser estimate is missing or internally invalid', () => {
    expect(assessPersistenceCapacity(plan, {})).toMatchObject({
      errorCode: 'PERSISTENCE_CAPACITY_PREFLIGHT_FAILED',
      status: 'blocked',
    })
    expect(
      assessPersistenceCapacity(plan, {
        quota: 1_000,
        usage: 2_000,
      }),
    ).toMatchObject({
      errorCode: 'PERSISTENCE_CAPACITY_PREFLIGHT_FAILED',
      status: 'blocked',
    })
  })

  it('fails closed when plan math overflows or entity counts are invalid', () => {
    expect(
      assessPersistenceCapacity(
        {
          ...plan,
          sourceSerializedBytes: Number.MAX_VALUE,
          targetExpansionRatio: 2,
        },
        {
          quota: Number.MAX_VALUE,
          usage: 0,
        },
      ),
    ).toMatchObject({
      errorCode: 'PERSISTENCE_CAPACITY_PREFLIGHT_FAILED',
      status: 'blocked',
    })

    expect(
      assessPersistenceCapacity(
        {
          ...plan,
          sourceEntityCounts: {
            urls: -1,
          },
        },
        {
          quota: 10_000,
          usage: 0,
        },
      ),
    ).toMatchObject({
      errorCode: 'PERSISTENCE_CAPACITY_PREFLIGHT_FAILED',
      status: 'blocked',
    })
  })

  it('blocks unknown entity kinds and excludes them from diagnostics', () => {
    const rawUserContent = 'https://private.example/saved-tab'
    const sourceEntityCounts = {
      urls: 10,
      [rawUserContent]: 1,
    } as unknown as PersistenceCapacityPlan['sourceEntityCounts']

    const assessment = assessPersistenceCapacity(
      {
        ...plan,
        sourceEntityCounts,
      },
      {
        quota: 10_000,
        usage: 4_000,
      },
    )

    expect(assessment).toMatchObject({
      errorCode: 'PERSISTENCE_CAPACITY_PREFLIGHT_FAILED',
      status: 'blocked',
    })
    expect(assessment.diagnostics.sourceEntityCounts).toEqual({
      urls: 10,
    })
  })

  it('turns a rejected estimate into a typed preflight failure', async () => {
    const estimateStorage = vi
      .fn()
      .mockRejectedValue(new Error('/private/profile/path'))

    await expect(
      runPersistenceCapacityPreflight(plan, estimateStorage),
    ).resolves.toMatchObject({
      errorCode: 'PERSISTENCE_CAPACITY_PREFLIGHT_FAILED',
      status: 'blocked',
    })
  })

  it.each([
    ['QuotaExceededError', 'PERSISTENCE_QUOTA_EXCEEDED'],
    ['InvalidStateError', 'PERSISTENCE_STORAGE_UNAVAILABLE'],
    ['SecurityError', 'PERSISTENCE_STORAGE_UNAVAILABLE'],
    ['AbortError', 'PERSISTENCE_DISK_WRITE_FAILED'],
  ] as const)(
    'classifies %s without exposing the raw browser error',
    (name, expectedCode) => {
      expect(classifyPersistenceWriteFailure({ name })).toBe(expectedCode)
    },
  )

  it.each([null, 'raw error', {}, { name: 1 }])(
    'classifies an unrecognized write failure without inspecting raw content',
    (error) => {
      expect(classifyPersistenceWriteFailure(error)).toBe(
        'PERSISTENCE_DISK_WRITE_FAILED',
      )
    },
  )

  it('retains the legacy source and forbids cutover on every capacity failure', () => {
    expect(
      createPersistenceFailureOutcome(
        'PERSISTENCE_DISK_WRITE_FAILED',
        'target-write',
        {
          approximateSourceBytes: 1_000,
          estimatedQuotaBytes: 10_000,
          estimatedUsageBytes: 8_500,
          sourceEntityCounts: {
            urls: 10,
          },
        },
      ),
    ).toEqual({
      canCutover: false,
      controlState: 'failed',
      diagnostics: {
        approximateSourceBytes: 1_000,
        errorCode: 'PERSISTENCE_DISK_WRITE_FAILED',
        estimatedQuotaBytes: 10_000,
        estimatedUsageBytes: 8_500,
        failedStage: 'target-write',
        sourceEntityCounts: {
          urls: 10,
        },
      },
      legacySourceAction: 'retain',
      recoveryActions: ['backup', 'retry'],
    })
  })
})
