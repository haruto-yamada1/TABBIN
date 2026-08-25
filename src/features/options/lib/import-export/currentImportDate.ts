const ISO_DATE_ONLY_LENGTH = 10

export type ImportDateClock = () => Date

const systemClock: ImportDateClock = () => new Date()

export const getCurrentUtcDateOnly = (
  now: ImportDateClock = systemClock,
): string => now().toISOString().slice(0, ISO_DATE_ONLY_LENGTH)
