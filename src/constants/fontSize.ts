export const DEFAULT_FONT_SIZE_PERCENT = 100
export const MIN_FONT_SIZE_PERCENT = 10
export const MAX_FONT_SIZE_PERCENT = 500
export const FONT_SIZE_PERCENT_STEP = 1

export const normalizeFontSizePercent = (value?: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_FONT_SIZE_PERCENT
  }

  return Math.min(
    MAX_FONT_SIZE_PERCENT,
    Math.max(MIN_FONT_SIZE_PERCENT, Math.round(value)),
  )
}

const FONT_SCALE_DIVISOR = 100

export const toFontScaleValue = (value?: number): string =>
  String(normalizeFontSizePercent(value) / FONT_SCALE_DIVISOR)
