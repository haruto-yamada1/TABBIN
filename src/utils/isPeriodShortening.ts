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
        // eslint-disable-next-line eslint/no-magic-numbers
        return 30
      }
      case '1min': {
        // eslint-disable-next-line eslint/no-magic-numbers
        return 60
      }
      case '1hour': {
        // eslint-disable-next-line eslint/no-magic-numbers
        return 3600
      }
      case '1day': {
        // eslint-disable-next-line eslint/no-magic-numbers
        return 86400
      }
      case '7days': {
        // eslint-disable-next-line eslint/no-magic-numbers
        return 604800
      }
      case '14days': {
        // eslint-disable-next-line eslint/no-magic-numbers
        return 1209600
      }
      case '30days': {
        // eslint-disable-next-line eslint/no-magic-numbers
        return 2592000
      }
      case '180days': {
        // eslint-disable-next-line eslint/no-magic-numbers
        return 15552000
      }
      case '365days': {
        // eslint-disable-next-line eslint/no-magic-numbers
        return 31536000
      }
      default: {
        return Number.POSITIVE_INFINITY
      }
    }
  }
  return getPeriodSeconds(newPeriod) < getPeriodSeconds(currentPeriod)
}
