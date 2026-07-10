import { useEffect, useState } from 'react'

type TimeRemainingResponse = {
  error?: string
  timeRemaining?: number
}

const MS_IN_SECOND = 1000
const SECONDS_IN_MINUTE = 60
const MINUTES_IN_HOUR = 60
const HOURS_IN_DAY = 24
const MS_IN_HOUR = MS_IN_SECOND * SECONDS_IN_MINUTE * MINUTES_IN_HOUR
const MS_IN_DAY = MS_IN_HOUR * HOURS_IN_DAY

const WARNING_DAYS_THRESHOLD = 3
const MS_IN_3_DAYS = MS_IN_DAY * WARNING_DAYS_THRESHOLD

const getTimeRemainingColorClass = (remainingMs: number): string => {
  if (remainingMs < MS_IN_HOUR) {
    return 'text-red-500 font-medium'
  }
  if (remainingMs < MS_IN_DAY) {
    return 'text-amber-500 font-medium'
  }
  if (remainingMs < MS_IN_3_DAYS) {
    return 'text-yellow-500'
  }
  return 'text-emerald-500'
}
const MS_IN_MINUTE = MS_IN_SECOND * SECONDS_IN_MINUTE

const formatTimeRemainingText = (remainingMs: number): string => {
  const days = Math.floor(remainingMs / MS_IN_DAY)
  const hours = Math.floor((remainingMs % MS_IN_DAY) / MS_IN_HOUR)
  const minutes = Math.floor((remainingMs % MS_IN_HOUR) / MS_IN_MINUTE)
  let result = 'あと '
  if (days > 0) {
    result += `${days}日 `
  }
  if (hours > 0 || days > 0) {
    result += `${hours}時間 `
  }
  result += `${minutes}分`
  return result
}
const applyTimeRemainingResponse = (
  response: TimeRemainingResponse,
  setTimeLeft: (value: string) => void,
  setColorClass: (value: string) => void,
): void => {
  if (response.error) {
    console.error('残り時間計算エラー:', response.error)
    setTimeLeft('')
    return
  }
  if (!response.timeRemaining) {
    setTimeLeft('')
    return
  }
  const remainingMs = response.timeRemaining
  if (remainingMs <= 0) {
    setColorClass('text-red-500')
    setTimeLeft('間もなく削除')
    return
  }
  setColorClass(getTimeRemainingColorClass(remainingMs))
  setTimeLeft(formatTimeRemainingText(remainingMs))
}
/**
 * 残り時間を表示するコンポーネント
 *
 * @param props.savedAt タブが保存された時間（ミリ秒タイムスタンプ）
 * @param props.autoDeletePeriod 自動削除期間の設定
 */
export const TimeRemaining = ({
  savedAt,
  autoDeletePeriod,
}: {
  savedAt?: number
  autoDeletePeriod?: string
}) => {
  const isAutoDeleteEnabled =
    Boolean(savedAt) &&
    Boolean(autoDeletePeriod) &&
    autoDeletePeriod !== 'never'
  const [timeLeft, setTimeLeft] = useState<string>('')
  const [colorClass, setColorClass] = useState<string>('')

  useEffect(() => {
    if (!isAutoDeleteEnabled) {
      return
    }

    // 残り時間を計算する関数
    const calculateTimeLeft = () => {
      // バックグラウンドスクリプトに残り時間計算をリクエスト
      chrome.runtime.sendMessage(
        {
          action: 'calculateTimeRemaining',
          autoDeletePeriod,
          savedAt,
        },
        (response) => {
          // eslint-disable-next-line typescript/no-unsafe-argument
          applyTimeRemainingResponse(response, setTimeLeft, setColorClass)
        },
      )
    }

    // 初回計算
    calculateTimeLeft()

    // 1分ごとに更新
    const timer = setInterval(calculateTimeLeft, MS_IN_MINUTE)
    // eslint-disable-next-line typescript/consistent-return
    return () => {
      clearInterval(timer)
    }
  }, [savedAt, autoDeletePeriod, isAutoDeleteEnabled])

  if (!isAutoDeleteEnabled || !timeLeft) {
    return null
  }
  return (
    <span className={`text-xs ${colorClass}`} title='自動削除までの残り時間'>
      {timeLeft}
    </span>
  )
}
