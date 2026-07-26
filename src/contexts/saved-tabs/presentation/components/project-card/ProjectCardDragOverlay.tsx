import { DragOverlay } from '@dnd-kit/core'
import type { CSSProperties } from 'react'

import { useI18n } from '@/features/i18n/context/I18nProvider'

import { useProjectCard } from './ProjectCardContext'

const DRAG_OVERLAY_STYLE: CSSProperties = { pointerEvents: 'none' }

/**
 * ProjectCard のドラッグ中オーバーレイ
 * ドラッグ中のアイテムを半透明で表示する
 */
export const ProjectCardDragOverlay = () => {
  const { t } = useI18n()
  const { hookState } = useProjectCard()
  const { urls, dnd } = hookState

  if (!dnd.activeId) {
    return null
  }
  const activeId = dnd.activeId

  const activeUrl = urls.projectUrls.find(
    (u) => u.url === activeId.id || u.url === activeId.data.current?.url,
  )

  if (!activeUrl) {
    return null
  }

  return (
    <DragOverlay style={DRAG_OVERLAY_STYLE}>
      <div className='rounded border bg-secondary p-2'>
        {activeUrl.title || t('sidebar.tabList')}
      </div>
    </DragOverlay>
  )
}
