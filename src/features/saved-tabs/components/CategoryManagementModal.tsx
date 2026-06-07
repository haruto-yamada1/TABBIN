import { Edit, Plus, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tooltip, TooltipTrigger } from '@/components/ui/tooltip'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import {
  categoryNameSchema,
  createCategoryNameSchema,
} from '@/features/saved-tabs/components/categoryNameSchema'
import { DeleteEntityConfirmPanel } from '@/features/saved-tabs/components/shared/DeleteEntityConfirmPanel'
import {
  SavedTabsResponsiveLabel,
  SavedTabsResponsiveTooltipContent,
} from '@/features/saved-tabs/components/shared/SavedTabsResponsive'
import type { ParentCategory, TabGroup } from '@/types/storage'

// 型定義
interface AvailableDomain {
  id: string
  domain: string
}

// 親カテゴリ管理モーダルの型定義
interface CategoryManagementModalProps {
  isOpen: boolean
  onClose: () => void
  category: {
    id: string
    name: string
  }
  domains: TabGroup[]
  onCategoryUpdate?: (categoryId: string, newName: string) => void
}

interface CategoryManagementFormState {
  categoryNameError: string | null
  isProcessing: boolean
  isRenaming: boolean
  localCategoryName: string
  newCategoryName: string
}

const createCategoryManagementFormState = (
  categoryName: string,
): CategoryManagementFormState => ({
  categoryNameError: null,
  isProcessing: false,
  isRenaming: false,
  localCategoryName: categoryName,
  newCategoryName: categoryName,
})
const confirmCategoryNameUpdated = async (
  categoryId: string,
  trimmedName: string,
): Promise<boolean> => {
  const { parentCategories = [] } = await chrome.storage.local.get<{
// eslint-disable-next-line typescript/consistent-type-imports
    parentCategories?: import('@/types/storage').ParentCategory[]
  }>('parentCategories')
  const categoriesById = new Map(
    parentCategories.map((cat: ParentCategory) => [cat.id, cat]),
  )
  const updatedCategory = categoriesById.get(categoryId)
  if (updatedCategory?.name === trimmedName) {
    console.log('Modal - カテゴリ名の更新を確認:', updatedCategory)
    return true
  }
  return false
}
const updateCategoryWithDomain = async (
  categoryId: string,
  selectedDomain: string,
  selectedDomainInfo: AvailableDomain,
): Promise<ParentCategory[]> => {
  const { parentCategories = [] } = await chrome.storage.local.get<{
// eslint-disable-next-line typescript/consistent-type-imports
    parentCategories?: import('@/types/storage').ParentCategory[]
  }>('parentCategories')
  const targetCategory = parentCategories.find(
    (cat: ParentCategory) => cat.id === categoryId,
  )
  if (!targetCategory) {
    throw new Error('カテゴリが見つかりません')
  }
  const existingDomainNames = targetCategory.domainNames || []
  if (
    targetCategory.domains.includes(selectedDomain) ||
    existingDomainNames.includes(selectedDomainInfo.domain)
  ) {
    throw new Error('このドメインは既にカテゴリに追加されています')
  }
  const updatedCategories = parentCategories.map((cat: ParentCategory) =>
    cat.id === categoryId
      ? {
          ...cat,
          domainNames: [...existingDomainNames, selectedDomainInfo.domain],
          domains: [...cat.domains, selectedDomain],
        }
      : cat,
  )
  await chrome.storage.local.set({
    parentCategories: updatedCategories,
  })
  return updatedCategories
}
const buildAvailableDomains = ({
  categoryId,
  parentCategories,
  savedTabs,
}: {
  categoryId: string
  parentCategories: ParentCategory[]
  savedTabs: TabGroup[]
}): AvailableDomain[] => {
  const targetCategory = parentCategories.find(
    (parentCategory) => parentCategory.id === categoryId,
  )
// eslint-disable-next-line typescript/prefer-nullish-coalescing
  const currentDomainIdSet = new Set(targetCategory?.domains || [])

  return savedTabs.reduce<AvailableDomain[]>((domains, tab) => {
    if (!currentDomainIdSet.has(tab.id)) {
      domains.push({
        domain: tab.domain,
        id: tab.id,
      })
    }
    return domains
  }, [])
}
const useCategoryManagementModalView = ({
  isOpen,
  onClose,
  category,
  domains,
  onCategoryUpdate,
}: CategoryManagementModalProps) => {
  const { t } = useI18n()
  const localizedCategoryNameSchema = useMemo(
    () =>
      createCategoryNameSchema({
        empty: t('savedTabs.categoryModal.validation.empty'),
        maxLength: t('savedTabs.categoryModal.validation.maxLength'),
      }),
    [t],
  )
  const [
    {
      categoryNameError,
      isProcessing,
      isRenaming,
      localCategoryName,
      newCategoryName,
    },
    setFormState,
  ] = useState<CategoryManagementFormState>(() =>
    createCategoryManagementFormState(category.name),
  )
  const setCategoryNameError = (categoryNameError: string | null) => {
    setFormState((prev) => ({ ...prev, categoryNameError }))
  }
  const setIsProcessing = (isProcessing: boolean) => {
    setFormState((prev) => ({ ...prev, isProcessing }))
  }
  const setIsRenaming = (isRenaming: boolean) => {
    setFormState((prev) => ({ ...prev, isRenaming }))
  }
  const setLocalCategoryName = (localCategoryName: string) => {
    setFormState((prev) => ({ ...prev, localCategoryName }))
  }
  const setNewCategoryName = (newCategoryName: string) => {
    setFormState((prev) => ({ ...prev, newCategoryName }))
  }
  const [isSaving, setIsSaving] = useState(false) // 保存処理中の状態
  const [savedTabGroups, setSavedTabGroups] = useState<TabGroup[]>([])
  const [parentCategories, setParentCategories] = useState<ParentCategory[]>([])
  const [selectedDomain, setSelectedDomain] = useState('')
  const modalContentRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const availableDomains = useMemo(
    () =>
      buildAvailableDomains({
        categoryId: category.id,
        parentCategories,
        savedTabs: savedTabGroups,
      }),
    [category.id, parentCategories, savedTabGroups],
  )
  const activeSelectedDomain = availableDomains.some(
    (domain) => domain.id === selectedDomain,
  )
    ? selectedDomain
    : (availableDomains[0]?.id ?? '')

  // 入力値バリデーション関数
  const validateCategoryName = (name: string) => {
    categoryNameSchema.schema = localizedCategoryNameSchema
    const result = categoryNameSchema.safeParse(name)
    if (!result.success) {
      const issue = result.error.issues[0]
      if (issue?.code === 'too_small') {
        setCategoryNameError(t('savedTabs.categoryModal.validation.empty'))
      } else if (issue?.code === 'too_big') {
        setCategoryNameError(t('savedTabs.categoryModal.validation.maxLength'))
      } else {
        setCategoryNameError(t('savedTabs.categoryModal.invalid'))
      }
      return false
    }
    setCategoryNameError(null)
    return true
  }

  useEffect(() => {
    let isMounted = true

    const loadDomainSources = async () => {
      try {
        const [{ savedTabs = [] }, { parentCategories = [] }] =
          await Promise.all([
            chrome.storage.local.get<{
// eslint-disable-next-line typescript/consistent-type-imports
              savedTabs?: import('@/types/storage').TabGroup[]
            }>('savedTabs'),
            chrome.storage.local.get<{
// eslint-disable-next-line typescript/consistent-type-imports
              parentCategories?: import('@/types/storage').ParentCategory[]
            }>('parentCategories'),
          ])

        if (!isMounted) {
          return
        }

        setSavedTabGroups(savedTabs)
        setParentCategories(parentCategories)
      } catch (error) {
        console.error('利用可能なドメインの取得に失敗しました:', error)
      }
    }

    void loadDomainSources()

    return () => {
      isMounted = false
    }
  }, [category.id, isOpen])

  // カテゴリのリネーム処理を開始
  const handleStartRenaming = () => {
    setNewCategoryName(localCategoryName)
    setIsRenaming(true)
    setCategoryNameError(null) // エラー状態をリセット
    // 入力フィールドにフォーカス
    // 即座にフォーカスと選択を行う
    requestAnimationFrame(() => {
      if (inputRef.current) {
        inputRef.current.focus()
        inputRef.current.select()
      }
    })
  }

  // リネームをキャンセル
  const handleCancelRenaming = () => {
    setIsRenaming(false)
    setNewCategoryName(localCategoryName)
    setCategoryNameError(null) // エラー状態をリセット
  }

  // 入力変更時の処理
  const handleCategoryNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target
    setNewCategoryName(value)
    validateCategoryName(value) // リアルタイムバリデーション
  }

  // カテゴリ名の変更処理
  const handleSaveRenaming = async () => {
    console.log('Modal - handleSaveRenaming開始', {
      currentCategory: category,
      hasUpdateCallback: Boolean(onCategoryUpdate),
      localState: {
        isProcessing,
        isRenaming,
        localCategoryName,
        newCategoryName,
      },
    })

    // バリデーション
    if (!validateCategoryName(newCategoryName.trim())) {
      // エラーがある場合、処理を中止
      return
    }
    setIsProcessing(true)
    const trimmedName = newCategoryName.trim()
    console.log('Modal - 処理開始:', {
      categoryId: category.id,
      newName: trimmedName,
      oldName: category.name,
    })
    try {
      // OnCategoryUpdateが提供されていない場合はエラー
      if (!onCategoryUpdate) {
        throw new Error('カテゴリ更新機能が利用できません')
      }

      // カテゴリ名の更新処理を実行
      console.log('Modal - onCategoryUpdate呼び出し開始', {
        categoryId: category.id,
        newName: trimmedName,
      })
      setIsSaving(true)
      try {
        await onCategoryUpdate(category.id, trimmedName)
        console.log('Modal - onCategoryUpdate呼び出し完了')
      } finally {
        setIsSaving(false)
        console.log('Modal - 保存状態をリセット')
      }
      const isUpdateConfirmed = await confirmCategoryNameUpdated(
        category.id,
        trimmedName,
      )
      if (!isUpdateConfirmed) {
        throw new Error('カテゴリ名の更新が確認できません')
      }

      // すべての更新が完了したことを確認してからリロード
      console.log('Modal - 最終確認開始')
      const finalCheck = await chrome.storage.local.get<{
// eslint-disable-next-line typescript/consistent-type-imports
        parentCategories?: import('@/types/storage').ParentCategory[]
      }>('parentCategories')
      const finalCategory = finalCheck.parentCategories?.find(
        (cat: ParentCategory) => cat.id === category.id,
      )
      if (finalCategory?.name !== trimmedName) {
        console.error('Modal - 最終確認でカテゴリ名が一致しません:', {
          actual: finalCategory?.name,
          expected: trimmedName,
        })
        throw new Error('カテゴリ名の更新が完了していません')
      }

      // すべての更新が確認できたら親コンポーネントに通知
      console.log('Modal - カテゴリ更新が完了しました')
      toast.success(
        t('savedTabs.categoryManagement.renamed', undefined, {
          after: trimmedName,
          before: category.name,
        }),
      )
      setLocalCategoryName(trimmedName)
      setIsRenaming(false)
    } catch (error) {
      console.error('Modal - カテゴリ名の更新に失敗:', {
        categoryId: category.id,
        error,
        isProcessing,
        newName: trimmedName,
        oldName: category.name,
        stack: error instanceof Error ? error.stack : undefined,
      })
      toast.error(t('savedTabs.categoryManagement.renameError'))
    } finally {
      console.log('Modal - 処理完了', {
        isProcessing,
        localCategoryName,
        newCategoryName,
      })
      setIsProcessing(false)
    }
  }

  // 親カテゴリ削除処理
  const handleDeleteCategory = async () => {
    if (isProcessing) {
      return
    }
    setIsProcessing(true)
    try {
      const data = await chrome.storage.local.get<{
// eslint-disable-next-line typescript/consistent-type-imports
        parentCategories?: import('@/types/storage').ParentCategory[]
      }>('parentCategories')
      const parentCategories: ParentCategory[] = data.parentCategories ?? []
      const updatedCategories = parentCategories.filter(
        (cat) => cat.id !== category.id,
      )
      await chrome.storage.local.set({
        parentCategories: updatedCategories,
      })
      toast.success(
        t('savedTabs.categoryModal.deleted', undefined, {
          name: category.name,
        }),
      )
      onClose()
    } catch (error) {
      console.error('親カテゴリの削除に失敗しました:', error)
      toast.error(t('savedTabs.categoryModal.deleteError'))
    } finally {
      setIsProcessing(false)
    }
  }

  // ドメインをカテゴリに追加
  const handleAddDomain = async () => {
    if (!activeSelectedDomain || isProcessing) {
      return
    }
    setIsProcessing(true)
    try {
      const selectedDomainInfo = availableDomains.find(
        (d) => d.id === activeSelectedDomain,
      )
      if (!selectedDomainInfo) {
        throw new Error('ドメインが見つかりません')
      }
      const updatedCategories = await updateCategoryWithDomain(
        category.id,
        activeSelectedDomain,
        selectedDomainInfo,
      )
      setParentCategories(updatedCategories)
      setSelectedDomain('')
      toast.success(
        t('savedTabs.categoryModal.domainAssigned', undefined, {
          categoryName: category.name,
          domain: selectedDomainInfo.domain,
        }),
      )
    } catch (error) {
      console.error('ドメインの追加に失敗しました:', error)
      toast.error(t('savedTabs.categoryModal.toggleError'))
    } finally {
      setIsProcessing(false)
    }
  }

  // ドメインをカテゴリから削除
  const handleRemoveDomain = async (domainId: string) => {
    if (isProcessing) {
      return
    }
    setIsProcessing(true)
    try {
      // 現在のカテゴリデータを取得
      const { parentCategories = [] } = await chrome.storage.local.get<{
// eslint-disable-next-line typescript/consistent-type-imports
        parentCategories?: import('@/types/storage').ParentCategory[]
      }>('parentCategories')

      // 対象のカテゴリを検索
      const targetCategory = parentCategories.find(
        (cat: ParentCategory) => cat.id === category.id,
      )
      if (!targetCategory) {
        throw new Error('カテゴリが見つかりません')
      }

      // 削除するドメインの情報を取得
      const domainInfo = domains.find((d) => d.id === domainId)
      if (!domainInfo) {
        throw new Error('ドメインが見つかりません')
      }

      // カテゴリを更新
      const updatedCategories = parentCategories.map((cat: ParentCategory) => {
        if (cat.id === category.id) {
          return {
            ...cat,
            domainNames: (cat.domainNames || []).filter(
              (d) => d !== domainInfo.domain,
            ),
            domains: cat.domains.filter((d) => d !== domainId),
          }
        }
        return cat
      })

      // 保存
      await chrome.storage.local.set({
        parentCategories: updatedCategories,
      })
      setParentCategories(updatedCategories)
      toast.success(
        t('savedTabs.categoryModal.domainRemoved', undefined, {
          categoryName: category.name,
          domain: domainInfo.domain,
        }),
      )
    } catch (error) {
      console.error('ドメインの削除に失敗しました:', error)
      toast.error(t('savedTabs.categoryModal.deleteError'))
    } finally {
      setIsProcessing(false)
    }
  }
  if (!isOpen) {
    return null
  }
  return (
    <Dialog
      open={isOpen}
      onOpenChange={() => {
        // 処理中またはリネームモード中は閉じない
        if (isProcessing || isRenaming || isSaving) {
          console.log('Modal - 処理中のためモーダルを閉じません')
          return
        }

        // リロード中は閉じない
        if (document.readyState === 'loading') {
          console.log('Modal - ページリロード中のためモーダルを閉じません')
          return
        }
        onClose()
      }}
    >
      <DialogContent className='max-h-[90vh] overflow-y-auto'>
        <DialogHeader className='text-left'>
          <DialogTitle>
            {t('savedTabs.categoryManagement.title', undefined, {
              name: localCategoryName,
            })}
          </DialogTitle>
        </DialogHeader>

        <div ref={modalContentRef} className='gap-y-4'>
          {/* カテゴリ名変更セクション */}
          <div className='mb-4'>
            <div className='mb-2 flex items-center justify-between'>
              <Label>{t('savedTabs.categoryManagement.nameLabel')}</Label>
              {!isRenaming && (
                <div className='flex items-center gap-2'>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant='secondary'
                        size='sm'
                        onClick={handleStartRenaming}
                        className='flex cursor-pointer items-center gap-2 rounded px-2 py-1'
                      >
                        <Edit size={14} />
                        <SavedTabsResponsiveLabel>
                          {t('savedTabs.categoryManagement.renameAction')}
                        </SavedTabsResponsiveLabel>
                      </Button>
                    </TooltipTrigger>
                    <SavedTabsResponsiveTooltipContent side='top'>
                      {t('savedTabs.categoryManagement.renameAction')}
                    </SavedTabsResponsiveTooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant='secondary'
                        size='sm'
                        onClick={() => setShowDeleteConfirm(true)}
                        className='flex cursor-pointer items-center gap-2 rounded px-2 py-1'
                        disabled={isProcessing}
                      >
                        <Trash2 size={14} />
                        <SavedTabsResponsiveLabel>
                          {t('savedTabs.categoryManagement.deleteAction')}
                        </SavedTabsResponsiveLabel>
                      </Button>
                    </TooltipTrigger>
                    <SavedTabsResponsiveTooltipContent side='top'>
                      {t('savedTabs.categoryManagement.deleteAction')}
                    </SavedTabsResponsiveTooltipContent>
                  </Tooltip>
                </div>
              )}
            </div>

            {isRenaming ? (
              <div className='mt-2 w-full rounded border p-3'>
                <div className='mb-2 text-sm text-zinc-300'>
                  {t('savedTabs.categoryManagement.renamePrompt', undefined, {
                    name: localCategoryName,
                  })}
                </div>
                <Input
                  ref={inputRef}
                  value={newCategoryName}
                  onChange={handleCategoryNameChange}
                  placeholder={t(
                    'savedTabs.categoryManagement.renamePlaceholder',
                  )}
                  className={`w-full flex-1 rounded border p-2 ${categoryNameError ? 'border-red-500' : ''}`}
                  onBlur={() => {
                    if (isProcessing) {
                      return // 処理中は何もしない
                    }
                    const trimmedName = newCategoryName.trim()
                    if (
                      trimmedName &&
                      trimmedName !== localCategoryName &&
                      !categoryNameError
                    ) {
// eslint-disable-next-line typescript/no-floating-promises
                      handleSaveRenaming()
                    } else if (categoryNameError) {
                      // エラーがある場合はフォーカスを維持
                      inputRef.current?.focus()
                    } else {
                      handleCancelRenaming()
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      const trimmedName = newCategoryName.trim()
                      if (
                        trimmedName &&
                        trimmedName !== localCategoryName &&
                        !categoryNameError &&
                        !isProcessing
                      ) {
// eslint-disable-next-line typescript/no-floating-promises
                        handleSaveRenaming()
                      }
                    } else if (e.key === 'Escape') {
                      e.preventDefault()
                      handleCancelRenaming()
                    }
                  }}
                />
                {categoryNameError && (
                  <p className='mt-1 text-xs text-red-500'>
                    {categoryNameError}
                  </p>
                )}
              </div>
            ) : (
              <Button
                onClick={handleStartRenaming}
                className='w-full justify-start rounded border bg-secondary/20 p-2 hover:bg-secondary/30'
                type='button'
                variant='outline'
              >
                {localCategoryName}
              </Button>
            )}
          </div>
          {showDeleteConfirm && (
            <DeleteEntityConfirmPanel
              description={
                <>
                  {t(
                    'savedTabs.categoryManagement.deleteConfirmDescription',
                    undefined,
                    {
                      name: localCategoryName,
                    },
                  )}
                  {domains.length > 0 ? (
                    <span className='mt-1 block text-xs'>
                      {t(
                        'savedTabs.categoryManagement.deleteConfirmDomains',
                        undefined,
                        {
                          count: String(domains.length),
                        },
                      )}
                    </span>
                  ) : null}
                </>
              }
              cancelLabel={t('common.cancel')}
              deleteLabel={t('common.delete')}
              deleteTooltip={t('savedTabs.categoryManagement.deleteAction')}
              isProcessing={isProcessing}
              onCancel={() => setShowDeleteConfirm(false)}
// eslint-disable-next-line typescript/no-misused-promises
              onDelete={handleDeleteCategory}
            />
          )}

          {/* 登録済みドメイン一覧 */}
          <div className='mb-4'>
            <Label className='mb-2 block'>
              {t('savedTabs.categoryManagement.registeredDomainsLabel')}
            </Label>
            <div className='flex max-h-40 flex-wrap gap-2 overflow-y-auto rounded border p-2'>
              {domains.length === 0 ? (
                <p className='text-zinc-500'>
                  {t('savedTabs.categoryManagement.registeredDomainsEmpty')}
                </p>
              ) : (
                domains.map((domain) => (
                  <Badge
                    key={domain.id}
                    variant='outline'
                    className='flex items-center gap-1 rounded px-2 py-1'
                  >
                    {domain.domain}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant='ghost'
                          size='sm'
// eslint-disable-next-line typescript/no-misused-promises
                          onClick={() => handleRemoveDomain(domain.id)}
                          className='ml-1 cursor-pointer text-zinc-400 hover:text-zinc-200'
                          aria-label={t(
                            'savedTabs.categoryManagement.removeDomainAria',
                          )}
                          disabled={isProcessing}
                        >
                          <X size={14} />
                        </Button>
                      </TooltipTrigger>
                      <SavedTabsResponsiveTooltipContent side='top'>
                        {t('common.delete')}
                      </SavedTabsResponsiveTooltipContent>
                    </Tooltip>
                  </Badge>
                ))
              )}
            </div>
          </div>

          {/* ドメイン追加セクション */}
          <div className='mb-4'>
            <Label className='mb-2 block'>
              {t('savedTabs.categoryManagement.addDomainLabel')}
            </Label>
            {availableDomains.length > 0 ? (
              <div className='flex gap-2'>
                <Select
                  value={activeSelectedDomain}
                  onValueChange={setSelectedDomain}
                  disabled={isProcessing}
                >
                  <SelectTrigger className='w-full rounded border p-2'>
                    <SelectValue
                      placeholder={t(
                        'savedTabs.categoryManagement.addDomainPlaceholder',
                      )}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {availableDomains.map((domain) => (
                      <SelectItem
                        key={domain.id}
                        value={domain.id}
                        className='cursor-pointer'
                      >
                        {domain.domain}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant='default'
                      size='icon'
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
// eslint-disable-next-line typescript/no-floating-promises
                        handleAddDomain()
                      }}
                      className='cursor-pointer'
                      disabled={!activeSelectedDomain || isProcessing}
                    >
                      <Plus size={18} />
                    </Button>
                  </TooltipTrigger>
                  <SavedTabsResponsiveTooltipContent side='top'>
                    {t('savedTabs.categoryManagement.addDomainTooltip')}
                  </SavedTabsResponsiveTooltipContent>
                </Tooltip>
              </div>
            ) : (
              <p className='text-zinc-500'>
                {t('savedTabs.categoryManagement.noAvailableDomains')}
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

const CategoryManagementModalContent = (props: CategoryManagementModalProps) =>
  useCategoryManagementModalView(props)

const CategoryManagementModal = (props: CategoryManagementModalProps) => {
  if (!props.isOpen) {
    return null
  }

  return (
    <CategoryManagementModalContent
      key={`${props.category.id}:${props.category.name}`}
      {...props}
    />
  )
}

export { CategoryManagementModal }
