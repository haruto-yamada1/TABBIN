import type { UserSettingsDto } from '@/contexts/saved-tabs/domain/dto/UserSettingsDto'
import { createCompoundContext } from '@/lib/ui/createCompoundContext'
import type { CustomProject } from '@/types/storage'

import type { useCustomProjectCard } from '../../hooks/useCustomProjectCard'
import type { CustomProjectCardProps } from '../../types/CustomProjectCard.types'

/** ProjectCard のコンテキスト型 */
export interface ProjectCardContextType {
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
