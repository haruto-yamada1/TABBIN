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
  const getPeriodSeconds = (period: string): number => {
    switch (period) {
      case '30sec': {
        return 30
      }
      case '1min': {
        return 60
      }
      case '1hour': {
        return 3600
      }
      case '1day': {
        return 86400
      }
      case '7days': {
        return 604800
      }
      case '14days': {
        return 1209600
      }
      case '30days': {
        return 2592000
      }
      case '180days': {
        return 15552000
      }
      case '365days': {
        return 31536000
      }
      default: {
        return Number.POSITIVE_INFINITY
      }
    }
  }
  return getPeriodSeconds(newPeriod) < getPeriodSeconds(currentPeriod)
}
