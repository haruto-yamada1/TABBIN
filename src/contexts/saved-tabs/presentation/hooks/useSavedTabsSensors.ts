import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { KeyboardCoordinateGetter } from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'

import { useReducedMotion } from '@/hooks/useReducedMotion'

export const useSavedTabsSensors = (
  coordinateGetter: KeyboardCoordinateGetter = sortableKeyboardCoordinates,
) => {
  const reducedMotion = useReducedMotion()
  return useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter,
      scrollBehavior: reducedMotion ? 'instant' : 'smooth',
    }),
  )
}
