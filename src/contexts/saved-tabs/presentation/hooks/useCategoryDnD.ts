import type { Active, DragOverEvent, DragStartEvent } from '@dnd-kit/core'
// Filepath: contexts/saved-tabs/presentation/hooks/useCategoryDnD.ts
import { useState } from 'react'

const MIN_ID_PARTS = 4
const CATEGORY_NAME_START_INDEX = 3

const parseCategoryNameFromOverId = (overId: string): string | undefined => {
  const parts = overId.split('-')
  if (parts.length < MIN_ID_PARTS) {
    return undefined
  }
  return parts.slice(CATEGORY_NAME_START_INDEX).join('-')
}
const isUncategorizedDrop = (
  over: DragOverEvent['over'],
  projectId: string,
): boolean =>
  over?.id === `uncategorized-${projectId}` ||
  (typeof over?.id === 'string' && over.id.includes('uncategorized')) ||
  over?.data?.current?.type === 'uncategorized'
const isCategoryOver = (
  overData: {
    type?: string
    isCategory?: boolean
    isDropArea?: boolean
    categoryName?: string
  },
  overId: string | number | null,
): boolean =>
  overData.type === 'category' ||
  overData.isCategory === true ||
  overData.isDropArea === true ||
  (typeof overId === 'string' &&
    (overId.startsWith('category-drop-') || overId.includes('category')))

const resolveOverCategoryName = (
  over: DragOverEvent['over'],
): string | null => {
  if (!over?.data?.current) {
    return null
  }
  const overData = over.data.current
  if (overData.type === 'uncategorized') {
    return null
  }
  if (
    overData.type === 'url' &&
    typeof overData.category === 'string' &&
    overData.category.length > 0
  ) {
    return overData.category
  }
  if (!isCategoryOver(overData, over.id)) {
    return null
  }
  if (overData.categoryName) {
    return overData.categoryName // eslint-disable-line typescript/no-unsafe-return
  }
  if (typeof over.id === 'string') {
    return parseCategoryNameFromOverId(over.id) ?? null
  }
  return null
}

/**
 * カテゴリ・URLのドラッグ＆ドロップ状態管理用カスタムフック
 */
export const useCategoryDnD = () => {
  // ドラッグ中のカテゴリ名
  const [isDraggingCategory, setIsDraggingCategory] = useState(false)
  const [draggedCategoryName, setDraggedCategoryName] = useState<string | null>(
    null,
  )
  const [activeId, setActiveId] = useState<Active | null>(null)
  const [draggedOverCategory, setDraggedOverCategory] = useState<string | null>(
    null,
  )

  // ドラッグ開始
  const handleDragStart = (event: DragStartEvent) => {
    // eslint-disable-next-line typescript/no-unsafe-assignment
    const itemType = event.active.data.current?.type
    const itemId = event.active.id
    if (itemType === 'category') {
      setActiveId(event.active)
      setDraggedOverCategory(null)
      setIsDraggingCategory(true)
      setDraggedCategoryName(String(itemId))
      return
    }

    // URLドラッグ開始時は不要な再レンダーを避ける
    setActiveId((prev) => (prev === null ? prev : null))
    setDraggedOverCategory((prev) => (prev === null ? prev : null))
    setIsDraggingCategory((prev) => (prev ? false : prev))
    setDraggedCategoryName((prev) => (prev === null ? prev : null))
  }

  // ドラッグ中
  const handleDragOver = (
    event: DragOverEvent,
    project: {
      id: string
    },
  ) => {
    const { over } = event

    // 他のプロジェクト上のドラッグであれば、ハイライトを解除する
    // eslint-disable-next-line typescript/no-unsafe-assignment
    const overProjectId = over?.data?.current?.projectId
    if (overProjectId && overProjectId !== project.id) {
      setDraggedOverCategory(null)
      return
    }

    const nextCategoryName = isUncategorizedDrop(over, project.id)
      ? null
      : resolveOverCategoryName(over)
    setDraggedOverCategory((prev) =>
      prev === nextCategoryName ? prev : nextCategoryName,
    )
  }

  // ドラッグ終了
  const resetDnD = () => {
    setIsDraggingCategory(false)
    setActiveId(null)
    setDraggedCategoryName(null)
    setDraggedOverCategory(null)
  }
  return {
    activeId,
    draggedCategoryName,
    draggedOverCategory,
    handleDragOver,
    handleDragStart,
    isDraggingCategory,
    resetDnD,
    setActiveId,
    setDraggedOverCategory,
  }
}
