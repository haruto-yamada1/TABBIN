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
import { useI18n } from '@/features/i18n/context/I18nProvider'
import { CategoryKeywordModal } from '@/features/saved-tabs/components/CategoryKeywordModal'
import {
  SavedTabsResponsiveLabel,
  SavedTabsResponsiveTooltipContent,
} from '@/features/saved-tabs/components/shared/SavedTabsResponsive'
import { handleSaveKeywords } from '@/features/saved-tabs/lib/category-keywords'

import { useDomainCard } from './DomainCardContext'

/**
 * DomainCard の操作ボタン群
 * 子カテゴリ管理、すべて開く、すべて削除、キーワードモーダルを含む
 */
export const DomainCardActions = () => {
  const { t } = useI18n()
  const { state, group, settings, isReorderMode, searchQuery, handlers } =
    useDomainCard()
  const { keywordModal, parentCategories, categoryActions } = state

  const [isOpenAllConfirmOpen, setIsOpenAllConfirmOpen] = useState(false)
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
  const hasSearchQuery = searchQuery.trim().length > 0

  const executeDeleteAll = useCallback(() => {
    const visibleUrls = (group.urls || []).map((item) => item.url)

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
              onClick={() =>
                keywordModal.setShowKeywordModal(!keywordModal.showKeywordModal)
              }
              className='flex cursor-pointer items-center gap-1'
              aria-label={t('savedTabs.manageSubcategories')}
            >
              <Settings size={14} />
              <SavedTabsResponsiveLabel>
                {t('savedTabs.manageSubcategories')}
              </SavedTabsResponsiveLabel>
            </Button>
          </TooltipTrigger>
          <SavedTabsResponsiveTooltipContent side='top'>
            {t('savedTabs.manageSubcategories')}
          </SavedTabsResponsiveTooltipContent>
        </Tooltip>

        {/* すべて開く */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant='secondary'
              size='sm'
              onClick={(e) => {
                if ((group.urls?.length || 0) >= 10) {
                  setIsOpenAllConfirmOpen(true)
                  return
                }
                e.stopPropagation()
                handlers.handleOpenAllTabs(group.urls || [])
                if (isReorderMode) {
                  console.log(
                    `並び替えモード中にドメイン ${group.domain} のタブをすべて開きました`,
                  )
                }
              }}
              className='flex cursor-pointer items-center gap-1'
              aria-label={t('savedTabs.openAllTabs')}
            >
              <ExternalLink size={14} />
              <SavedTabsResponsiveLabel>
                {t('savedTabs.openAll')}
              </SavedTabsResponsiveLabel>
            </Button>
          </TooltipTrigger>
          <SavedTabsResponsiveTooltipContent side='top'>
            {t('savedTabs.openAllTabs')}
          </SavedTabsResponsiveTooltipContent>
        </Tooltip>

        {/* グループ削除 */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant='secondary'
              size='sm'
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
              aria-label={t('savedTabs.deleteAllTabs')}
            >
              <Trash size={14} />
              <SavedTabsResponsiveLabel>
                {t('savedTabs.deleteAll')}
              </SavedTabsResponsiveLabel>
            </Button>
          </TooltipTrigger>
          <SavedTabsResponsiveTooltipContent side='top'>
            {t('savedTabs.deleteAllTabs')}
          </SavedTabsResponsiveTooltipContent>
        </Tooltip>

        {/* キーワードモーダル */}
        {keywordModal.showKeywordModal && (
          <CategoryKeywordModal
            group={group}
            isOpen={keywordModal.showKeywordModal}
            onClose={keywordModal.handleCloseKeywordModal}
            onSave={handleSaveKeywords}
            onDeleteCategory={categoryActions.handleCategoryDelete}
            parentCategories={parentCategories.categories}
            onCreateParentCategory={parentCategories.handleCreateParentCategory}
            onAssignToParentCategory={
              parentCategories.handleAssignToParentCategory
            }
            onUpdateParentCategories={
              parentCategories.handleUpdateParentCategories
            }
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
              {t('savedTabs.openAllConfirmDescription', undefined, {
                count: '10',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                handlers.handleOpenAllTabs(group.urls || [])
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
              {t('savedTabs.domain.deleteAllWarning')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
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
