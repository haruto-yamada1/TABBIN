// 期間が短くなるかどうかを判定するヘルパー関数を追加
export const isPeriodShortening = (
  currentPeriod: string,
  newPeriod: string,
): boolean => {
  // 「never」からの変更は常に短くなる
  if (currentPeriod === 'never') {
    return true
  }

  // 「never」への変更は短くならない
  if (newPeriod === 'never') {
    return false
  }

  // 期間を秒数に変換して比較
  const THIRTY_SECONDS = 30
  const SECONDS_IN_MINUTE_PS = 60
  const MINUTES_IN_HOUR_PS = 60
  const HOURS_IN_DAY_PS = 24
  const DAYS_IN_WEEK_PS = 7
  const DAYS_IN_14_DAYS_PS = 14
  const DAYS_IN_30_DAYS_PS = 30
  const DAYS_IN_180_DAYS_PS = 180
  const DAYS_IN_365_DAYS_PS = 365

  const getPeriodSeconds = (period: string): number => {
    switch (period) {
      case '30sec': {
        return THIRTY_SECONDS
      }
      case '1min': {
        return SECONDS_IN_MINUTE_PS
      }
      case '1hour': {
        return SECONDS_IN_MINUTE_PS * MINUTES_IN_HOUR_PS
      }
      case '1day': {
        return SECONDS_IN_MINUTE_PS * MINUTES_IN_HOUR_PS * HOURS_IN_DAY_PS
      }
      case '7days': {
        return (
          SECONDS_IN_MINUTE_PS *
          MINUTES_IN_HOUR_PS *
          HOURS_IN_DAY_PS *
          DAYS_IN_WEEK_PS
        )
      }
      case '14days': {
        return (
          SECONDS_IN_MINUTE_PS *
          MINUTES_IN_HOUR_PS *
          HOURS_IN_DAY_PS *
          DAYS_IN_14_DAYS_PS
        )
      }
      case '30days': {
        return (
          SECONDS_IN_MINUTE_PS *
          MINUTES_IN_HOUR_PS *
          HOURS_IN_DAY_PS *
          DAYS_IN_30_DAYS_PS
        )
      }
      case '180days': {
        return (
          SECONDS_IN_MINUTE_PS *
          MINUTES_IN_HOUR_PS *
          HOURS_IN_DAY_PS *
          DAYS_IN_180_DAYS_PS
        )
      }
      case '365days': {
        return (
          SECONDS_IN_MINUTE_PS *
          MINUTES_IN_HOUR_PS *
          HOURS_IN_DAY_PS *
          DAYS_IN_365_DAYS_PS
        )
      }
      default: {
        return Number.POSITIVE_INFINITY
      }
    }
  }
  return getPeriodSeconds(newPeriod) < getPeriodSeconds(currentPeriod)
}
