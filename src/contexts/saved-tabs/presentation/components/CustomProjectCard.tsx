import { memo } from 'react'

import type { CustomProjectCardProps } from '../types/CustomProjectCard.types'
import { ProjectCardCategoryList } from './project-card/ProjectCardCategoryList'
import { ProjectCardDragOverlay } from './project-card/ProjectCardDragOverlay'
import { ProjectCardRoot } from './project-card/ProjectCardRoot'
import { ProjectCardUncategorizedArea } from './project-card/ProjectCardUncategorizedArea'

/**
 * カスタムプロジェクトカードコンポーネント
 * 複合コンポーネントパターンで構成される薄いラッパー
 * @param props CustomProjectCardProps
 */
const CustomProjectCard = memo(
  ({
    project,
    handleOpenUrl,
    handleDeleteUrl,
    handleDeleteUrlsFromProject,
    handleAddCategory,
    handleDeleteCategory,
    handleRenameCategory,
    handleSetUrlCategory,
    handleUpdateCategoryOrder,
    handleReorderUrls,
    handleOpenAllUrls,
    handleDeleteProject,
    handleRenameProject,
    handleUpdateProjectKeywords,
    settings,
    draggedItem,
    isDropTarget = false,
    isProjectReorderMode = false,
    isCrossProjectUrlDragActive = false,
  }: CustomProjectCardProps) => (
    <ProjectCardRoot
      project={project}
      settings={settings}
      draggedItem={draggedItem}
      isDropTarget={isDropTarget}
      isProjectReorderMode={isProjectReorderMode}
      isCrossProjectUrlDragActive={isCrossProjectUrlDragActive}
      // eslint-disable-next-line react-perf/jsx-no-new-object-as-prop
      handlers={{
        handleAddCategory,
        handleDeleteCategory,
        handleDeleteProject,
        handleDeleteUrl,
        handleDeleteUrlsFromProject,
        handleOpenAllUrls,
        handleOpenUrl,
        handleRenameCategory,
        handleRenameProject,
        handleSetUrlCategory,
        handleUpdateProjectKeywords,
      }}
      // eslint-disable-next-line react-perf/jsx-no-new-object-as-prop
      hookHandlers={{
        handleDeleteUrl,
        handleReorderUrls,
        handleSetUrlCategory,
        handleUpdateCategoryOrder,
      }}
    >
      <ProjectCardCategoryList />
      <ProjectCardUncategorizedArea />
      <ProjectCardDragOverlay />
    </ProjectCardRoot>
  ),
)

CustomProjectCard.displayName = 'CustomProjectCard'

export { CustomProjectCard }
