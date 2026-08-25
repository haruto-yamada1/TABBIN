const HOURS_PER_DAY = 24
const MINUTES_PER_HOUR = 60
const SECONDS_PER_MINUTE = 60
const MILLISECONDS_PER_SECOND = 1000
const MINIMUM_NOTICE_DAYS = 30
const MILLISECONDS_PER_DAY =
  HOURS_PER_DAY *
  MINUTES_PER_HOUR *
  SECONDS_PER_MINUTE *
  MILLISECONDS_PER_SECOND
const ISO_DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

export type LegacyBackupPolicy = {
  readonly lastSupportedDate: '2026-09-30'
  readonly cutoffDate: '2026-10-01'
  readonly latestNoticeReleaseDate: '2026-09-01'
  readonly minimumNoticeDays: typeof MINIMUM_NOTICE_DAYS
}

export const LEGACY_BACKUP_POLICY = {
  lastSupportedDate: '2026-09-30',
  cutoffDate: '2026-10-01',
  latestNoticeReleaseDate: '2026-09-01',
  minimumNoticeDays: MINIMUM_NOTICE_DAYS,
} as const satisfies LegacyBackupPolicy

export type LegacyBackupCutoffDecision = 'keep-cutoff' | 'postpone-required'

export type LegacyBackupAdvisory = {
  readonly cutoffDate: LegacyBackupPolicy['cutoffDate']
  readonly lastSupportedDate: LegacyBackupPolicy['lastSupportedDate']
  readonly requiresReExport: true
}

export const LEGACY_BACKUP_ADVISORY = {
  cutoffDate: LEGACY_BACKUP_POLICY.cutoffDate,
  lastSupportedDate: LEGACY_BACKUP_POLICY.lastSupportedDate,
  requiresReExport: true,
} as const satisfies LegacyBackupAdvisory

export function decideLegacyBackupCutoff(
  releaseDate: string,
): LegacyBackupCutoffDecision {
  const releaseTime = parseIsoDateOnlyUtc(releaseDate)
  const latestNoticeTime = parseIsoDateOnlyUtc(
    LEGACY_BACKUP_POLICY.latestNoticeReleaseDate,
  )
  const cutoffTime = parseIsoDateOnlyUtc(LEGACY_BACKUP_POLICY.cutoffDate)
  const noticeDays = (cutoffTime - releaseTime) / MILLISECONDS_PER_DAY

  if (
    releaseTime <= latestNoticeTime &&
    noticeDays >= LEGACY_BACKUP_POLICY.minimumNoticeDays
  ) {
    return 'keep-cutoff'
  }

  return 'postpone-required'
}

export function isLegacyBackupImportSupported(importDate: string): boolean {
  return (
    parseIsoDateOnlyUtc(importDate) <
    parseIsoDateOnlyUtc(LEGACY_BACKUP_POLICY.cutoffDate)
  )
}

function parseIsoDateOnlyUtc(dateOnly: string): number {
  const match = ISO_DATE_ONLY_PATTERN.exec(dateOnly)

  if (!match) {
    throw new RangeError(`Invalid date-only ISO value: ${dateOnly}`)
  }

  const [, yearText, monthText, dayText] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const date = new Date(0)
  const timestamp = date.setUTCFullYear(year, month - 1, day)

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new RangeError(`Invalid date-only ISO value: ${dateOnly}`)
  }

  return timestamp
}
