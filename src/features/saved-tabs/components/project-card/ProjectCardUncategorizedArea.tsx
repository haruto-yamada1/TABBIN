import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'

import { Button } from '@/components/ui/button'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import { ProjectUrlItem } from '@/features/saved-tabs/components/ProjectUrlItem'

import { useProjectCard } from './ProjectCardContext'

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

  // 未分類URLがある場合
  if (urls.projectUrls.length > 0 && urls.uncategorizedUrls.length > 0) {
    return (
      <section
        className={`uncategorized-area uncategorized-drop-zone overflow-x-hidden px-4 ${
          isUncategorizedOver
            ? 'rounded border-2 border-primary bg-primary/10 shadow-sm'
            : 'rounded border border-dashed border-muted'
        }`}
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
          // eslint-disable-next-line react-perf/jsx-no-new-array-as-prop
          items={urls.uncategorizedUrls.map((item) => item.url)}
          strategy={verticalListSortingStrategy}
        >
          <ul
            className='uncategorized-area uncategorized-list space-y-2'
            data-type='uncategorized'
            data-parent-id={`uncategorized-${project.id}`}
            data-uncategorized-area='true'
            data-uncategorized-list='true'
            // eslint-disable-next-line react-perf/jsx-no-new-object-as-prop
            style={{ overflow: 'hidden' }}
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
        className={`uncategorized-area uncategorized-drop-zone uncategorized-empty mt-4 w-full cursor-pointer rounded border-2 border-dashed p-8 text-left ${
          isUncategorizedOver
            ? 'border-primary bg-primary/10 shadow-md'
            : 'border-muted hover:border-muted-foreground hover:bg-accent/5'
        }`}
        ref={setUncategorizedDropRef}
        id={`uncategorized-${project.id}`}
        data-type='uncategorized'
        data-project-id={project.id}
        data-is-drop-area='true'
        data-uncategorized-area='true'
        data-uncategorized-container='true'
        data-empty-container='true'
        aria-label={t('savedTabs.projectCard.dropToUncategorized')}
        // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
        onClick={() => {
          const selectedUrl = window.getSelection()?.toString()
          if (
            selectedUrl &&
            urls.projectUrls.some((u) => u.url === selectedUrl)
          ) {
            handlers.handleSetUrlCategory(project.id, selectedUrl, undefined)
          }
        }}
        type='button'
        variant='outline'
      >
        <div className='min-h-8' />
      </Button>
    )
  }

  return null
}
