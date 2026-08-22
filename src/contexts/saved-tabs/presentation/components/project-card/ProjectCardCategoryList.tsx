import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useMemo } from 'react'

import { CustomProjectCategory } from '@/contexts/saved-tabs/presentation/components/CustomProjectCategory'
import type { CustomProjectCategoryProps } from '@/contexts/saved-tabs/presentation/types/CustomProjectCategory.types'

import { useProjectCard } from './ProjectCardContext'

const EMPTY_CATEGORY_URLS: NonNullable<CustomProjectCategoryProps['urls']> = []

const CATEGORY_DRAG_DATA = { type: 'category' }

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
            urls={categoryUrlsByName.get(categoryName) ?? EMPTY_CATEGORY_URLS}
            // eslint-disable-next-line react/jsx-handler-names
            handleOpenUrl={handlers.handleOpenUrl}
            // eslint-disable-next-line react/jsx-handler-names
            handleDeleteUrl={handlers.handleDeleteUrl}
            // eslint-disable-next-line react/jsx-handler-names
            {...(handlers.handleDeleteUrlsFromProject !== undefined
              ? {
                  handleDeleteUrlsFromProject:
                    handlers.handleDeleteUrlsFromProject,
                }
              : {})}
            // eslint-disable-next-line react/jsx-handler-names
            handleDeleteCategory={handlers.handleDeleteCategory}
            // eslint-disable-next-line react/jsx-handler-names
            handleSetUrlCategory={handlers.handleSetUrlCategory}
            // eslint-disable-next-line react/jsx-handler-names
            handleAddCategory={handlers.handleAddCategory}
            // eslint-disable-next-line react/jsx-handler-names
            {...(handlers.handleRenameCategory !== undefined
              ? { handleRenameCategory: handlers.handleRenameCategory }
              : {})}
            settings={settings}
            // eslint-disable-next-line react/jsx-handler-names
            {...(handlers.handleOpenAllUrls !== undefined
              ? { handleOpenAllUrls: handlers.handleOpenAllUrls }
              : {})}
            dragData={CATEGORY_DRAG_DATA}
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
