import { Badge } from '@/components/ui/badge'

type LabeledCountBadgeProps = {
  count: number
  label: string
}

/**
 * 件数バッジ。数字だけでは何の件数か判別できないため、
 * ラベルと件数を常に一緒に表示する (issue #1134)。
 */
export const LabeledCountBadge = ({ count, label }: LabeledCountBadgeProps) => (
  <Badge variant='secondary'>
    {label} {count}
  </Badge>
)
