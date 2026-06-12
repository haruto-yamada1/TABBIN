import type { DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/core'
import { createContext, use } from 'react'

export interface ProjectDragHandlers {
  handleDragStart: (event: DragStartEvent) => void
  handleDragOver: (event: DragOverEvent, project: { id: string }) => void
  handleCategoryDragEnd: (event: DragEndEvent) => void
  handleUrlDragEnd: (event: DragEndEvent, isUncategorizedOver: boolean) => void
  clearDragState: () => void
}

export interface DragHandlersContextType {
  registerHandlers: (projectId: string, handlers: ProjectDragHandlers) => void
  unregisterHandlers: (projectId: string) => void
}

export const DragHandlersContext =
  createContext<DragHandlersContextType | null>(null)

export const useDragHandlers = () => {
  const context = use(DragHandlersContext)
  if (!context) {
    throw new Error(
      'useDragHandlers must be used within a DragHandlersContextProvider',
    )
  }
  return context
}
