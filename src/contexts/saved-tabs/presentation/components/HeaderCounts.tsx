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

const countGroupTabs = (group: TabGroup | CustomProject) =>
  group.urls?.length ?? group.memberships?.length ?? 0

export const HeaderCounts = ({
  currentMode,
  searchQuery,
  tabGroups,
  filteredTabGroups,
  customProjects,
  filteredCustomProjects,
}: HeaderCountsProps) => {
  const { t } = useI18n()
  const groups =
    currentMode === 'custom'
      ? (filteredCustomProjects ?? customProjects)
      : (filteredTabGroups ?? tabGroups)
  const preferMemberships =
    currentMode === 'custom' && searchQuery.trim() === ''
  const tabCount = groups.reduce((sum, group) => {
    const count =
      preferMemberships && group.memberships
        ? group.memberships.length
        : countGroupTabs(group)
    return sum + count
  }, 0)
  const groupCountKey =
    currentMode === 'custom'
      ? 'savedTabs.projectsCount'
      : 'savedTabs.domainsCount'

  return (
    <div className='space-x-4 text-sm text-muted-foreground'>
      <p>{t('savedTabs.tabCount', undefined, { count: String(tabCount) })}</p>
      <p>{t(groupCountKey, undefined, { count: String(groups.length) })}</p>
    </div>
  )
}
