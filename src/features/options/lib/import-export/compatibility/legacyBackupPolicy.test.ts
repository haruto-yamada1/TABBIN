import { describe, expect, expectTypeOf, it, vi } from 'vitest'

import { formatLocalizedDate } from '@/features/i18n/lib/date-format'

import {
  LEGACY_BACKUP_ADVISORY,
  LEGACY_BACKUP_POLICY,
  decideLegacyBackupCutoff,
  isLegacyBackupImportSupported,
} from './legacyBackupPolicy'
import type {
  LegacyBackupAdvisory,
  LegacyBackupCutoffDecision,
} from './legacyBackupPolicy'

describe('LEGACY_BACKUP_POLICY', () => {
  it('defines the fixed cutoff and notice policy', () => {
    expect(LEGACY_BACKUP_POLICY).toEqual({
      lastSupportedDate: '2026-09-30',
      cutoffDate: '2026-10-01',
      latestNoticeReleaseDate: '2026-09-01',
      minimumNoticeDays: 30,
    })
  })

  it('keeps the notice dates identical across ja and en surfaces', () => {
    expect({
      en: {
        cutoffDate: formatLocalizedDate('en', LEGACY_BACKUP_POLICY.cutoffDate),
        lastSupportedDate: formatLocalizedDate(
          'en',
          LEGACY_BACKUP_POLICY.lastSupportedDate,
        ),
      },
      ja: {
        cutoffDate: formatLocalizedDate('ja', LEGACY_BACKUP_POLICY.cutoffDate),
        lastSupportedDate: formatLocalizedDate(
          'ja',
          LEGACY_BACKUP_POLICY.lastSupportedDate,
        ),
      },
    }).toEqual({
      en: {
        cutoffDate: 'October 1, 2026',
        lastSupportedDate: 'September 30, 2026',
      },
      ja: {
        cutoffDate: '2026年10月1日',
        lastSupportedDate: '2026年9月30日',
      },
    })
  })
})

describe('decideLegacyBackupCutoff', () => {
  it.each(['0000-01-01', '0099-12-31', '2026-08-22', '2026-09-01'])(
    'keeps the cutoff for a valid notice release on %s',
    (releaseDate) => {
      expect(decideLegacyBackupCutoff(releaseDate)).toBe('keep-cutoff')
    },
  )

  it.each(['2026-09-02', '2026-10-01', '2027-01-01'])(
    'requires postponement for a release after the latest notice date on %s',
    (releaseDate) => {
      expect(decideLegacyBackupCutoff(releaseDate)).toBe('postpone-required')
    },
  )

  it.each([
    '2026-9-01',
    '2026-09-1',
    '2026-02-29',
    '2026-13-01',
    'not-a-date',
    '2026-09-01T00:00:00Z',
  ])('rejects invalid date-only ISO input %s', (releaseDate) => {
    expect(() => decideLegacyBackupCutoff(releaseDate)).toThrow(RangeError)
  })

  it('is independent of the current time', () => {
    vi.useFakeTimers()

    try {
      vi.setSystemTime(new Date('2025-01-01T00:00:00.000Z'))
      const decisionsBeforeCutoff = [
        decideLegacyBackupCutoff('2026-09-01'),
        decideLegacyBackupCutoff('2026-09-02'),
      ]

      vi.setSystemTime(new Date('2027-01-01T00:00:00.000Z'))
      const decisionsAfterCutoff = [
        decideLegacyBackupCutoff('2026-09-01'),
        decideLegacyBackupCutoff('2026-09-02'),
      ]

      expect(decisionsBeforeCutoff).toEqual([
        'keep-cutoff',
        'postpone-required',
      ])
      expect(decisionsAfterCutoff).toEqual(decisionsBeforeCutoff)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('LEGACY_BACKUP_ADVISORY', () => {
  it('provides future preview data for legacy backups', () => {
    expect(LEGACY_BACKUP_ADVISORY).toEqual({
      cutoffDate: '2026-10-01',
      lastSupportedDate: '2026-09-30',
      requiresReExport: true,
    })
  })

  it('retains literal types for advisory and decision consumers', () => {
    expectTypeOf(LEGACY_BACKUP_ADVISORY).toExtend<LegacyBackupAdvisory>()
    expectTypeOf(LEGACY_BACKUP_ADVISORY.requiresReExport).toEqualTypeOf<true>()
    expectTypeOf(
      decideLegacyBackupCutoff,
    ).returns.toEqualTypeOf<LegacyBackupCutoffDecision>()
  })
})

describe('isLegacyBackupImportSupported', () => {
  it.each([
    ['29 days after the 2026-08-22 notice release', '2026-09-20'],
    [
      '30 days after the 2026-08-22 notice release and before cutoff',
      '2026-09-21',
    ],
  ])('supports a legacy import %s', (_description, importDate) => {
    expect(isLegacyBackupImportSupported(importDate)).toBe(true)
  })

  it.each(['0000-01-01', '2026-09-29', '2026-09-30'])(
    'supports a legacy import on %s',
    (importDate) => {
      expect(isLegacyBackupImportSupported(importDate)).toBe(true)
    },
  )

  it.each(['2026-10-01', '2027-01-01'])(
    'rejects a legacy import on %s',
    (importDate) => {
      expect(isLegacyBackupImportSupported(importDate)).toBe(false)
    },
  )

  it.each(['2026-9-30', '2026-02-29', 'invalid'])(
    'rejects an invalid date-only import date %s',
    (importDate) => {
      expect(() => isLegacyBackupImportSupported(importDate)).toThrow(
        RangeError,
      )
    },
  )
})
