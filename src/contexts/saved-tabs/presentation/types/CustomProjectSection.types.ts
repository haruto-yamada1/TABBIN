import type {
  SavedTabsCustomProjectDto as CustomProject,
  SavedTabsProjectKeywordSettingsDto as ProjectKeywordSettings,
  SavedTabsUserSettingsDto as UserSettingsDto,
} from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'
import type { GetProjectUrlsUseCase } from '@/contexts/saved-tabs/application/use-cases/GetProjectUrlsUseCase'

export type CustomProjectSectionProps = {
  projects: CustomProject[]
  handleOpenUrl: (url: string) => void
  handleDeleteUrl: (projectId: string, url: string) => void
  handleDeleteUrlsFromProject?: (projectId: string, urls: string[]) => void
  handleAddUrl: (
    projectId: string,
    url: string,
    title: string,
    category?: string,
  ) => void
  handleCreateProject: (name: string) => void
  handleDeleteProject: (projectId: string) => void
  handleRenameProject: (projectId: string, newName: string) => void
  handleUpdateProjectKeywords?: (
    projectId: string,
    projectKeywords: ProjectKeywordSettings,
  ) => void
  handleAddCategory: (projectId: string, categoryName: string) => void
  handleDeleteCategory: (projectId: string, categoryName: string) => void
  handleRenameCategory?: (
    projectId: string,
    oldCategoryName: string,
    newCategoryName: string,
  ) => void
  handleSetUrlCategory: (
    projectId: string,
    url: string,
    category?: string,
  ) => void
  handleUpdateCategoryOrder: (projectId: string, newOrder: string[]) => void
  handleReorderUrls: (projectId: string, urls: CustomProject['urls']) => void
  handleReorderProjects?: (projectIds: string[]) => void
  handleOpenAllUrls?: (urls: { url: string; title: string }[]) => void
  handleMoveUrlBetweenProjects?: (
    sourceProjectId: string,
    targetProjectId: string,
    url: string,
  ) => void
  handleMoveUrlsBetweenCategories?: (
    projectId: string,
    sourceCategoryName: string,
    targetCategoryName: string,
  ) => void
  getProjectUrlsUseCase?: GetProjectUrlsUseCase
  settings: UserSettingsDto
}
