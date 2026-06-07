import { DndContext as DndKitContext, closestCenter } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Check, X } from 'lucide-react'
import { useCallback, useMemo } from 'react'
import type { ComponentProps } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { LoadingState } from '@/components/ui/loading-state'
import { Tooltip, TooltipTrigger } from '@/components/ui/tooltip'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import { CategoryGroup } from '@/features/saved-tabs/components/CategoryGroup'
import { CardGroupActions } from '@/features/saved-tabs/components/shared/CardGroupActions'
import {
  SavedTabsResponsiveLabel,
  SavedTabsResponsiveTooltipContent,
} from '@/features/saved-tabs/components/shared/SavedTabsResponsive'
import { SortableDomainCard } from '@/features/saved-tabs/components/SortableDomainCard'
import { getScopedNounActionLabel } from '@/features/saved-tabs/lib/accessibility'
import type { ParentCategory, TabGroup, UserSettings } from '@/types/storage'

type DndSensors = ComponentProps<typeof DndKitContext>['sensors']

interface DomainModeContainerProps {
  state: {
    hasVisibleCategoryGroups: boolean
    isCategoryReorderMode: boolean
    isLoading: boolean
    isUncategorizedReorderMode: boolean
    shouldShowUncategorizedList: boolean
    shouldShowUncategorizedSectionHeader: boolean
  }
  settings: UserSettings
  categories: ParentCategory[]
  categorized: Record<string, TabGroup[]>
  categoryOrderForDisplay: string[]
  tabGroups: TabGroup[]
  searchQuery: string
  sensors: DndSensors
  handleCategoryDragEnd: (event: DragEndEvent) => void
  handleOpenAllTabs: (urls: { url: string; title: string }[]) => Promise<void>
  handleDeleteGroup: (id: string) => Promise<void>
  handleDeleteGroups?: (ids: string[]) => Promise<void>
  handleDeleteUrl: (groupId: string, url: string) => Promise<void>
  handleDeleteUrls?: (groupId: string, urls: string[]) => Promise<void>
  handleOpenTab: (url: string) => Promise<void>
  handleUpdateUrls: (
    groupId: string,
    updatedUrls: TabGroup['urls'],
  ) => Promise<void>
  handleUpdateDomainsOrder: (
    categoryId: string,
    updatedDomains: TabGroup[],
  ) => Promise<void>
  handleMoveDomainToCategory: (
    domainId: string,
    fromCategoryId: string | null,
    toCategoryId: string,
    tabGroups: TabGroup[],
  ) => Promise<void>
  handleDeleteCategory: (groupId: string, categoryName: string) => Promise<void>
  handleCancelUncategorizedReorder: () => void
  handleConfirmUncategorizedReorder: () => Promise<void>
  uncategorizedForDisplay: TabGroup[]
  handleUncategorizedDragEnd: (event: DragEndEvent) => void
  hasContentTabGroupsCount: number
}

const getVisibleGroupUrls = (group: TabGroup): string[] =>
  (group.urls || []).map((item) => item.url)
const deleteVisibleUrlsForGroups = async (
  groups: TabGroup[],
  handleDeleteUrls: (groupId: string, urls: string[]) => Promise<void>,
): Promise<void> => {
  await Promise.all(
    groups.map(async (group) => {
      const visibleUrls = getVisibleGroupUrls(group)
      if (visibleUrls.length === 0) {
        return
      }
      await handleDeleteUrls(group.id, visibleUrls)
    }),
  )
}

interface UncategorizedDomainSectionState {
  shouldShowSectionHeader: boolean
  hasVisibleCategoryGroups: boolean
  confirmDeleteAll: boolean
  isReorderMode: boolean
  shouldShowList: boolean
}

interface UncategorizedDomainSectionProps {
  state: UncategorizedDomainSectionState
  displayedDomainCount: number
  displayedTabCount: number
  targetName: string
  handleOpenAll: () => void
  handleDeleteAll: () => Promise<void>
  handleCancelReorder: () => void
  handleConfirmReorder: () => Promise<void>
  sensors: DndSensors
  handleDragEnd: (event: DragEndEvent) => void
  uncategorizedForDisplay: TabGroup[]
  handleOpenAllTabs: (urls: { url: string; title: string }[]) => Promise<void>
  handleDeleteGroup: (id: string) => Promise<void>
  handleDeleteGroups?: (ids: string[]) => Promise<void>
  handleDeleteUrl: (groupId: string, url: string) => Promise<void>
  handleDeleteUrls?: (groupId: string, urls: string[]) => Promise<void>
  handleOpenTab: (url: string) => Promise<void>
  handleUpdateUrls: (
    groupId: string,
    updatedUrls: TabGroup['urls'],
  ) => Promise<void>
  handleDeleteCategory: (groupId: string, categoryName: string) => Promise<void>
  searchQuery: string
  hasContentCount: number
}

const UncategorizedDomainSection = ({
  state: {
    shouldShowSectionHeader,
    hasVisibleCategoryGroups,
    confirmDeleteAll,
    isReorderMode,
    shouldShowList,
  },
  displayedDomainCount,
  displayedTabCount,
  targetName,
  handleOpenAll,
  handleDeleteAll,
  handleCancelReorder,
  handleConfirmReorder,
  sensors,
  handleDragEnd,
  uncategorizedForDisplay,
  handleOpenAllTabs,
  handleDeleteGroup,
  handleDeleteGroups,
  handleDeleteUrl,
  handleDeleteUrls,
  handleOpenTab,
  handleUpdateUrls,
  handleDeleteCategory,
  searchQuery,
  hasContentCount,
}: UncategorizedDomainSectionProps) => {
  const { t } = useI18n()

  return (
    <>
      {shouldShowSectionHeader && (
        <div
          className={`sticky top-0 z-50 flex items-center justify-between bg-card ${hasVisibleCategoryGroups ? 'mt-6' : 'mt-2'}`}
          data-saved-tabs-scroll-target='parent'
        >
          <div className='flex min-w-0 items-center gap-3'>
            <h2 className='text-xl font-semibold text-foreground'>
              {t('savedTabs.uncategorizedDomainsTitle')}
            </h2>
            {displayedDomainCount > 0 && (
              <div className='flex items-center gap-3 text-sm text-muted-foreground'>
                <span className='text-sm text-muted-foreground'>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant='secondary'>{displayedTabCount}</Badge>
                    </TooltipTrigger>
                    <SavedTabsResponsiveTooltipContent side='top'>
                      タブ数
                    </SavedTabsResponsiveTooltipContent>
                  </Tooltip>
                </span>
                <span className='text-sm text-muted-foreground'>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant='secondary'>{displayedDomainCount}</Badge>
                    </TooltipTrigger>
                    <SavedTabsResponsiveTooltipContent side='top'>
                      ドメイン数
                    </SavedTabsResponsiveTooltipContent>
                  </Tooltip>
                </span>
              </div>
            )}
          </div>

          <div className='flex items-center'>
            {displayedDomainCount > 0 && (
              <CardGroupActions
                onOpenAll={handleOpenAll}
// eslint-disable-next-line typescript/no-misused-promises
                onDeleteAll={handleDeleteAll}
                openAllAriaLabel={getScopedNounActionLabel(
                  t,
                  targetName,
                  t('savedTabs.openAllTabs'),
                )}
                openAllTooltip={getScopedNounActionLabel(
                  t,
                  targetName,
                  t('savedTabs.openAllTabs'),
                )}
                deleteAllAriaLabel={getScopedNounActionLabel(
                  t,
                  targetName,
                  t('savedTabs.deleteAllTabs'),
                )}
                deleteAllTooltip={getScopedNounActionLabel(
                  t,
                  targetName,
                  t('savedTabs.deleteAllTabs'),
                )}
                onConfirmOpenAll={displayedTabCount >= 10}
                onConfirmDeleteAll={confirmDeleteAll}
                openAllThreshold={10}
                openAllCount={displayedTabCount}
                openAllConfirmDescription={t(
                  'savedTabs.openAllConfirmDescriptionWithName',
                  undefined,
                  {
                    count: String(displayedTabCount),
                    name: targetName,
                  },
                )}
                itemName={t('savedTabs.uncategorizedDomainsTitle')}
                warningMessage={t('savedTabs.domain.deleteAllWarning')}
                deleteAllConfirmDescription={t(
                  'savedTabs.deleteAllConfirmDescriptionWithCount',
                  undefined,
                  {
                    categoryName: targetName,
                    count: String(displayedTabCount),
                  },
                )}
              />
            )}

            {isReorderMode && (
              <div className='pointer-events-auto ml-2 flex shrink-0 gap-2'>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={handleCancelReorder}
                      className='flex cursor-pointer items-center gap-1'
                      aria-label={t('savedTabs.reorder.cancelAria')}
                    >
                      <X size={14} />
                      <SavedTabsResponsiveLabel>
                        {t('savedTabs.reorder.cancel')}
                      </SavedTabsResponsiveLabel>
                    </Button>
                  </TooltipTrigger>
                  <SavedTabsResponsiveTooltipContent side='top'>
                    {t('savedTabs.reorder.cancelAria')}
                  </SavedTabsResponsiveTooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant='default'
                      size='sm'
// eslint-disable-next-line typescript/no-misused-promises
                      onClick={handleConfirmReorder}
                      className='flex cursor-pointer items-center gap-1'
                      aria-label={t('savedTabs.reorder.confirmAria')}
                    >
                      <Check size={14} />
                      <SavedTabsResponsiveLabel>
                        {t('savedTabs.reorder.confirm')}
                      </SavedTabsResponsiveLabel>
                    </Button>
                  </TooltipTrigger>
                  <SavedTabsResponsiveTooltipContent side='top'>
                    {t('savedTabs.reorder.confirmAria')}
                  </SavedTabsResponsiveTooltipContent>
                </Tooltip>
              </div>
            )}
          </div>
        </div>
      )}

      {shouldShowList && (
        <DndKitContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={uncategorizedForDisplay.map((group) => group.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className='mt-2 flex flex-col gap-1'>
              {uncategorizedForDisplay.map((group) => (
                <SortableDomainCard
                  key={group.id}
                  group={group}
// eslint-disable-next-line typescript/no-misused-promises
                  handleOpenAllTabs={handleOpenAllTabs}
// eslint-disable-next-line typescript/no-misused-promises
                  handleDeleteGroup={handleDeleteGroup}
// eslint-disable-next-line typescript/no-misused-promises
                  handleDeleteGroups={handleDeleteGroups}
// eslint-disable-next-line typescript/no-misused-promises
                  handleDeleteUrl={handleDeleteUrl}
                  handleDeleteUrls={handleDeleteUrls}
// eslint-disable-next-line typescript/no-misused-promises
                  handleOpenTab={handleOpenTab}
// eslint-disable-next-line typescript/no-misused-promises
                  handleUpdateUrls={handleUpdateUrls}
// eslint-disable-next-line typescript/no-misused-promises
                  handleDeleteCategory={handleDeleteCategory}
                  settings={{ confirmDeleteAll } as UserSettings}
                  isReorderMode={isReorderMode}
                  searchQuery={searchQuery}
                />
              ))}
            </div>
          </SortableContext>
        </DndKitContext>
      )}

      {hasContentCount === 0 && (
        <div className='flex min-h-[200px] flex-col items-center justify-center gap-4'>
          <div className='text-2xl text-foreground'>
            {t('savedTabs.emptyTitle')}
          </div>
          <div className='text-muted-foreground'>
            {t('savedTabs.emptyDescription')}
          </div>
        </div>
      )}
    </>
  )
}

export const DomainModeContainer = ({
  state,
  settings,
  categories,
  categorized,
  categoryOrderForDisplay,
  tabGroups,
  searchQuery,
  sensors,
  handleCategoryDragEnd,
  handleOpenAllTabs,
  handleDeleteGroup,
  handleDeleteGroups,
  handleDeleteUrl,
  handleDeleteUrls,
  handleOpenTab,
  handleUpdateUrls,
  handleUpdateDomainsOrder,
  handleMoveDomainToCategory,
  handleDeleteCategory,
  handleCancelUncategorizedReorder,
  handleConfirmUncategorizedReorder,
  uncategorizedForDisplay,
  handleUncategorizedDragEnd,
  hasContentTabGroupsCount,
}: DomainModeContainerProps) => {
  const {
    hasVisibleCategoryGroups,
    isCategoryReorderMode,
    isLoading,
    isUncategorizedReorderMode,
    shouldShowUncategorizedList,
    shouldShowUncategorizedSectionHeader,
  } = state
  const { t } = useI18n()
  const categoryMap = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  )
  const handleMoveDomainToCategoryWithTabGroups = useCallback(
    (domainId: string, fromCategoryId: string | null, toCategoryId: string) =>
      handleMoveDomainToCategory(
        domainId,
        fromCategoryId,
        toCategoryId,
        tabGroups,
      ),
    [handleMoveDomainToCategory, tabGroups],
  )
  const displayedUncategorizedDomainCount = uncategorizedForDisplay.length
  const uncategorizedTargetName = t('savedTabs.uncategorizedDomainsTitle')
  const uncategorizedUrlsToOpen = useMemo(
    () => uncategorizedForDisplay.flatMap((group) => group.urls || []),
    [uncategorizedForDisplay],
  )
  const displayedUncategorizedTabCount = uncategorizedUrlsToOpen.length
  const handleOpenAllUncategorized = useCallback(() => {
    void handleOpenAllTabs(uncategorizedUrlsToOpen)
  }, [handleOpenAllTabs, uncategorizedUrlsToOpen])
  const handleDeleteAllUncategorized = useCallback(async () => {
    if (searchQuery.trim().length > 0 && handleDeleteUrls) {
      await deleteVisibleUrlsForGroups(
        uncategorizedForDisplay,
        handleDeleteUrls,
      )
      return
    }

    const uncategorizedIds = uncategorizedForDisplay.map((group) => group.id)
    if (handleDeleteGroups) {
      await handleDeleteGroups(uncategorizedIds)
      return
    }
    await Promise.all(uncategorizedIds.map((id) => handleDeleteGroup(id)))
  }, [
    handleDeleteGroup,
    handleDeleteGroups,
    handleDeleteUrls,
    searchQuery,
    uncategorizedForDisplay,
  ])

  if (isLoading) {
    return <LoadingState />
  }

  return (
    <>
      {settings.enableCategories && Object.keys(categorized).length > 0 && (
        <DndKitContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleCategoryDragEnd}
        >
          <SortableContext
            items={categoryOrderForDisplay}
            strategy={verticalListSortingStrategy}
          >
            <div className='flex flex-col gap-1'>
              {categoryOrderForDisplay.map((categoryId) => {
                if (!categoryId) {
                  return null
                }
                const category = categoryMap.get(categoryId)
                if (!category) {
                  return null
                }
                const domainGroups = categorized[categoryId] || []
                if (domainGroups.length === 0) {
                  return null
                }
                return (
                  <CategoryGroup
                    key={categoryId}
                    category={category}
                    domains={domainGroups}
// eslint-disable-next-line typescript/no-misused-promises
                    handleOpenAllTabs={handleOpenAllTabs}
// eslint-disable-next-line typescript/no-misused-promises
                    handleDeleteGroup={handleDeleteGroup}
// eslint-disable-next-line typescript/no-misused-promises
                    handleDeleteGroups={handleDeleteGroups}
// eslint-disable-next-line typescript/no-misused-promises
                    handleDeleteUrl={handleDeleteUrl}
                    handleDeleteUrls={handleDeleteUrls}
// eslint-disable-next-line typescript/no-misused-promises
                    handleOpenTab={handleOpenTab}
// eslint-disable-next-line typescript/no-misused-promises
                    handleUpdateUrls={handleUpdateUrls}
// eslint-disable-next-line typescript/no-misused-promises
                    handleUpdateDomainsOrder={handleUpdateDomainsOrder}
// eslint-disable-next-line typescript/no-misused-promises
                    handleMoveDomainToCategory={
                      handleMoveDomainToCategoryWithTabGroups
                    }
// eslint-disable-next-line typescript/no-misused-promises
                    handleDeleteCategory={handleDeleteCategory}
                    settings={settings}
                    isCategoryReorderMode={isCategoryReorderMode}
                    searchQuery={searchQuery}
                  />
                )
              })}
            </div>
          </SortableContext>
        </DndKitContext>
      )}

      <UncategorizedDomainSection
        state={{
          shouldShowSectionHeader: shouldShowUncategorizedSectionHeader,
          hasVisibleCategoryGroups,
          confirmDeleteAll: settings.confirmDeleteAll,
          isReorderMode: isUncategorizedReorderMode,
          shouldShowList: shouldShowUncategorizedList,
        }}
        displayedDomainCount={displayedUncategorizedDomainCount}
        displayedTabCount={displayedUncategorizedTabCount}
        targetName={uncategorizedTargetName}
        handleOpenAll={handleOpenAllUncategorized}
        handleDeleteAll={handleDeleteAllUncategorized}
        handleCancelReorder={handleCancelUncategorizedReorder}
        handleConfirmReorder={handleConfirmUncategorizedReorder}
        sensors={sensors}
        handleDragEnd={handleUncategorizedDragEnd}
        uncategorizedForDisplay={uncategorizedForDisplay}
        handleOpenAllTabs={handleOpenAllTabs}
        handleDeleteGroup={handleDeleteGroup}
        handleDeleteGroups={handleDeleteGroups}
        handleDeleteUrl={handleDeleteUrl}
        handleDeleteUrls={handleDeleteUrls}
        handleOpenTab={handleOpenTab}
        handleUpdateUrls={handleUpdateUrls}
        handleDeleteCategory={handleDeleteCategory}
        searchQuery={searchQuery}
        hasContentCount={hasContentTabGroupsCount}
      />
    </>
  )
}
