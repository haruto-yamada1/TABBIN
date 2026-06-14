import { ExternalLink, Settings, Trash } from 'lucide-react'
import { useCallback, useState } from 'react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipTrigger } from '@/components/ui/tooltip'
import { CategoryKeywordModal } from '@/contexts/saved-tabs/presentation/components/CategoryKeywordModal'
import {
  SavedTabsResponsiveLabel,
  SavedTabsResponsiveTooltipContent,
} from '@/contexts/saved-tabs/presentation/components/shared/SavedTabsResponsive'
import { useSavedTabsUseCases } from '@/contexts/saved-tabs/presentation/controllers/SavedTabsUseCasesContext'
import { getScopedNounActionLabel } from '@/contexts/saved-tabs/presentation/lib/accessibility'
import { handleSaveKeywords } from '@/contexts/saved-tabs/presentation/lib/category-keywords'
import { useI18n } from '@/features/i18n/context/I18nProvider'

import { useDomainCard } from './DomainCardContext'

const BULK_OPEN_THRESHOLD = 10

/**
 * DomainCard の操作ボタン群
 * 子カテゴリ管理、すべて開く、すべて削除、キーワードモーダルを含む
 */
export const DomainCardActions = () => {
  // eslint-disable-line eslint/max-lines-per-function
  const { t } = useI18n()
  const { state, group, settings, isReorderMode, searchQuery, handlers } =
    useDomainCard()
  const useCases = useSavedTabsUseCases()
  const { keywordModal, parentCategories, categoryActions } = state
  const domainName = group.domain

  const [isOpenAllConfirmOpen, setIsOpenAllConfirmOpen] = useState(false)
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
  const hasSearchQuery = searchQuery.trim().length > 0
  const manageSubcategoriesLabel = getScopedNounActionLabel(
    t,
    domainName,
    t('savedTabs.manageSubcategories'),
  )
  const openAllTabsLabel = getScopedNounActionLabel(
    t,
    domainName,
    t('savedTabs.openAllTabs'),
  )
  const deleteAllTabsLabel = getScopedNounActionLabel(
    t,
    domainName,
    t('savedTabs.deleteAllTabs'),
  )

  const executeDeleteAll = useCallback(() => {
    const visibleUrls = (group.urls ?? []).map((item) => item.url)

    if (hasSearchQuery && handlers.handleDeleteUrls && visibleUrls.length > 0) {
      void handlers.handleDeleteUrls(group.id, visibleUrls)
      return
    }

    handlers.handleDeleteGroup(group.id)
  }, [group.id, group.urls, handlers, hasSearchQuery])

  return (
    <>
      <div className='flex shrink-0 items-center gap-2'>
        {/* 子カテゴリ管理 */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant='secondary'
              size='sm'
              // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
              onClick={() => {
                keywordModal.setShowKeywordModal(!keywordModal.showKeywordModal)
              }}
              className='flex cursor-pointer items-center gap-1'
              aria-label={manageSubcategoriesLabel}
            >
              <Settings size={14} />
              <SavedTabsResponsiveLabel>
                {t('savedTabs.manageSubcategories')}
              </SavedTabsResponsiveLabel>
            </Button>
          </TooltipTrigger>
          <SavedTabsResponsiveTooltipContent side='top'>
            {manageSubcategoriesLabel}
          </SavedTabsResponsiveTooltipContent>
        </Tooltip>

        {/* すべて開く */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant='secondary'
              size='sm'
              // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
              onClick={(e) => {
                if ((group.urls?.length ?? 0) >= BULK_OPEN_THRESHOLD) {
                  setIsOpenAllConfirmOpen(true)
                  return
                }
                e.stopPropagation()
                handlers.handleOpenAllTabs(group.urls ?? [])
                if (isReorderMode) {
                  console.log(
                    `並び替えモード中にドメイン ${group.domain} のタブをすべて開きました`,
                  )
                }
              }}
              className='flex cursor-pointer items-center gap-1'
              aria-label={openAllTabsLabel}
            >
              <ExternalLink size={14} />
              <SavedTabsResponsiveLabel>
                {t('savedTabs.openAll')}
              </SavedTabsResponsiveLabel>
            </Button>
          </TooltipTrigger>
          <SavedTabsResponsiveTooltipContent side='top'>
            {openAllTabsLabel}
          </SavedTabsResponsiveTooltipContent>
        </Tooltip>

        {/* グループ削除 */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant='secondary'
              size='sm'
              // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
              onClick={(e) => {
                e.stopPropagation()
                e.preventDefault()
                if (settings.confirmDeleteAll) {
                  setIsDeleteConfirmOpen(true)
                } else {
                  executeDeleteAll()
                  if (isReorderMode) {
                    console.log(
                      `並び替えモード中にドメイン ${group.domain} を削除しました`,
                    )
                  }
                }
              }}
              className='flex cursor-pointer items-center gap-1'
              aria-label={deleteAllTabsLabel}
            >
              <Trash size={14} />
              <SavedTabsResponsiveLabel>
                {t('savedTabs.deleteAll')}
              </SavedTabsResponsiveLabel>
            </Button>
          </TooltipTrigger>
          <SavedTabsResponsiveTooltipContent side='top'>
            {deleteAllTabsLabel}
          </SavedTabsResponsiveTooltipContent>
        </Tooltip>

        {/* キーワードモーダル */}
        {keywordModal.showKeywordModal && useCases && (
          <CategoryKeywordModal
            group={group}
            isOpen={keywordModal.showKeywordModal}
            onClose={keywordModal.handleCloseKeywordModal}
            // eslint-disable-next-line typescript/no-misused-promises, react-perf/jsx-no-new-function-as-prop
            onSave={(...args: [string, string, string[]]) =>
              handleSaveKeywords(useCases.useCases, ...args)
            }
            onDeleteCategory={categoryActions.handleCategoryDelete}
            parentCategories={parentCategories.categories}
            onCreateParentCategory={parentCategories.handleCreateParentCategory}
            onAssignToParentCategory={
              parentCategories.handleAssignToParentCategory
            }
            onUpdateParentCategories={
              parentCategories.handleUpdateParentCategories
            }
            storageChangePort={useCases.deps.storageChangePort}
          />
        )}
      </div>

      {/* 10個以上タブを開く確認ダイアログ */}
      <AlertDialog
        open={isOpenAllConfirmOpen}
        onOpenChange={setIsOpenAllConfirmOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('savedTabs.openAllConfirmTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('savedTabs.openAllConfirmDescriptionWithName', undefined, {
                count: String(group.urls?.length ?? 0),
                name: domainName,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
              onClick={() => {
                handlers.handleOpenAllTabs(group.urls ?? [])
                if (isReorderMode) {
                  console.log(
                    `並び替えモード中にドメイン ${group.domain} のタブをすべて開きました`,
                  )
                }
              }}
            >
              {t('common.open')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* グループ削除確認ダイアログ */}
      <AlertDialog
        open={isDeleteConfirmOpen}
        onOpenChange={setIsDeleteConfirmOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('savedTabs.deleteAllConfirmTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('savedTabs.deleteAllConfirmDescriptionWithCount', undefined, {
                categoryName: domainName,
                count: String(group.urls?.length ?? 0),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
              onClick={() => {
                executeDeleteAll()
                if (isReorderMode) {
                  console.log(
                    `並び替えモード中にドメイン ${group.domain} を削除しました`,
                  )
                }
              }}
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
