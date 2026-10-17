import { useSavedTimeClock } from '@/contexts/saved-tabs/presentation/hooks/useSavedTimeClock'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import { formatFixedDatetime } from '@/utils/localDateTime'
import {
  formatRelativeSavedTime,
  isValidSavedTimestamp,
} from '@/utils/relativeSavedTime'

export const SavedTime = ({
  savedAt,
  relative,
}: {
  savedAt: number
  relative: boolean
}) => {
  const { language } = useI18n()
  const valid = isValidSavedTimestamp(savedAt)
  const now = useSavedTimeClock(relative && valid)
  const absolute = valid ? formatFixedDatetime(savedAt) : '-'
  return (
    <span
      className='truncate text-muted-foreground'
      title={relative && valid ? absolute : undefined}
    >
      {relative ? formatRelativeSavedTime(savedAt, language, now) : absolute}
    </span>
  )
}
