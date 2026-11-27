import { Badge } from '@/components/ui/badge'
import type { ViewMode } from '@/contexts/saved-tabs/presentation/types/mode'
import type {
  SavedTabsCustomProjectDto as CustomProject,
  SavedTabsTabGroupDto as TabGroup,
} from '@/contexts/saved-tabs/presentation/types/SavedTabsCompatibilityViewModel'
import { useI18n } from '@/features/i18n/context/I18nProvider'

type HeaderCountsProps = {
  currentMode: ViewMode
  searchQuery: string
  tabGroups: TabGroup[]
  filteredTabGroups: TabGroup[] | undefined
  customProjects: CustomProject[]
  filteredCustomProjects: CustomProject[] | undefined
}

type CountableGroup = TabGroup | CustomProject

const countGroupTabs = (group: CountableGroup, preferMemberships: boolean) =>
  preferMemberships && group.memberships
    ? group.memberships.length
    : (group.urls?.length ?? group.memberships?.length ?? 0)

const countTabs = (
  groups: readonly CountableGroup[],
  preferMemberships: boolean,
) =>
  groups.reduce(
    (sum, group) => sum + countGroupTabs(group, preferMemberships),
    0,
  )

export const HeaderCounts = ({
  currentMode,
  searchQuery,
  tabGroups,
  filteredTabGroups,
  customProjects,
  filteredCustomProjects,
}: HeaderCountsProps) => {
  const { t } = useI18n()
  const isCustom = currentMode === 'custom'
  const allGroups: readonly CountableGroup[] = isCustom
    ? customProjects
    : tabGroups
  const filteredGroups = isCustom ? filteredCustomProjects : filteredTabGroups
  const groups: readonly CountableGroup[] = filteredGroups ?? allGroups
  const isFiltering = searchQuery.trim() !== '' && filteredGroups !== undefined
  // custom モードで検索していないときは memberships を優先する従来の数え方を
  // 結果件数に使い、全体件数も memberships 基準で揃えて比較できるようにする。
  const tabCount = countTabs(groups, isCustom && searchQuery.trim() === '')
  const totalTabCount = countTabs(allGroups, isCustom)
  const groupCountKey = isCustom
    ? 'savedTabs.projectsCount'
    : 'savedTabs.domainsCount'
  const groupCountFilteredKey = isCustom
    ? 'savedTabs.projectsCountFiltered'
    : 'savedTabs.domainsCountFiltered'

  const tabText = isFiltering
    ? t('savedTabs.tabCountFiltered', undefined, {
        count: String(tabCount),
        total: String(totalTabCount),
      })
    : t('savedTabs.tabCount', undefined, { count: String(tabCount) })
  const groupText = isFiltering
    ? t(groupCountFilteredKey, undefined, {
        count: String(groups.length),
        total: String(allGroups.length),
      })
    : t(groupCountKey, undefined, { count: String(groups.length) })

  return (
    <output className='flex items-center gap-2' data-testid='header-counts'>
      <Badge variant='secondary' className='rounded-full'>
        {tabText}
      </Badge>
      <Badge variant='secondary' className='rounded-full'>
        {groupText}
      </Badge>
    </output>
  )
}
