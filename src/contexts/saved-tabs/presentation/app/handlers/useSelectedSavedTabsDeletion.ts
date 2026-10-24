import type { Dispatch, SetStateAction } from 'react'
import { useCallback } from 'react'
import { toast } from 'sonner'

import type { SavedTabsUseCases } from '@/contexts/saved-tabs/application/createSavedTabsUseCases'
import { showOpenedUrlsUndoToast } from '@/contexts/saved-tabs/presentation/app/savedTabsApp.helpers'
import type { SavedTabSelectionItem } from '@/contexts/saved-tabs/presentation/components/selection/SavedTabsSelectionProvider'
import type {
  SavedTabsCustomProjectDto as CustomProject,
  SavedTabsParentCategoryDto as ParentCategory,
  SavedTabsTabGroupDto as TabGroup,
} from '@/contexts/saved-tabs/presentation/types/SavedTabsCompatibilityViewModel'
import type { TranslateFn } from '@/features/i18n/context/I18nProvider'

type Deps = {
  savedTabsUseCases: SavedTabsUseCases
  refreshTabGroupsWithUrls: (groups?: TabGroup[]) => Promise<TabGroup[]>
  setCustomProjects: Dispatch<SetStateAction<CustomProject[]>>
  setCategories: Dispatch<SetStateAction<ParentCategory[]>>
  t: TranslateFn
}

export const useSelectedSavedTabsDeletion = ({
  savedTabsUseCases,
  refreshTabGroupsWithUrls,
  setCustomProjects,
  setCategories,
  t,
}: Deps) =>
  useCallback(
    async (items: SavedTabSelectionItem[]) => {
      if (items.length === 0) {
        return
      }
      const byGroup = new Map<string, string[]>()
      for (const item of items) {
        const urls = byGroup.get(item.groupId) ?? []
        urls.push(item.url)
        byGroup.set(item.groupId, urls)
      }
      // One public use-case call is one native session and one atomic commit.
      // A rejected commit leaves storage unchanged; never restore a stale snapshot.
      const result = await savedTabsUseCases.deleteSelectedSavedUrls({
        targets: [...byGroup].map(([tabGroupId, urls]) => ({
          tabGroupId,
          urls,
        })),
      })
      if (result.removedCount > 0 && result.snapshot) {
        showOpenedUrlsUndoToast({
          count: result.removedCount,
          messageKey: 'savedTabs.undo.deletedTabs',
          refreshTabGroupsWithUrls,
          savedTabsUseCases,
          setCategories,
          setCustomProjects,
          snapshot: result.snapshot,
          t,
        })
      }
      try {
        await refreshTabGroupsWithUrls()
      } catch {
        // Persistence succeeded. Keep Undo available and distinguish a stale view
        // from a failed deletion so the caller cannot retry a committed write.
        toast.error(t('savedTabs.selection.refreshFailed'))
      }
    },
    [
      savedTabsUseCases,
      refreshTabGroupsWithUrls,
      setCustomProjects,
      setCategories,
      t,
    ],
  )
