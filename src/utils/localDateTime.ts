const FALLBACK_TIME_ZONE = 'UTC'
const DATE_PARTS_LOCALE = 'en-CA'
const WEEKDAY_LOCALE = 'en-US'

const dateFormatterCache = new Map<string, Intl.DateTimeFormat>()
const dateTimeFormatterCache = new Map<string, Intl.DateTimeFormat>()
const weekdayFormatterCache = new Map<string, Intl.DateTimeFormat>()

const WEEKDAY_INDEX: Record<string, number> = {
  Fri: 5,
  Mon: 1,
  Sat: 6,
  Sun: 0,
  Thu: 4,
  Tue: 2,
  Wed: 3,
}

interface DateParts {
  day: number
  month: number
  year: number
}

const pad2 = (value: number): string => String(value).padStart(2, '0')

const resolveTimeZone = (timeZone?: string): string =>
  // eslint-disable-next-line typescript/prefer-nullish-coalescing
  timeZone?.trim() ||
  Intl.DateTimeFormat().resolvedOptions().timeZone ||
  FALLBACK_TIME_ZONE // eslint-disable-line typescript/prefer-nullish-coalescing -- chain: empty string should fall through
const getCachedFormatter = (
  cache: Map<string, Intl.DateTimeFormat>,
  key: string,
  createFormatter: () => Intl.DateTimeFormat,
): Intl.DateTimeFormat => {
  const cached = cache.get(key)
  if (cached) {
    return cached
  }

  const formatter = createFormatter()
  cache.set(key, formatter)
  return formatter
}

const getDatePartsFormatter = (timeZone: string): Intl.DateTimeFormat =>
  getCachedFormatter(dateFormatterCache, timeZone, () =>
    Intl.DateTimeFormat(DATE_PARTS_LOCALE, {
      day: '2-digit',
      month: '2-digit',
      timeZone,
      year: 'numeric',
    }),
  )

const getDateTimePartsFormatter = (timeZone: string): Intl.DateTimeFormat =>
  getCachedFormatter(dateTimeFormatterCache, timeZone, () =>
    Intl.DateTimeFormat(DATE_PARTS_LOCALE, {
      day: '2-digit',
      hour: '2-digit',
      hour12: false,
      minute: '2-digit',
      month: '2-digit',
      second: '2-digit',
      timeZone,
      year: 'numeric',
    }),
  )

const getWeekdayFormatter = (timeZone: string): Intl.DateTimeFormat =>
  getCachedFormatter(weekdayFormatterCache, timeZone, () =>
    Intl.DateTimeFormat(WEEKDAY_LOCALE, {
      timeZone,
      weekday: 'short',
    }),
  )

const getNumericPart = (
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): number => Number(parts.find((part) => part.type === type)?.value ?? 0)
const getDatePartsInTimeZone = (
  timestamp: number,
  timeZone?: string,
): DateParts => {
  const formatter = getDatePartsFormatter(resolveTimeZone(timeZone))
  const parts = formatter.formatToParts(new Date(timestamp))

  return {
    day: getNumericPart(parts, 'day'),
    month: getNumericPart(parts, 'month'),
    year: getNumericPart(parts, 'year'),
  }
}

const formatDateParts = ({ day, month, year }: DateParts): string =>
  `${year}-${pad2(month)}-${pad2(day)}`

const getWeekdayIndexInTimeZone = (
  timestamp: number,
  timeZone?: string,
): number =>
  WEEKDAY_INDEX[
    getWeekdayFormatter(resolveTimeZone(timeZone)).format(new Date(timestamp))
  ] ?? 0
const normalizeDateKey = (value: string | undefined): string | null => {
  const normalized = value?.trim()
  if (!normalized?.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return null
  }

  return normalized
}

const getLocalDateKey = (timestamp: number, timeZone?: string): string =>
  formatDateParts(getDatePartsInTimeZone(timestamp, timeZone))

const getLocalMonthKey = (timestamp: number, timeZone?: string): string => {
  const { month, year } = getDatePartsInTimeZone(timestamp, timeZone)
  return `${year}-${pad2(month)}`
}

const getLocalWeekStartKey = (timestamp: number, timeZone?: string): string => {
  const dateParts = getDatePartsInTimeZone(timestamp, timeZone)
  const date = new Date(
    Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day),
  )
  const SUNDAY_OFFSET = -6
  const WEEK_START_OFFSET = 1

  const day = getWeekdayIndexInTimeZone(timestamp, timeZone)
  const diff = day === 0 ? SUNDAY_OFFSET : WEEK_START_OFFSET - day
  date.setUTCDate(date.getUTCDate() + diff)

  return formatDateParts({
    day: date.getUTCDate(),
    month: date.getUTCMonth() + 1,
    year: date.getUTCFullYear(),
  })
}

const isTimestampInLocalDateRange = (
  timestamp: number,
  from: string | undefined,
  to: string | undefined,
  timeZone?: string,
): boolean => {
  const normalizedFrom = normalizeDateKey(from ?? to)
  const normalizedTo = normalizeDateKey(to ?? from)

  if (!normalizedFrom || !normalizedTo) {
    return true
  }

  const [start, end] =
    normalizedFrom <= normalizedTo
      ? [normalizedFrom, normalizedTo]
      : [normalizedTo, normalizedFrom]
  const target = getLocalDateKey(timestamp, timeZone)

  return target >= start && target <= end
}

const isTimestampInLocalMonth = (
  timestamp: number,
  year: number,
  month: number,
  timeZone?: string,
): boolean => {
  const dateParts = getDatePartsInTimeZone(timestamp, timeZone)
  return dateParts.year === year && dateParts.month === month
}

const formatFixedDatetime = (timestamp?: number, timeZone?: string): string => {
  if (!timestamp) {
    return '-'
  }

  const formatter = getDateTimePartsFormatter(resolveTimeZone(timeZone))
  const parts = formatter.formatToParts(new Date(timestamp))

  return `${getNumericPart(parts, 'year')}/${pad2(getNumericPart(parts, 'month'))}/${pad2(getNumericPart(parts, 'day'))} ${pad2(getNumericPart(parts, 'hour'))}:${pad2(getNumericPart(parts, 'minute'))}:${pad2(getNumericPart(parts, 'second'))}`
}

const formatLocaleDateTime = (
  timestamp: number,
  locale?: string,
  timeZone?: string,
): string =>
  new Date(timestamp).toLocaleString(locale, {
    timeZone: resolveTimeZone(timeZone),
  })

export {
  formatFixedDatetime,
  formatLocaleDateTime,
  getDatePartsInTimeZone,
  getLocalDateKey,
  getLocalMonthKey,
  getLocalWeekStartKey,
  isTimestampInLocalDateRange,
  isTimestampInLocalMonth,
}
