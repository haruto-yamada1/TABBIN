import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { useCallback } from 'react'

import { CardContent } from '@/components/ui/card'
import type {
  SavedTabsTabGroupDto as TabGroup,
  SavedTabsUserSettingsDto as UserSettingsDto,
} from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'
import type { ReorderTabGroupUrlsUseCase } from '@/contexts/saved-tabs/application/use-cases/ReorderTabGroupUrlsUseCase'
import { SortableCategorySection } from '@/contexts/saved-tabs/presentation/components/SortableCategorySection'
import { CategorySection } from '@/contexts/saved-tabs/presentation/components/TimeRemaining'
import { useI18n } from '@/features/i18n/context/I18nProvider'

import { useDomainCard } from './DomainCardContext'

/* eslint-disable react/jsx-handler-names -- handlers from context use handle* naming */
const EMPTY_CATEGORY_URLS: TabGroup['urls'] = []

type CategorySectionItemProps = {
  categoryName: string
  urls: TabGroup['urls']
  groupId: string
  handleDeleteUrl: (groupId: string, url: string) => void
  handleOpenTab: (url: string) => void
  handleUpdateUrls: (groupId: string, updatedUrls: TabGroup['urls']) => void
  handleOpenAllTabs: (urls: { url: string; title: string }[]) => void
  handleDeleteAllTabsInCategory: (
    categoryName: string,
    urls: { url: string }[],
  ) => void
  settings: UserSettingsDto
  stickyTop: string
  isCategoryReorderMode: boolean
  reorderTabGroupUrlsUseCase: ReorderTabGroupUrlsUseCase
}

const CategorySectionItem = ({
  categoryName,
  urls,
  groupId,
  handleDeleteUrl,
  handleOpenTab,
  handleUpdateUrls,
  handleOpenAllTabs,
  handleDeleteAllTabsInCategory,
  settings,
  stickyTop,
  isCategoryReorderMode,
  reorderTabGroupUrlsUseCase,
}: CategorySectionItemProps) => {
  const handleDeleteAllTabs = useCallback(
    (deleteUrls: { url: string }[]) => {
      handleDeleteAllTabsInCategory(categoryName, deleteUrls)
    },
    [handleDeleteAllTabsInCategory, categoryName],
  )

  return (
    <SortableCategorySection
      id={categoryName}
      categoryName={categoryName}
      urls={urls}
      groupId={groupId}
      handleDeleteUrl={handleDeleteUrl}
      handleOpenTab={handleOpenTab}
      handleUpdateUrls={handleUpdateUrls}
      handleOpenAllTabs={handleOpenAllTabs}
      handleDeleteAllTabs={handleDeleteAllTabs}
      settings={settings}
      stickyTop={stickyTop}
      isReorderMode={isCategoryReorderMode}
      reorderTabGroupUrlsUseCase={reorderTabGroupUrlsUseCase}
    />
  )
}

/**
 * DomainCard の展開時コンテンツ
 * カテゴリセクション一覧を DndContext 付きで表示する
 * 折りたたみ時は何も表示しない
 */
export const DomainCardContent = () => {
  const { t } = useI18n()
  const {
    state,
    group,
    settings,
    categoryId,
    handlers,
    reorderTabGroupUrlsUseCase,
  } = useDomainCard()
  const { collapse, categoryReorder, computed, categoryActions } = state

  // DnDのセンサー設定
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  // 親カテゴリの有無に応じてsticky位置を動的に設定
  const categorySectionStickyTop = categoryId ? 'top-20' : 'top-18'

  if (collapse.isCollapsed) {
    return null
  }

  const hasUrls = (group.urls?.length ?? 0) > 0
  const categoryIds = categoryReorder.isCategoryReorderMode
    ? categoryReorder.tempCategoryOrder
    : categoryReorder.allCategoryIds

  if (!hasUrls) {
    return (
      <CardContent className='gap-y-1'>
        <div className='py-4 text-center text-zinc-400'>
          {(group.urls?.length ?? 0) === 0
            ? t('savedTabs.domain.emptyNoTabs')
            : t('savedTabs.domain.emptyManageCategoriesHint')}
        </div>
      </CardContent>
    )
  }

  if (categoryReorder.allCategoryIds.length <= 1) {
    const singleCategoryName =
      categoryReorder.allCategoryIds[0] ?? '__uncategorized'
    return (
      <CardContent className='gap-y-1'>
        <CategorySection
          categoryName={singleCategoryName}
          urls={computed.categorizedUrls[singleCategoryName]}
          groupId={group.id}
          handleDeleteUrl={handlers.handleDeleteUrl}
          handleOpenTab={handlers.handleOpenTab}
          handleUpdateUrls={handlers.handleUpdateUrls}
          handleOpenAllTabs={handlers.handleOpenAllTabs}
          settings={settings}
          reorderTabGroupUrlsUseCase={reorderTabGroupUrlsUseCase}
        />
      </CardContent>
    )
  }

  return (
    <CardContent className='gap-y-1'>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={categoryReorder.handleCategoryDragEnd}
      >
        <SortableContext
          items={categoryIds}
          strategy={verticalListSortingStrategy}
        >
          {categoryIds.map((categoryName) => {
            const urls =
              computed.categorizedUrls[categoryName] ?? EMPTY_CATEGORY_URLS
            if (urls.length === 0) {
              return null
            }
            return (
              <CategorySectionItem
                key={categoryName}
                categoryName={categoryName}
                urls={urls}
                groupId={group.id}
                handleDeleteUrl={handlers.handleDeleteUrl}
                handleOpenTab={handlers.handleOpenTab}
                handleUpdateUrls={handlers.handleUpdateUrls}
                handleOpenAllTabs={handlers.handleOpenAllTabs}
                // eslint-disable-next-line typescript/no-misused-promises
                handleDeleteAllTabsInCategory={
                  categoryActions.handleDeleteAllTabsInCategory
                }
                settings={settings}
                stickyTop={categorySectionStickyTop}
                isCategoryReorderMode={categoryReorder.isCategoryReorderMode}
                reorderTabGroupUrlsUseCase={reorderTabGroupUrlsUseCase}
              />
            )
          })}
        </SortableContext>
      </DndContext>
    </CardContent>
  )
}
