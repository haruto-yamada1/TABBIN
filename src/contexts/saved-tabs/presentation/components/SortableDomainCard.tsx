import { memo, useMemo } from 'react'

import type { SortableDomainCardProps } from '@/types/saved-tabs'
import type { UserSettings } from '@/types/storage'

import { DomainCardActions } from './domain-card/DomainCardActions'
import { DomainCardContent } from './domain-card/DomainCardContent'
import {
  DomainCardCollapseControl,
  DomainCardReorderControl,
  DomainCardSortControl,
} from './domain-card/DomainCardControls'
import { DomainCardHeader } from './domain-card/DomainCardHeader'
import { DomainCardRoot } from './domain-card/DomainCardRoot'
import { DomainCardTitle } from './domain-card/DomainCardTitle'

/**
 * ドメインごとのタブグループを表示するソート可能なカードコンポーネント
 * 複合コンポーネントパターンで構成される薄いラッパー
 * @param props SortableDomainCardProps & { settings: UserSettings }
 */
const SortableDomainCardComponent = ({
  group,
  handleOpenAllTabs,
  handleDeleteGroup,
  handleDeleteGroups,
  handleDeleteUrl,
  handleDeleteUrls,
  handleOpenTab,
  handleUpdateUrls,
  handleDeleteCategory,
  categoryId,
  isDraggingOver: _isDraggingOver,
  settings,
  isReorderMode = false,
  searchQuery = '',
}: SortableDomainCardProps & { settings: UserSettings }) => {
  const handlers = useMemo(
    () => ({
      handleDeleteGroup,
      handleDeleteGroups,
      handleDeleteUrl,
      handleDeleteUrls,
      handleOpenAllTabs,
      handleOpenTab,
      handleUpdateUrls,
    }),
    [
      handleOpenAllTabs,
      handleDeleteGroup,
      handleDeleteGroups,
      handleDeleteUrl,
      handleDeleteUrls,
      handleOpenTab,
      handleUpdateUrls,
    ],
  )

  return (
    <DomainCardRoot
      group={group}
      settings={settings}
      categoryId={categoryId}
      isReorderMode={isReorderMode}
      searchQuery={searchQuery}
      handlers={handlers}
      handleDeleteCategory={handleDeleteCategory}
    >
      <DomainCardHeader>
        <DomainCardCollapseControl />
        <DomainCardSortControl />
        <DomainCardTitle />
        <DomainCardReorderControl />
        <DomainCardActions />
      </DomainCardHeader>
      <DomainCardContent />
    </DomainCardRoot>
  )
}

export const SortableDomainCard = memo(SortableDomainCardComponent)
