import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useMemo } from 'react'

import { CustomProjectCategory } from '@/features/saved-tabs/components/CustomProjectCategory'

import { useProjectCard } from './ProjectCardContext'

/**
 * ProjectCard のカテゴリ表示部分
 * SortableContext でカテゴリの並び替えを提供する
 */
export const ProjectCardCategoryList = () => {
  const { hookState, project, settings, categoryOrder, handlers } =
    useProjectCard()
  const { urls, dnd } = hookState
  const categoryUrlsByName = useMemo(() => {
    const buckets = new Map<string, typeof urls.projectUrls>()
    for (const item of urls.projectUrls) {
      if (!item.category) {
        continue
      }
      const existing = buckets.get(item.category)
      if (existing) {
        existing.push(item)
        continue
      }
      buckets.set(item.category, [item])
    }
    return buckets
  }, [urls.projectUrls])

  if (project.categories.length === 0) {
    return null
  }

  return (
    <SortableContext
      items={categoryOrder}
      strategy={verticalListSortingStrategy}
    >
      {categoryOrder.map((categoryName) => (
        <div key={`${project.id}-${categoryName}`} className='mb-4'>
          <CustomProjectCategory
            projectId={project.id}
            category={categoryName}
            urls={categoryUrlsByName.get(categoryName) || []}
            handleOpenUrl={handlers.handleOpenUrl}
            handleDeleteUrl={handlers.handleDeleteUrl}
            handleDeleteUrlsFromProject={handlers.handleDeleteUrlsFromProject}
            handleDeleteCategory={handlers.handleDeleteCategory}
            handleSetUrlCategory={handlers.handleSetUrlCategory}
            handleAddCategory={handlers.handleAddCategory}
            handleRenameCategory={handlers.handleRenameCategory}
            settings={settings}
            handleOpenAllUrls={handlers.handleOpenAllUrls}
            dragData={{ type: 'category' }}
            isHighlighted={dnd.draggedOverCategory === categoryName}
            isDraggingCategory={dnd.isDraggingCategory}
            draggedCategoryName={dnd.draggedCategoryName}
            isCategoryReorder={dnd.isDraggingCategory}
          />
        </div>
      ))}
    </SortableContext>
  )
}
