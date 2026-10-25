import { ListFilter } from 'lucide-react'
import { useCallback } from 'react'

import { Button } from '@/components/ui/button'
import { useI18n } from '@/features/i18n/context/I18nProvider'

export const CardFavoriteFilter = ({
  only,
  setOnly,
  name,
  hasFavorites = true,
}: {
  hasFavorites?: boolean
  only: boolean
  setOnly: (only: boolean) => void
  name: string
}) => {
  const { t } = useI18n()
  const handleClick = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation()
      setOnly(!only)
    },
    [setOnly, only],
  )
  if (!hasFavorites && !only) {
    return null
  }
  return (
    <Button
      type='button'
      variant={only ? 'default' : 'secondary'}
      size='sm'
      className='shrink-0 cursor-pointer'
      aria-pressed={only}
      aria-label={t('savedTabs.favorite.filter', undefined, { name })}
      title={t('savedTabs.favorite.orderHint')}
      onClick={handleClick}
    >
      <ListFilter size={14} aria-hidden='true' />
    </Button>
  )
}
