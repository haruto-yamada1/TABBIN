import type { DraggableAttributes } from '@dnd-kit/core'
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities'
import { GripVertical } from 'lucide-react'

interface CardGroupTitleProps {
  title: string
  badges?: React.ReactNode
  sortableAttributes?: DraggableAttributes
  sortableListeners?: SyntheticListenerMap
  className?: string
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
  className = '',
}: CardGroupTitleProps) => (
  <div
    className={`flex w-full cursor-grab items-center gap-2 text-foreground hover:cursor-grab active:cursor-grabbing ${className}`}
    {...sortableAttributes}
    {...sortableListeners}
  >
    <GripVertical
      size={16}
      aria-hidden='true'
      className='shrink-0 text-muted-foreground'
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
