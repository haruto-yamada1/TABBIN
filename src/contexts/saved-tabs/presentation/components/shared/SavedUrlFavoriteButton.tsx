import { Star } from 'lucide-react'
import { useCallback } from 'react'

import { Button } from '@/components/ui/button'
import { useSavedUrlFavorite } from '@/contexts/saved-tabs/presentation/controllers/useSavedUrlFavorite'
import { useI18n } from '@/features/i18n/context/I18nProvider'

export const SavedUrlFavoriteButton = ({
  url,
  title,
  isFavorite = false,
  disabled = false,
}: {
  url: string
  title: string
  isFavorite?: boolean
  disabled?: boolean
}) => {
  const { t } = useI18n()
  const { toggle, isPending, isAvailable } = useSavedUrlFavorite(
    url,
    isFavorite,
  )
  const label = t('savedTabs.favorite.toggle', undefined, {
    name: title || url,
  })
  const handleClick = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation()
      void toggle()
    },
    [toggle],
  )
  return (
    <Button
      type='button'
      variant='ghost'
      size='icon'
      className='size-8 shrink-0 cursor-pointer'
      aria-label={label}
      aria-pressed={isFavorite}
      title={t('savedTabs.favorite.protection')}
      disabled={disabled || isPending || !isAvailable}
      onClick={handleClick}
    >
      <Star
        size={14}
        aria-hidden='true'
        className={
          isFavorite ? 'fill-current text-primary' : 'text-muted-foreground'
        }
      />
    </Button>
  )
}
