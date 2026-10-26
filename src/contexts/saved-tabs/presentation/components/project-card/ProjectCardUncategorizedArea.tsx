import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useCallback, useMemo } from 'react'

import { Button } from '@/components/ui/button'
import { ProjectUrlItem } from '@/contexts/saved-tabs/presentation/components/ProjectUrlItem'
import { useDropTargetFeedback } from '@/contexts/saved-tabs/presentation/hooks/useDropTargetFeedback'
import { getProjectUrlSortableId } from '@/contexts/saved-tabs/presentation/lib/custom-project-dnd'
import { useI18n } from '@/features/i18n/context/I18nProvider'

import { useProjectCard } from './ProjectCardContext'

const HIDDEN_OVERFLOW_STYLE = { overflow: 'hidden' }

/**
 * ProjectCard の未分類URLエリア
 * 未分類URLの一覧表示と空のドロップゾーンを含む
 */
export const ProjectCardUncategorizedArea = () => {
  const { t } = useI18n()
  const {
    hookState,
    project,
    settings,
    isUncategorizedOver,
    setUncategorizedDropRef,
    handlers,
  } = useProjectCard()
  const { urls } = hookState
  const feedback = useDropTargetFeedback({
    id: `uncategorized-${project.id}`,
    accepts: 'custom',
    isOver: isUncategorizedOver,
  })

  const uncategorizedItemIds = useMemo(
    () =>
      urls.uncategorizedUrls.map((item) =>
        getProjectUrlSortableId(project.id, item.url),
      ),
    [project.id, urls.uncategorizedUrls],
  )

  const handleEmptyDropClick = useCallback(() => {
    const selectedUrl = window.getSelection()?.toString()
    if (selectedUrl && urls.projectUrls.some((u) => u.url === selectedUrl)) {
      void Promise.resolve()
        .then(async () => {
          await handlers.handleSetUrlCategory(
            project.id,
            selectedUrl,
            undefined,
          )
        })
        .catch((error: unknown) => {
          console.error('未分類への移動に失敗しました:', error)
        })
    }
  }, [urls.projectUrls, handlers, project.id])

  // 未分類URLがある場合
  if (urls.projectUrls.length > 0 && urls.uncategorizedUrls.length > 0) {
    return (
      <section
        className={`uncategorized-area uncategorized-drop-zone overflow-x-hidden rounded border border-dashed border-muted px-4 ${feedback.className}`}
        data-drop-state={feedback.state}
        ref={setUncategorizedDropRef}
        id={`uncategorized-${project.id}`}
        data-type='uncategorized'
        data-project-id={project.id}
        data-is-drop-area='true'
        data-uncategorized-area='true'
        data-uncategorized-container='true'
        aria-label={t('savedTabs.projectCard.uncategorizedArea')}
      >
        {project.categories.length > 0 && (
          <h3
            className='uncategorized-heading text-md mb-2 px-2 font-semibold'
            data-type='uncategorized'
            data-uncategorized-area='true'
          >
            {t('savedTabs.projectCard.uncategorizedTitle')}
          </h3>
        )}

        <SortableContext
          items={uncategorizedItemIds}
          strategy={verticalListSortingStrategy}
        >
          <ul
            className='uncategorized-area uncategorized-list space-y-2'
            data-type='uncategorized'
            data-parent-id={`uncategorized-${project.id}`}
            data-uncategorized-area='true'
            data-uncategorized-list='true'
            style={HIDDEN_OVERFLOW_STYLE}
          >
            {urls.uncategorizedUrls.map((item) => (
              <ProjectUrlItem
                key={item.url}
                item={item}
                projectId={project.id}
                // eslint-disable-next-line react/jsx-handler-names
                handleOpenUrl={handlers.handleOpenUrl}
                // eslint-disable-next-line react/jsx-handler-names
                handleDeleteUrl={handlers.handleDeleteUrl}
                // eslint-disable-next-line react/jsx-handler-names
                handleSetCategory={handlers.handleSetUrlCategory}
                isInUncategorizedArea
                parentType='uncategorized'
                settings={settings}
              />
            ))}
          </ul>
        </SortableContext>
      </section>
    )
  }

  // 空の未分類エリア（ドロップ可能）
  if (
    urls.projectUrls.length > 0 &&
    urls.uncategorizedUrls.length === 0 &&
    project.categories.length > 0
  ) {
    return (
      <Button
        className={`uncategorized-area uncategorized-drop-zone uncategorized-empty mt-4 w-full cursor-pointer rounded border-2 border-dashed border-muted p-8 text-left hover:border-muted-foreground hover:bg-accent/5 ${feedback.className}`}
        data-drop-state={feedback.state}
        ref={setUncategorizedDropRef}
        id={`uncategorized-${project.id}`}
        data-type='uncategorized'
        data-project-id={project.id}
        data-is-drop-area='true'
        data-uncategorized-area='true'
        data-uncategorized-container='true'
        data-empty-container='true'
        aria-label={t('savedTabs.projectCard.dropToUncategorized')}
        onClick={handleEmptyDropClick}
        type='button'
        variant='outline'
      >
        <span className='block min-h-8' />
      </Button>
    )
  }

  return null
}
