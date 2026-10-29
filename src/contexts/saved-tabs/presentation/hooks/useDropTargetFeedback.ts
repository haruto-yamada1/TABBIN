import type { Over, UniqueIdentifier } from '@dnd-kit/core'
import { useDndContext } from '@dnd-kit/core'

import { isCustomProjectDropTarget } from '@/contexts/saved-tabs/presentation/lib/custom-project-dnd'

const feedbackClasses = {
  idle: '',
  source: 'opacity-50',
  available:
    'outline outline-1 -outline-offset-1 outline-dashed outline-primary/60',
  over: 'outline outline-2 -outline-offset-2 outline-solid outline-primary bg-primary/10',
  unavailable:
    'outline outline-1 -outline-offset-1 outline-dotted outline-muted-foreground/40',
}

type DropTargetState = keyof typeof feedbackClasses

// Pointer collisions prefer URL rows over their enclosing drop area.
const isUncategorizedRowTarget = (
  target: Pick<Over, 'data'> | undefined,
  over: Over | null,
) =>
  target?.data.current?.type === 'uncategorized' &&
  over?.data.current?.type === 'url' &&
  over.data.current.projectId === target.data.current.projectId &&
  !over.data.current.category

/** Match visual candidates to the active DnD scope without changing geometry. */
export const useDropTargetFeedback = ({
  id,
  accepts,
  isOver,
}: {
  id: UniqueIdentifier
  accepts: 'custom' | 'parent-category' | 'category-section'
  isOver?: boolean
}) => {
  const { active, over, droppableContainers } = useDndContext()
  const target = droppableContainers.get(id)
  let state: DropTargetState = 'idle'
  if (active) {
    const canDrop =
      accepts === 'custom'
        ? target !== undefined &&
          !target.disabled &&
          isCustomProjectDropTarget(active, target)
        : active.data.current?.type === accepts
    if (active.id === id) {
      state = 'source'
    } else if (!canDrop) {
      state = 'unavailable'
    } else {
      state =
        isOver === true ||
        over?.id === id ||
        (accepts === 'custom' && isUncategorizedRowTarget(target, over))
          ? 'over'
          : 'available'
    }
  }
  return { state, className: feedbackClasses[state] }
}
