import { Loader2Icon } from 'lucide-react'

import { useI18nText } from '@/features/i18n/lib/useI18nText'
import { cn } from '@/lib/utils'

function Spinner({ className, ...props }: React.ComponentProps<'svg'>) {
  const t = useI18nText()

  return (
    <Loader2Icon
      role='status'
      aria-label={t('common.loadingLabel')}
      className={cn('size-4 animate-spin', className)}
      {...props}
    />
  )
}

export { Spinner }
