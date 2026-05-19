import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { CSSProperties } from 'react'

export const useSortableCategoryDrag = (id: string) => {
  const sortable = useSortable({
    data: {
      type: 'category-section',
    },
    id,
  })
  const { transform, transition, isDragging } = sortable

  const style: CSSProperties = {
    opacity: isDragging ? 0.8 : 1,
    position: isDragging ? 'relative' : 'static',
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 100 : 'auto',
  }

  return { ...sortable, style }
}
