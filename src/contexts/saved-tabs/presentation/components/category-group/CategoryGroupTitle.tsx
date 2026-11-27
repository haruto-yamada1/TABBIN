import { useMemo } from 'react'

import { CardGroupTitle } from '@/contexts/saved-tabs/presentation/components/shared/CardGroupTitle'
import { LabeledCountBadge } from '@/contexts/saved-tabs/presentation/components/shared/LabeledCountBadge'
import { useI18n } from '@/features/i18n/context/I18nProvider'

import { useCategoryGroup } from './CategoryGroupContext'

/**
 * CategoryGroup のドラッグハンドル＆カテゴリ名表示
 * カテゴリ名、タブ数・ドメイン数バッジ、ドラッグハンドルを含む
 */
export const CategoryGroupTitle = () => {
  const { t } = useI18n()
  const { category, allUrls, visibleDomainsCount, sortable } =
    useCategoryGroup()

  const badges = useMemo(
    () => (
      <>
        <LabeledCountBadge
          count={allUrls?.length ?? 0}
          label={t('savedTabs.sortableCategory.tabCountLabel')}
        />
        <LabeledCountBadge
          count={visibleDomainsCount}
          label={t('savedTabs.domainCountLabel')}
        />
      </>
    ),
    [allUrls?.length, t, visibleDomainsCount],
  )

  return (
    <CardGroupTitle
      dataTour='academy-parent-drag'
      touchHandleOnly
      activatorRef={sortable.setActivatorNodeRef}
      title={category.name}
      badges={badges}
      sortableAttributes={sortable.attributes}
      sortableListeners={sortable.listeners}
    />
  )
}
