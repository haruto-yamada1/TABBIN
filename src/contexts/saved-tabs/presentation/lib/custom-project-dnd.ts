import type {
  Active,
  CollisionDetection,
  KeyboardCoordinateGetter,
} from '@dnd-kit/core'
import { closestCenter, pointerWithin } from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'

type Container =
  Parameters<CollisionDetection>[0]['droppableContainers'][number]
type DragData = { type?: string; projectId?: string; category?: string }

const dragData = (value: unknown): DragData => {
  if (!value || typeof value !== 'object') {
    return {}
  }
  const type: unknown = Reflect.get(value, 'type')
  const projectId: unknown = Reflect.get(value, 'projectId')
  const category: unknown = Reflect.get(value, 'category')
  return {
    ...(typeof type === 'string' ? { type } : {}),
    ...(typeof projectId === 'string' ? { projectId } : {}),
    ...(typeof category === 'string' ? { category } : {}),
  }
}

export const isCustomProjectDropTarget = (
  active: Active,
  target: Container,
): boolean => {
  const source = dragData(active.data.current)
  const destination = dragData(target.data.current)
  if (source.type === 'project') {
    return destination.type === 'project' && target.id === destination.projectId
  }
  if (source.type === 'category') {
    return (
      destination.type === 'category' &&
      destination.projectId === source.projectId &&
      target.data.current?.isDropArea !== true
    )
  }
  if (source.type === 'url') {
    return (
      destination.type === 'url' ||
      destination.type === 'uncategorized' ||
      (destination.type === 'category' &&
        target.data.current?.isDropArea !== true) ||
      (destination.type === 'project-header' &&
        destination.projectId !== source.projectId)
    )
  }
  return false
}

export const customProjectCollisionDetection: CollisionDetection = (args) => {
  const droppableContainers = args.droppableContainers.filter((target) =>
    isCustomProjectDropTarget(args.active, target),
  )
  // Nested cards overlap their URL rows. An actual pointer over a row should
  // retain the row as its reorder/category target instead of the parent card.
  if (
    args.pointerCoordinates &&
    dragData(args.active.data.current).type === 'url'
  ) {
    const urlCollisions = pointerWithin({
      ...args,
      droppableContainers: droppableContainers.filter(
        (target) => dragData(target.data.current).type === 'url',
      ),
    })
    if (urlCollisions.length > 0) {
      return urlCollisions
    }
    const areaCollisions = pointerWithin({ ...args, droppableContainers })
    if (areaCollisions.length > 0) {
      return areaCollisions
    }
  }
  return closestCenter({ ...args, droppableContainers })
}

export const customProjectKeyboardCoordinates: KeyboardCoordinateGetter = (
  event,
  args,
) => {
  const { active, collisionRect, droppableContainers, droppableRects } =
    args.context
  if (!active || !collisionRect) {
    return
  }
  const targets = droppableContainers
    .getEnabled()
    .filter((target) => isCustomProjectDropTarget(active, target))
  const source = dragData(active.data.current)
  const isVertical = event.code === 'ArrowUp' || event.code === 'ArrowDown'
  const bucketTargets =
    source.type === 'url' && isVertical
      ? targets.filter((target) => {
          const destination = dragData(target.data.current)
          const rect = droppableRects.get(target.id)
          return (
            destination.type === 'url' &&
            destination.projectId === source.projectId &&
            destination.category === source.category &&
            rect !== undefined &&
            (event.code === 'ArrowDown'
              ? rect.top > collisionRect.top
              : rect.top < collisionRect.top)
          )
        })
      : []
  const targetIds = new Set(
    (bucketTargets.length > 0 ? bucketTargets : targets).map(
      (target) => target.id,
    ),
  )
  // Preserve sortable's scrolling and geometry handling while preventing it
  // from selecting parent project cards or another sortable hierarchy.
  return sortableKeyboardCoordinates(event, {
    ...args,
    context: {
      ...args.context,
      droppableRects: new Map(
        [...droppableRects].filter(
          ([id]) => targetIds.has(id) || id === active.id,
        ),
      ),
    },
  })
}

export const getProjectCategorySortableId = (
  projectId: string,
  category: string,
) => JSON.stringify(['project-category', projectId, category])
export const getProjectUrlSortableId = (projectId: string, url: string) =>
  JSON.stringify(['project-url', projectId, url])
