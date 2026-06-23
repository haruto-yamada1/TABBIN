// Filepath: contexts/saved-tabs/presentation/types/CustomProjectCategory.types.ts
import type { SavedTabsUserSettingsDto as UserSettingsDto } from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'
import type { CustomProject } from '@/types/storage'

export interface CustomProjectCategoryProps {
  projectId: string
  category: string
  urls: CustomProject['urls']
  handleOpenUrl: (url: string) => void
  handleDeleteUrl: (projectId: string, url: string) => void
  handleDeleteUrlsFromProject?: (projectId: string, urls: string[]) => void
  handleDeleteCategory?: (projectId: string, category: string) => void
  handleSetUrlCategory: (
    projectId: string,
    url: string,
    category?: string,
  ) => void
  handleAddCategory: (projectId: string, category: string) => void
  settings: UserSettingsDto
  handleOpenAllUrls?: (urls: { url: string; title: string }[]) => void
  dragData?: { type: string }
  isHighlighted?: boolean
  isDraggingCategory?: boolean
  draggedCategoryName?: string | null
  isCategoryReorder?: boolean
  handleRenameCategory?: (
    projectId: string,
    oldCategoryName: string,
    newCategoryName: string,
  ) => void
}
