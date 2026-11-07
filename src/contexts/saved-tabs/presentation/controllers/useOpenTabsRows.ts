import { useMemo } from 'react'

import { useOpenSavedUrls } from '@/contexts/saved-tabs/presentation/controllers/useOpenSavedUrls'
import type { OpenTabsRow } from '@/contexts/saved-tabs/presentation/lib/open-tabs-display'
import { buildOpenTabsRows } from '@/contexts/saved-tabs/presentation/lib/open-tabs-display'
import type { SavedTabsTabGroupDto as TabGroup } from '@/contexts/saved-tabs/presentation/types/SavedTabsCompatibilityViewModel'

const EMPTY_OPEN_TABS_ROWS: readonly OpenTabsRow[] = []

/**
 * domain モードの「今開いているタブ」表示用行。保存タブグループを
 * 出現単位 (groupId, url) に絞り込む。custom モードは初期ロード経路で
 * `urls` を保持しないため `useCustomOpenTabsRows` に分離している。
 * 検索入力中は行の部分的なすり抜け (検索で絞り込まれない open 行の
 * 追加・保存側に無い行) を避けるため空配列を返す。
 */
export const useOpenTabsRows = ({
  enabled = true,
  searchQuery,
  tabGroups,
}: {
  enabled?: boolean
  searchQuery: string
  tabGroups: readonly TabGroup[]
}): readonly OpenTabsRow[] => {
  const isActive = enabled && searchQuery.trim().length === 0
  const remoteOpenUrls = useOpenSavedUrls(isActive)
  return useMemo((): readonly OpenTabsRow[] => {
    if (!isActive) {
      return EMPTY_OPEN_TABS_ROWS
    }
    return buildOpenTabsRows(tabGroups, remoteOpenUrls)
  }, [isActive, tabGroups, remoteOpenUrls])
}
