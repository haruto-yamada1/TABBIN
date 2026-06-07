import { DragOverlay } from '@dnd-kit/core'

import { useI18n } from '@/features/i18n/context/I18nProvider'

import { useProjectCard } from './ProjectCardContext'

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

  const activeUrl = urls.projectUrls.find(
    (u) =>
      u.url === dnd.activeId?.id || u.url === dnd.activeId?.data?.current?.url,
  )

  if (!activeUrl) {
    return null
  }

  return (
    // eslint-disable-next-line react-perf/jsx-no-new-object-as-prop
    <DragOverlay style={{ pointerEvents: 'none' }}>
      <div className='rounded border bg-secondary p-2'>
        {activeUrl.title || t('sidebar.tabList')}
      </div>
    </DragOverlay>
  )
}
