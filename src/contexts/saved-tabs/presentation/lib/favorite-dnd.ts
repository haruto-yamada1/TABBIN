import type {
  CollisionDetection,
  KeyboardCoordinateGetter,
} from '@dnd-kit/core'
import { closestCenter } from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'

/** Keep pointer and keyboard reorder targets in the active favorite bucket. */
export const favoriteUrlCollisionDetection: CollisionDetection = (args) => {
  const collisions = closestCenter(args)
  const target = args.droppableContainers.find(
    (item) => item.id === collisions[0]?.id,
  )
  return target &&
    Boolean(args.active.data.current?.isFavorite) ===
      Boolean(target.data.current?.isFavorite)
    ? collisions.slice(0, 1)
    : []
}

export const favoriteUrlKeyboardCoordinates: KeyboardCoordinateGetter = (
  event,
  args,
) => {
  const { active, droppableRects, droppableContainers } = args.context
  if (!active) {
    return
  }
  const ids = new Set(
    droppableContainers
      .getEnabled()
      .filter(
        (target) =>
          Boolean(active.data.current?.isFavorite) ===
          Boolean(target.data.current?.isFavorite),
      )
      .map((target) => target.id),
  )
  return sortableKeyboardCoordinates(event, {
    ...args,
    context: {
      ...args.context,
      droppableRects: new Map(
        [...droppableRects].filter(([id]) => ids.has(id)),
      ),
    },
  })
}
