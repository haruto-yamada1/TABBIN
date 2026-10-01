import { useDroppable } from '@dnd-kit/core'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useCallback, useEffect, useMemo } from 'react'
import type { CSSProperties } from 'react'

import { useDragHandlers } from '@/contexts/saved-tabs/presentation/components/DragHandlersContext'

import type { ProjectCardContextType } from './ProjectCardContext'

/** プロジェクトの sortable / drop 領域とハンドラの生存期間を管理する。 */
export const useProjectCardDragDrop = (
  project: ProjectCardContextType['project'],
  dnd: ProjectCardContextType['hookState']['dnd'],
) => {
  // プロジェクト全体をドラッグ可能にするためのsortable設定
  const {
    setNodeRef,
    transform,
    transition,
    isDragging,
    attributes,
    listeners,
  } = useSortable({
    data: {
      name: project.name,
      projectId: project.id,
      type: 'project',
    },
    id: project.id,
  })

  const DRAGGING_OPACITY = 0.5

  const style: CSSProperties = useMemo(
    () => ({
      containIntrinsicSize: '360px',
      contentVisibility: 'auto',
      opacity: isDragging ? DRAGGING_OPACITY : 1,
      transform: CSS.Transform.toString(transform),
      transition,
    }),
    [isDragging, transform, transition],
  )

  // このプロジェクトをドロップターゲットとして設定
  const { setNodeRef: setProjectDroppableRef, isOver: isProjectOver } =
    useDroppable({
      data: {
        projectId: project.id,
        type: 'project',
      },
      id: `project-${project.id}`,
    })

  const {
    setNodeRef: setProjectHeaderDroppableRef,
    isOver: isProjectHeaderOver,
  } = useDroppable({
    data: {
      projectId: project.id,
      type: 'project-header',
    },
    id: `project-header-${project.id}`,
  })

  // 未分類URLエリア用のドロップ領域
  const { setNodeRef: setUncategorizedDropRef, isOver: isUncategorizedOver } =
    useDroppable({
      data: {
        isDropArea: true,
        projectId: project.id,
        type: 'uncategorized',
      },
      id: `uncategorized-${project.id}`,
    })

  // 両方のrefを組み合わせる
  const setCombinedRefs = useCallback(
    (node: HTMLElement | null) => {
      setNodeRef(node)
      setProjectDroppableRef(node)
    },
    [setNodeRef, setProjectDroppableRef],
  )

  // ドラッグハンドラの登録
  const { registerHandlers, unregisterHandlers } = useDragHandlers()

  useEffect(() => {
    registerHandlers(project.id, {
      clearDragState: dnd.resetDnD,
      handleCategoryDragEnd: dnd.handleCategoryDragEnd,
      handleDragOver: dnd.handleDragOver,
      handleDragStart: dnd.handleDragStart,
      handleUrlDragEnd: dnd.handleUrlDragEnd,
    })
    return () => {
      unregisterHandlers(project.id)
    }
  }, [project.id, registerHandlers, unregisterHandlers, dnd])

  return {
    attributes,
    listeners,
    style,
    setCombinedRefs,
    setProjectHeaderDroppableRef,
    setUncategorizedDropRef,
    isUncategorizedOver,
    isProjectOver,
    isProjectHeaderOver,
  }
}
