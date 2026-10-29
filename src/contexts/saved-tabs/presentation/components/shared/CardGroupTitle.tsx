import type {
  DraggableAttributes,
  DraggableSyntheticListeners,
} from '@dnd-kit/core'
import { GripVertical } from 'lucide-react'

import { getTouchHandleListeners } from './touchDragHandle'

type CardGroupTitleProps = {
  title: string
  badges?: React.ReactNode
  sortableAttributes?: DraggableAttributes
  sortableListeners?: DraggableSyntheticListeners
  activatorRef?: ((node: HTMLElement | null) => void) | undefined
  className?: string
  touchHandleOnly?: boolean
}

/**
 * 汎用的なカードグループのタイトル部分
 * 並び替え用ハンドルとタイトル・バッジ等を表示する
 */
export const CardGroupTitle = ({
  title,
  badges,
  sortableAttributes,
  sortableListeners,
  activatorRef,
  className = '',
  touchHandleOnly = false,
}: CardGroupTitleProps) => (
  <div
    ref={activatorRef}
    data-testid='card-group-title'
    className={`flex w-full cursor-grab items-center gap-2 text-foreground hover:cursor-grab active:cursor-grabbing ${className}`}
    {...sortableAttributes}
    {...(touchHandleOnly
      ? getTouchHandleListeners(sortableListeners)
      : sortableListeners)}
  >
    <GripVertical
      size={16}
      aria-hidden='true'
      data-testid='drag-handle'
      data-saved-tabs-drag-handle='true'
      className={`shrink-0 text-muted-foreground ${touchHandleOnly ? 'touch-none' : ''}`}
    />
    <div className='flex min-w-0 items-center gap-2'>
      <h2 className='truncate text-xl font-semibold text-foreground'>
        {title}
      </h2>
      {badges && (
        <span className='flex shrink-0 gap-2 text-muted-foreground'>
          {badges}
        </span>
      )}
    </div>
  </div>
)
