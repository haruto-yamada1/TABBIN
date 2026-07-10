import { X } from 'lucide-react'
import { useCallback } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/features/i18n/context/I18nProvider'

type OptionsExcludePatternBadgeProps = {
  pattern: string
  onRemove: (pattern: string) => void
}

export const OptionsExcludePatternBadge = ({
  pattern,
  onRemove,
}: OptionsExcludePatternBadgeProps) => {
  const { t } = useI18n()
  const handleRemove = useCallback(() => {
    onRemove(pattern)
  }, [onRemove, pattern])

  return (
    <Badge
      variant='outline'
      className='flex max-w-full items-center gap-1 pr-1'
    >
      <span className='max-w-[240px] truncate' title={pattern}>
        {pattern}
      </span>
      <Button
        type='button'
        variant='ghost'
        size='icon-sm'
        className='size-5 rounded-full'
        onClick={handleRemove}
        aria-label={t('options.excludePatterns.removeAria', undefined, {
          pattern,
        })}
      >
        <X size={12} />
      </Button>
    </Badge>
  )
}
