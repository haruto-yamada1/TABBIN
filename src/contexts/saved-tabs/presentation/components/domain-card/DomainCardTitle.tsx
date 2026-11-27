import { GripVertical } from 'lucide-react'

import { LabeledCountBadge } from '@/contexts/saved-tabs/presentation/components/shared/LabeledCountBadge'
import { useI18n } from '@/features/i18n/context/I18nProvider'

import { useDomainCard } from './DomainCardContext'

/**
 * DomainCard のドラッグハンドル＆ドメイン名表示
 * ドメイン名、タブ数バッジ、ドラッグハンドルを含む
 */
export const DomainCardTitle = () => {
  const { t } = useI18n()
  const { group, sortable, categoryId, visibleSubCategoryCount } =
    useDomainCard()

  return (
    <div
      className='flex grow cursor-grab items-center gap-2 overflow-hidden hover:cursor-grab active:cursor-grabbing'
      ref={sortable.setActivatorNodeRef}
      data-tour='academy-domain-drag'
      {...sortable.attributes}
      {...sortable.listeners}
    >
      <div className='shrink-0 text-muted-foreground' data-testid='drag-handle'>
        <GripVertical size={16} aria-hidden='true' />
      </div>
      <h2 className='truncate text-lg font-semibold text-foreground'>
        {group.domain}
      </h2>
      <LabeledCountBadge
        count={group.urls?.length ?? 0}
        label={t('savedTabs.sortableCategory.tabCountLabel')}
      />
      {categoryId ? (
        <LabeledCountBadge
          count={visibleSubCategoryCount}
          label={t('savedTabs.subCategoryCountLabel')}
        />
      ) : null}
    </div>
  )
}
