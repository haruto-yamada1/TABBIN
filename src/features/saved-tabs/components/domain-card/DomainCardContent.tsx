/* eslint-disable react-perf/jsx-no-new-function-as-prop */
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

import { CardContent } from '@/components/ui/card'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import { SortableCategorySection } from '@/features/saved-tabs/components/SortableCategorySection'
import { CategorySection } from '@/features/saved-tabs/components/TimeRemaining'

import { useDomainCard } from './DomainCardContext'

/**
 * DomainCard の展開時コンテンツ
 * カテゴリセクション一覧を DndContext 付きで表示する
 * 折りたたみ時は何も表示しない
 */
export const DomainCardContent = () => {
  const { t } = useI18n()
  const { state, group, settings, categoryId, handlers } = useDomainCard()
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

  // eslint-disable-next-line typescript/prefer-nullish-coalescing
  const hasUrls = (group.urls?.length || 0) > 0
  const categoryIds = categoryReorder.isCategoryReorderMode
    ? categoryReorder.tempCategoryOrder
    : categoryReorder.allCategoryIds

  if (!hasUrls) {
    return (
      <CardContent className='gap-y-1'>
        <div className='py-4 text-center text-zinc-400'>
          {/* eslint-disable-next-line typescript/prefer-nullish-coalescing */}
          {(group.urls?.length || 0) === 0
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
          // eslint-disable-next-line react/jsx-handler-names
          handleDeleteUrl={handlers.handleDeleteUrl}
          // eslint-disable-next-line react/jsx-handler-names
          handleOpenTab={handlers.handleOpenTab}
          // eslint-disable-next-line react/jsx-handler-names
          handleUpdateUrls={handlers.handleUpdateUrls}
          // eslint-disable-next-line react/jsx-handler-names
          handleOpenAllTabs={handlers.handleOpenAllTabs}
          settings={settings}
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
            // eslint-disable-next-line react-perf/jsx-no-new-array-as-prop
            const urls = computed.categorizedUrls[categoryName] || []
            if (urls.length === 0) {
              return null
            }
            return (
              <SortableCategorySection
                key={categoryName}
                id={categoryName}
                categoryName={categoryName}
                urls={urls}
                groupId={group.id}
                // eslint-disable-next-line react/jsx-handler-names
                handleDeleteUrl={handlers.handleDeleteUrl}
                // eslint-disable-next-line react/jsx-handler-names
                handleOpenTab={handlers.handleOpenTab}
                // eslint-disable-next-line react/jsx-handler-names
                handleUpdateUrls={handlers.handleUpdateUrls}
                // eslint-disable-next-line react/jsx-handler-names
                handleOpenAllTabs={handlers.handleOpenAllTabs}
                // eslint-disable-next-line typescript/no-misused-promises
                handleDeleteAllTabs={(urls) =>
                  categoryActions.handleDeleteAllTabsInCategory(
                    categoryName,
                    urls,
                  )
                }
                settings={settings}
                stickyTop={categorySectionStickyTop}
                isReorderMode={categoryReorder.isCategoryReorderMode}
              />
            )
          })}
        </SortableContext>
      </DndContext>
    </CardContent>
  )
}
