import type {
  SavedTabsCustomProjectDto as CustomProject,
  SavedTabsUserSettingsDto as UserSettingsDto,
} from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'
import type { useCustomProjectCard } from '@/contexts/saved-tabs/presentation/hooks/useCustomProjectCard'
import type { CustomProjectCardProps } from '@/contexts/saved-tabs/presentation/types/CustomProjectCard.types'
import { createCompoundContext } from '@/lib/ui/createCompoundContext'

/** ProjectCard のコンテキスト型 */
export type ProjectCardContextType = {
  /** フック戻り値 */
  hookState: ReturnType<typeof useCustomProjectCard>
  /** プロジェクトデータ */
  project: CustomProject
  /** 設定 */
  settings: UserSettingsDto
  /** 未分類エリアがドロップオーバー中か */
  isUncategorizedOver: boolean
  /** 外部アイテムがドロップオーバー中か */
  isExternalItemOver: boolean
  /** 未分類ドロップ領域のref */
  setUncategorizedDropRef: (node: HTMLElement | null) => void
  /** カテゴリ表示順 */
  categoryOrder: string[]
  /** 操作ハンドラ */
  handlers: {
    handleOpenUrl: CustomProjectCardProps['handleOpenUrl']
    handleDeleteUrl: CustomProjectCardProps['handleDeleteUrl']
    handleAddCategory: CustomProjectCardProps['handleAddCategory']
    handleDeleteCategory: CustomProjectCardProps['handleDeleteCategory']
    handleRenameCategory: CustomProjectCardProps['handleRenameCategory']
    handleSetUrlCategory: CustomProjectCardProps['handleSetUrlCategory']
    handleOpenAllUrls?: CustomProjectCardProps['handleOpenAllUrls']
    handleRenameProject?: CustomProjectCardProps['handleRenameProject']
    handleUpdateProjectKeywords?: CustomProjectCardProps['handleUpdateProjectKeywords']
    handleDeleteProject?: CustomProjectCardProps['handleDeleteProject']
    handleDeleteUrlsFromProject?: CustomProjectCardProps['handleDeleteUrlsFromProject']
  }
}

export const {
  context: ProjectCardContext,
  useCompoundContext: useProjectCard,
} = createCompoundContext<ProjectCardContextType>('ProjectCard')
