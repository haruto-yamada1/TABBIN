import { useVirtualizer } from '@tanstack/react-virtual'
import { useMemo, useRef } from 'react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import type { TabGroup } from '@/types/storage'

import { useCategoryModalContext } from './CategoryModalContext'

interface DomainCategoryInfo {
  id: string
  name: string
}

interface DomainSelectionState {
  selectedCategoryId: string | null
}

interface DomainState {
  domainCategories: Record<string, DomainCategoryInfo | null>
  selectedDomains: Record<string, boolean>
  toggleDomainSelection: (domainId: string) => void
}

const sortTabGroups = (
  tabGroups: TabGroup[],
  domainCategories: DomainState['domainCategories'],
): TabGroup[] =>
  tabGroups.toSorted((a, b) => {
    const aHasCategory = Boolean(domainCategories[a.id])
    const bHasCategory = Boolean(domainCategories[b.id])
    if (!aHasCategory && bHasCategory) {
      return -1
    }
    if (aHasCategory && !bHasCategory) {
      return 1
    }
    return a.domain.localeCompare(b.domain)
  })

const getVisibleTabGroups = ({
  tabGroups,
  selectedCategoryId,
  domainCategories,
}: {
  tabGroups: TabGroup[]
  selectedCategoryId: string | null
  domainCategories: DomainState['domainCategories']
}): TabGroup[] => {
  if (selectedCategoryId !== 'uncategorized') {
    return tabGroups
  }
  return tabGroups.filter((group) => !domainCategories[group.id])
}

const getDomainRowClass = (
  belongsToCategory: DomainCategoryInfo | null,
  isInCurrentCategory: boolean,
): string => {
  const categoryClass = isInCurrentCategory ? 'bg-primary/10' : ''
  const uncategorizedClass = !belongsToCategory ? 'bg-muted/50' : ''
  return `flex items-center space-x-2 rounded border-b p-2 last:border-0 ${categoryClass} ${uncategorizedClass}`
}

const DomainCategoryStatus = ({
  belongsToCategory,
  selectedCategoryId,
  onToggle,
  disabled,
  t,
}: {
  belongsToCategory: DomainCategoryInfo | null
  selectedCategoryId: string | null
  onToggle: () => void
  disabled: boolean
  t: (key: string, fallback?: string, values?: Record<string, string>) => string
}) => {
  if (!belongsToCategory) {
    return (
      <Button
        type='button'
        className='mt-1 h-auto w-full justify-start p-0 text-left text-xs text-muted-foreground hover:text-foreground'
        onClick={onToggle}
        disabled={disabled}
        aria-label={t('savedTabs.categoryModal.uncategorizedAria')}
        variant='ghost'
      >
        <span className='mr-1 inline-block size-2 rounded-full bg-muted-foreground' />
        <span>{t('savedTabs.categoryModal.uncategorized')}</span>
      </Button>
    )
  }

  const isCurrentCategory = selectedCategoryId === belongsToCategory.id
  return (
    <Button
      type='button'
      className='mt-1 h-auto w-full justify-start p-0 text-left text-xs text-muted-foreground hover:text-foreground'
      onClick={onToggle}
      disabled={disabled}
      aria-label={t(
        isCurrentCategory
          ? 'savedTabs.categoryModal.currentCategory'
          : 'savedTabs.categoryModal.belongsToCategory',
        undefined,
        { name: belongsToCategory.name },
      )}
      variant='ghost'
    >
      <span className='mr-1 inline-block size-2 rounded-full bg-primary' />
      <span>
        {t(
          isCurrentCategory
            ? 'savedTabs.categoryModal.currentCategory'
            : 'savedTabs.categoryModal.belongsToCategory',
          undefined,
          { name: belongsToCategory.name },
        )}
      </span>
    </Button>
  )
}

interface DomainRowProps {
  group: TabGroup
  selection: DomainSelectionState
  domains: DomainState
  isLoading: boolean
  t: (key: string, fallback?: string, values?: Record<string, string>) => string
}

const DomainRow = ({
  group,
  selection,
  domains,
  isLoading,
  t,
}: DomainRowProps) => {
  const belongsToCategory = domains.domainCategories[group.id]
  const isInCurrentCategory =
    selection.selectedCategoryId !== null &&
    selection.selectedCategoryId !== 'uncategorized' &&
    belongsToCategory?.id === selection.selectedCategoryId
  const disabled = isLoading || !selection.selectedCategoryId
  const checkboxId = `domain-${group.id}`
  const onToggle = () => {
    domains.toggleDomainSelection(group.id)
  }

  return (
    <div
      data-testid='domain-row'
      className={getDomainRowClass(belongsToCategory, isInCurrentCategory)}
    >
      <Checkbox
        id={checkboxId}
        checked={domains.selectedDomains[group.id]}
        onCheckedChange={onToggle}
        disabled={disabled}
      />
      <div className='flex-1'>
        <Label htmlFor={checkboxId} className='flex-1 cursor-pointer'>
          {group.domain}
        </Label>
        <DomainCategoryStatus
          belongsToCategory={belongsToCategory}
          selectedCategoryId={selection.selectedCategoryId}
          onToggle={onToggle}
          disabled={disabled}
          t={t}
        />
      </div>
    </div>
  )
}

/**
 * ドメイン選択リスト
 * ドメインをカテゴリに割り当てるためのチェックボックスリスト
 */
export const DomainSelectionList = () => {
  const { t } = useI18n()
  const { state, tabGroups } = useCategoryModalContext()
  const { selection, domains, isLoading } = state
  const scrollElementRef = useRef<HTMLDivElement>(null)

  const sortedTabGroups = useMemo(
    () => sortTabGroups(tabGroups, domains.domainCategories),
    [tabGroups, domains.domainCategories],
  )

  const visibleTabGroups = useMemo(
    () =>
      getVisibleTabGroups({
        domainCategories: domains.domainCategories,
        selectedCategoryId: selection.selectedCategoryId,
        tabGroups: sortedTabGroups,
      }),
    [sortedTabGroups, selection.selectedCategoryId, domains.domainCategories],
  )

  const ESTIMATED_ROW_HEIGHT = 56

  const rowVirtualizer = useVirtualizer({
    count: visibleTabGroups.length,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    getScrollElement: () => scrollElementRef.current,
    initialRect: {
      height: 560,
      width: 0,
    },
    observeElementRect: (_instance, cb) => {
      cb({
        width: 0,
        height: 560,
      })
      return () => {}
    },
    overscan: 8,
  })

  if (selection.categories.length === 0) {
    return null
  }

  let listContent: React.ReactNode
  if (tabGroups.length === 0) {
    listContent = (
      <div className='py-8 text-center text-muted-foreground'>
        {t('savedTabs.categoryModal.noDomains')}
      </div>
    )
  } else if (visibleTabGroups.length === 0) {
    listContent = (
      <div className='py-8 text-center text-muted-foreground'>
        {t('savedTabs.categoryModal.allCategorized')}
      </div>
    )
  } else {
    listContent = (
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          position: 'relative',
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualItem) => {
          const group = visibleTabGroups[virtualItem.index]

          return (
            <div
              key={group.id}
              style={{
                left: 0,
                position: 'absolute',
                top: 0,
                transform: `translateY(${virtualItem.start}px)`,
                width: '100%',
              }}
            >
              <DomainRow
                group={group}
                selection={selection}
                domains={domains}
                isLoading={isLoading}
                t={t}
              />
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div>
      <Label>
        {selection.selectedCategoryId === 'uncategorized'
          ? t('savedTabs.categoryModal.domainsLabelUncategorized')
          : t('savedTabs.categoryModal.domainsLabel')}
      </Label>
      <div
        ref={scrollElementRef}
        className='mt-3 h-[calc(70vh-150px)] overflow-auto rounded border p-2'
      >
        {listContent}
      </div>
    </div>
  )
}
