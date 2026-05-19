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
import { SortableDomainCard } from '@/features/saved-tabs/components/SortableDomainCard'

import { useCategoryGroup } from './CategoryGroupContext'

/**
 * CategoryGroup の展開時コンテンツ
 * ドメインカード一覧を DndContext 付きで表示する
 * 折りたたみ時は何も表示しない
 */
export const CategoryGroupContent = () => {
  const { state, category, settings, searchQuery, handlers } =
    useCategoryGroup()
  const { collapse, sort, reorder } = state

  // DnDのセンサー設定
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  if (collapse.isCollapsed) {
    return null
  }

  const displayDomains = reorder.isReorderMode
    ? reorder.tempDomainOrder
    : sort.sortedDomains

  return (
    <CardContent>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={reorder.handleDragStart}
        onDragEnd={reorder.handleDragEnd}
      >
        <SortableContext
          items={displayDomains.map((domain) => domain.id)}
          strategy={verticalListSortingStrategy}
        >
          {displayDomains.map((group) => (
            <SortableDomainCard
              key={group.id}
              group={group}
              handleOpenAllTabs={handlers.handleOpenAllTabs}
              handleDeleteGroup={reorder.handleDeleteSingleDomain}
              handleDeleteUrl={handlers.handleDeleteUrl}
              handleDeleteUrls={handlers.handleDeleteUrls}
              handleOpenTab={handlers.handleOpenTab}
              handleUpdateUrls={handlers.handleUpdateUrls}
              handleDeleteCategory={handlers.handleDeleteCategory}
              categoryId={category.id}
              isDraggingOver={reorder.isDraggingDomains}
              settings={settings}
              isReorderMode={reorder.isReorderMode}
              searchQuery={searchQuery}
            />
          ))}
        </SortableContext>
      </DndContext>
    </CardContent>
  )
}
