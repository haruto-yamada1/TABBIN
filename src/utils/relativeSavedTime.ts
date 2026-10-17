const MINUTE = 60_000
const HOUR = 3_600_000
const DAY = 86_400_000

const formatters = {
  en: new Intl.RelativeTimeFormat('en', { numeric: 'auto' }),
  ja: new Intl.RelativeTimeFormat('ja', { numeric: 'auto' }),
}

export const isValidSavedTimestamp = (
  timestamp: number | undefined,
): timestamp is number =>
  timestamp !== undefined && Number.isFinite(new Date(timestamp).getTime())

// Elapsed full units, so crossing midnight alone does not mean a day elapsed.
export const formatRelativeSavedTime = (
  timestamp: number | undefined,
  language: 'en' | 'ja',
  now: number,
): string => {
  if (!isValidSavedTimestamp(timestamp) || !isValidSavedTimestamp(now)) {
    return '-'
  }
  const delta = timestamp - now
  const magnitude = Math.abs(delta)
  const formatter = formatters[language]
  for (const [size, unit] of [
    [DAY, 'day'],
    [HOUR, 'hour'],
    [MINUTE, 'minute'],
  ] as const) {
    if (magnitude >= size) {
      return formatter.format(Math.trunc(delta / size), unit)
    }
  }
  return formatter.format(0, 'second')
}
