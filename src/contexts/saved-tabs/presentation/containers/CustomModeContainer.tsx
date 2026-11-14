import { LoadingState } from '@/components/ui/loading-state'
import type { GetProjectUrlsUseCase } from '@/contexts/saved-tabs/application/use-cases/GetProjectUrlsUseCase'
import { CustomProjectSection } from '@/contexts/saved-tabs/presentation/components/CustomProjectSection'
import { OpenTabsSection } from '@/contexts/saved-tabs/presentation/components/OpenTabsSection'
import { SavedTabsSelectionProvider } from '@/contexts/saved-tabs/presentation/components/selection/SavedTabsSelectionProvider'
import type { SavedTabSelectionItem } from '@/contexts/saved-tabs/presentation/components/selection/SavedTabsSelectionProvider'
import { useCustomOpenTabsRows } from '@/contexts/saved-tabs/presentation/controllers/useCustomOpenTabsRows'
import type {
  SavedTabsCustomProjectDto as CustomProject,
  SavedTabsProjectKeywordSettingsDto as ProjectKeywordSettings,
  SavedTabsUserSettingsDto as UserSettingsDto,
} from '@/contexts/saved-tabs/presentation/types/SavedTabsCompatibilityViewModel'

type CustomModeContainerProps = {
  isLoading: boolean
  projects: CustomProject[]
  settings: UserSettingsDto
  handleOpenUrl: (url: string) => Promise<void>
  handleDeleteUrl: (projectId: string, url: string) => Promise<void>
  handleDeleteUrlsFromProject: (
    projectId: string,
    urls: string[],
  ) => Promise<void>
  handleAddUrl: (projectId: string, url: string, title: string) => Promise<void>
  handleCreateProject: (name: string) => Promise<void>
  handleDeleteProject: (projectId: string) => Promise<void>
  handleRenameProject: (projectId: string, newName: string) => Promise<void>
  handleUpdateProjectKeywords: (
    projectId: string,
    projectKeywords: ProjectKeywordSettings,
  ) => Promise<void>
  handleAddCategory: (projectId: string, categoryName: string) => Promise<void>
  handleDeleteCategory: (
    projectId: string,
    categoryName: string,
  ) => Promise<void>
  handleSetUrlCategory: (
    projectId: string,
    url: string,
    category?: string,
  ) => Promise<void>
  handleUpdateCategoryOrder: (
    projectId: string,
    newOrder: string[],
  ) => Promise<void>
  handleReorderUrls: (
    projectId: string,
    urls: CustomProject['urls'],
  ) => Promise<void>
  handleOpenAllUrls: (urls: { url: string; title: string }[]) => Promise<void>
  /** 選択した行を一括削除する。未指定のときは選択 UI を出さない。 */
  handleDeleteSelectedUrls?: (items: SavedTabSelectionItem[]) => Promise<void>
  handleMoveUrlBetweenProjects: (
    sourceProjectId: string,
    targetProjectId: string,
    url: string,
  ) => Promise<string | null>
  handleMoveUrlsBetweenCategories: (
    projectId: string,
    sourceCategoryName: string,
    targetCategoryName: string,
  ) => Promise<void>
  handleReorderProjects: (newOrder: string[]) => Promise<void>
  handleRenameCategory: (
    projectId: string,
    oldCategoryName: string,
    newCategoryName: string,
  ) => Promise<void>
  getProjectUrlsUseCase: GetProjectUrlsUseCase
  /** 検索入力中は行の部分的なすり抜けを避けるためセクションを出さない。 */
  searchQuery: string
}

export const CustomModeContainer = ({
  isLoading,
  projects,
  settings,
  handleOpenUrl,
  handleDeleteUrl,
  handleDeleteUrlsFromProject,
  handleAddUrl,
  handleCreateProject,
  handleDeleteProject,
  handleRenameProject,
  handleUpdateProjectKeywords,
  handleAddCategory,
  handleDeleteCategory,
  handleSetUrlCategory,
  handleUpdateCategoryOrder,
  handleReorderUrls,
  handleOpenAllUrls,
  handleDeleteSelectedUrls,
  handleMoveUrlBetweenProjects,
  handleMoveUrlsBetweenCategories,
  handleReorderProjects,
  handleRenameCategory,
  getProjectUrlsUseCase,
  searchQuery,
}: CustomModeContainerProps) => {
  const openTabsRows = useCustomOpenTabsRows({
    enabled: settings.showOpenTabs !== false,
    getProjectUrlsUseCase,
    projects,
    searchQuery,
  })
  if (isLoading) {
    return <LoadingState />
  }

  const hasSelectableTabs =
    openTabsRows.length > 0 ||
    projects.some(
      (project) =>
        (project.memberships?.length ?? 0) > 0 ||
        (project.urls?.length ?? 0) > 0,
    )
  const content = (
    <div>
      {settings.showOpenTabs !== false && openTabsRows.length > 0 && (
        <OpenTabsSection
          mode='custom'
          rows={openTabsRows}
          settings={settings}
          // eslint-disable-next-line typescript/no-misused-promises
          handleOpenAllTabs={handleOpenAllUrls}
          // eslint-disable-next-line typescript/no-misused-promises
          handleOpenTab={handleOpenUrl}
          // eslint-disable-next-line typescript/no-misused-promises
          handleDeleteUrl={handleDeleteUrl}
          handleDeleteUrls={handleDeleteUrlsFromProject}
          {...(handleDeleteSelectedUrls !== undefined
            ? { handleDeleteRows: handleDeleteSelectedUrls }
            : {})}
        />
      )}
      <CustomProjectSection
        projects={projects}
        // eslint-disable-next-line typescript/no-misused-promises
        handleOpenUrl={handleOpenUrl}
        // eslint-disable-next-line typescript/no-misused-promises
        handleDeleteUrl={handleDeleteUrl}
        // eslint-disable-next-line typescript/no-misused-promises
        handleDeleteUrlsFromProject={handleDeleteUrlsFromProject}
        // eslint-disable-next-line typescript/no-misused-promises
        handleAddUrl={handleAddUrl}
        // eslint-disable-next-line typescript/no-misused-promises
        handleCreateProject={handleCreateProject}
        // eslint-disable-next-line typescript/no-misused-promises
        handleDeleteProject={handleDeleteProject}
        // eslint-disable-next-line typescript/no-misused-promises
        handleRenameProject={handleRenameProject}
        // eslint-disable-next-line typescript/no-misused-promises
        handleUpdateProjectKeywords={handleUpdateProjectKeywords}
        // eslint-disable-next-line typescript/no-misused-promises
        handleAddCategory={handleAddCategory}
        // eslint-disable-next-line typescript/no-misused-promises
        handleDeleteCategory={handleDeleteCategory}
        // eslint-disable-next-line typescript/no-misused-promises
        handleSetUrlCategory={handleSetUrlCategory}
        // eslint-disable-next-line typescript/no-misused-promises
        handleUpdateCategoryOrder={handleUpdateCategoryOrder}
        // eslint-disable-next-line typescript/no-misused-promises
        handleReorderUrls={handleReorderUrls}
        // eslint-disable-next-line typescript/no-misused-promises
        handleOpenAllUrls={handleOpenAllUrls}
        // eslint-disable-next-line typescript/no-misused-promises
        handleMoveUrlBetweenProjects={handleMoveUrlBetweenProjects}
        // eslint-disable-next-line typescript/no-misused-promises
        handleMoveUrlsBetweenCategories={handleMoveUrlsBetweenCategories}
        // eslint-disable-next-line typescript/no-misused-promises
        handleReorderProjects={handleReorderProjects}
        // eslint-disable-next-line typescript/no-misused-promises
        handleRenameCategory={handleRenameCategory}
        getProjectUrlsUseCase={getProjectUrlsUseCase}
        settings={settings}
      />
    </div>
  )

  return handleDeleteSelectedUrls ? (
    <SavedTabsSelectionProvider
      scopeKey={searchQuery}
      confirmDeleteAll={settings.confirmDeleteAll}
      hasSelectableTabs={hasSelectableTabs}
      onOpen={handleOpenAllUrls}
      onDelete={handleDeleteSelectedUrls}
    >
      {content}
    </SavedTabsSelectionProvider>
  ) : (
    content
  )
}
