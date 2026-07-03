import { Edit, Plus, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

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
import type {
  SavedTabsParentCategoryDto as ParentCategory,
  SavedTabsTabGroupDto as TabGroup,
} from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'
import { DeleteEntityConfirmPanel } from '@/contexts/saved-tabs/presentation/components/shared/DeleteEntityConfirmPanel'
import {
  SavedTabsResponsiveLabel,
  SavedTabsResponsiveTooltipContent,
} from '@/contexts/saved-tabs/presentation/components/shared/SavedTabsResponsive'
import { useI18n } from '@/features/i18n/context/I18nProvider'

import type {
  CategoryManagementModalDeps,
  CategoryManagementModalUseCases,
} from './CategoryManagementModal.types'
import { useCategoryActions } from './useCategoryActions'
import { useCategoryFormState } from './useCategoryFormState'

export type {
  CategoryManagementModalDeps,
  CategoryManagementModalUseCases,
} from './CategoryManagementModal.types'

// 型定義
interface AvailableDomain {
  id: string
  domain: string
}

/**
 * `CategoryManagementModal` が port / query にアクセスするために受け取る
 * 依存バンドル (issue #510, #518)。`chrome.storage.local` 直叩きと
 * `tabGroupRepository` / `parentCategoryRepository` 直叩きを port / query
 * / use-case へ統一する。`parentCategoryRepository` は issue #518 で
 * 撤去され、削除・更新は `CategoryManagementModalUseCases` 経由で
 * 実行する。
 */
// 親カテゴリ管理モーダルの型定義
interface CategoryManagementModalProps {
  isOpen: boolean
  onClose: () => void
  category: {
    id: string
    name: string
  }
  domains: TabGroup[]
  deps: CategoryManagementModalDeps
  useCases: CategoryManagementModalUseCases
}

const DeleteConfirmSection = ({
  showDeleteConfirm,
  localCategoryName,
  domains,
  isProcessing,
  handleHideDeleteConfirm,
  handleDelete,
}: {
  showDeleteConfirm: boolean
  localCategoryName: string
  domains: TabGroup[]
  isProcessing: boolean
  handleHideDeleteConfirm: () => void
  handleDelete: () => void
}) => {
  const { t } = useI18n()

  if (!showDeleteConfirm) {
    return null
  }

  const deleteDescription =
    t('savedTabs.categoryManagement.deleteConfirmDescription', undefined, {
      name: localCategoryName,
    }) +
    (domains.length > 0
      ? `\n${t('savedTabs.categoryManagement.deleteConfirmDomains', undefined, { count: String(domains.length) })}`
      : '')

  return (
    <DeleteEntityConfirmPanel
      description={deleteDescription}
      cancelLabel={t('common.cancel')}
      deleteLabel={t('common.delete')}
      deleteTooltip={t('savedTabs.categoryManagement.deleteAction')}
      isProcessing={isProcessing}
      onCancel={handleHideDeleteConfirm}
      onDelete={handleDelete}
    />
  )
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
  const currentDomainIdSet = new Set(targetCategory?.domains)

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
const DomainBadge = ({
  domain,
  isProcessing,
  onRemove,
}: {
  domain: TabGroup
  isProcessing: boolean
  onRemove: (id: string) => void
}) => {
  const { t } = useI18n()
  const handleRemove = useCallback(() => {
    onRemove(domain.id)
  }, [onRemove, domain.id])

  return (
    <Badge
      variant='outline'
      className='flex items-center gap-1 rounded px-2 py-1'
    >
      {domain.domain}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant='ghost'
            size='sm'
            onClick={handleRemove}
            className='ml-1 cursor-pointer text-zinc-400 hover:text-zinc-200'
            aria-label={t('savedTabs.categoryManagement.removeDomainAria')}
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
  )
}

const RenameActionButton = ({
  handleStartRenaming,
}: {
  handleStartRenaming: () => void
}) => {
  const { t } = useI18n()
  return (
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
  )
}

const DeleteActionButton = ({
  handleShowDeleteConfirm,
  isProcessing,
}: {
  handleShowDeleteConfirm: () => void
  isProcessing: boolean
}) => {
  const { t } = useI18n()
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant='secondary'
          size='sm'
          onClick={handleShowDeleteConfirm}
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
  )
}

const CategoryRenameSection = ({
  localCategoryName,
  isRenaming,
  newCategoryName,
  categoryNameError,
  isProcessing,
  handleStartRenaming,
  handleShowDeleteConfirm,
  handleCategoryNameChange,
  inputRef,
  onBlur,
  onKeyDown,
}: {
  localCategoryName: string
  isRenaming: boolean
  newCategoryName: string
  categoryNameError: string | null
  isProcessing: boolean
  handleStartRenaming: () => void
  handleShowDeleteConfirm: () => void
  handleCategoryNameChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  inputRef: React.RefObject<HTMLInputElement | null>
  onBlur: () => void
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void
}) => {
  const { t } = useI18n()

  return (
    <div className='mb-4'>
      <div className='mb-2 flex items-center justify-between'>
        <Label>{t('savedTabs.categoryManagement.nameLabel')}</Label>
        {!isRenaming && (
          <div className='flex items-center gap-2'>
            <RenameActionButton handleStartRenaming={handleStartRenaming} />
            <DeleteActionButton
              handleShowDeleteConfirm={handleShowDeleteConfirm}
              isProcessing={isProcessing}
            />
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
            placeholder={t('savedTabs.categoryManagement.renamePlaceholder')}
            className={`w-full flex-1 rounded border p-2 ${categoryNameError ? 'border-red-500' : ''}`}
            onBlur={onBlur}
            onKeyDown={onKeyDown}
          />
          {categoryNameError && (
            <p className='mt-1 text-xs text-red-500'>{categoryNameError}</p>
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
  )
}

const RegisteredDomainsSection = ({
  domains,
  isProcessing,
  onRemoveDomain,
}: {
  domains: TabGroup[]
  isProcessing: boolean
  onRemoveDomain: (id: string) => void
}) => {
  const { t } = useI18n()

  return (
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
            <DomainBadge
              key={domain.id}
              domain={domain}
              isProcessing={isProcessing}
              onRemove={onRemoveDomain}
            />
          ))
        )}
      </div>
    </div>
  )
}

const AddDomainSection = ({
  availableDomains,
  activeSelectedDomain,
  isProcessing,
  setSelectedDomain,
  onAddDomain,
}: {
  availableDomains: AvailableDomain[]
  activeSelectedDomain: string
  isProcessing: boolean
  setSelectedDomain: (value: string) => void
  onAddDomain: React.MouseEventHandler<HTMLButtonElement>
}) => {
  const { t } = useI18n()

  return (
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
                onClick={onAddDomain}
                className='cursor-pointer'
                data-testid='add-domain-button'
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
  )
}

// eslint-disable-next-line eslint/complexity
const useCategoryManagementModalView = ({
  isOpen,
  onClose,
  category,
  domains,
  deps,
  useCases,
}: CategoryManagementModalProps) => {
  const { getSavedTabsPageDataQuery } = deps
  // `categoryAssignmentPort` is exposed by the deps bundle for callers that
  // wire additional port-based mutations, but the modal currently routes
  // its writes through the dedicated use-cases (rename / add / remove
  // domain / delete category). The reference is kept so the dep type stays
  // stable across components.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { categoryAssignmentPort: _categoryAssignmentPort } = deps
  const { t } = useI18n()
  const {
    categoryNameError,
    isProcessing,
    isRenaming,
    localCategoryName,
    newCategoryName,
    setCategoryNameError,
    setIsProcessing,
    setIsRenaming,
    setLocalCategoryName,
    setNewCategoryName,
    validateCategoryName,
  } = useCategoryFormState(category.name)
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
  useEffect(() => {
    let isMounted = true

    const loadDomainSources = async () => {
      try {
        const pageData = await getSavedTabsPageDataQuery()
        if (!isMounted) {
          return
        }
        setSavedTabGroups(
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- domain.TabGroup (branded readonly) を storage 層 TabGroup へ投影
          [...pageData.tabGroups] as unknown as TabGroup[],
        )
        setParentCategories(
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- domain.ParentCategory (branded) を storage 層 ParentCategory へ投影
          [...pageData.parentCategories] as unknown as ParentCategory[],
        )
      } catch (error) {
        console.error('利用可能なドメインの取得に失敗しました:', error)
      }
    }

    void loadDomainSources()

    return () => {
      isMounted = false
    }
  }, [category.id, getSavedTabsPageDataQuery, isOpen])

  const {
    handleStartRenaming,
    handleCancelRenaming,
    handleCategoryNameChange,
    handleSaveRenaming,
    handleDeleteCategory,
    handleShowDeleteConfirm,
    handleHideDeleteConfirm,
    handleAddDomainClick,
    handleRemoveDomain,
  } = useCategoryActions({
    categoryNameError,
    isProcessing,
    isRenaming,
    localCategoryName,
    newCategoryName,
    setCategoryNameError,
    setIsProcessing,
    setIsRenaming,
    setLocalCategoryName,
    setNewCategoryName,
    validateCategoryName,
    category,
    domains,
    onClose,
    useCases,
    activeSelectedDomain,
    availableDomains,
    setParentCategories,
    setSelectedDomain,
    isSaving,
    setIsSaving,
    inputRef,
    setShowDeleteConfirm,
    t,
  })

  const handleDelete = useCallback(() => {
    void handleDeleteCategory()
  }, [handleDeleteCategory])

  const handleRemoveDomainWrapper = useCallback(
    (id: string) => {
      void handleRemoveDomain(id)
    },
    [handleRemoveDomain],
  )

  const handleDialogOpenChange = useCallback(() => {
    if (isProcessing || isRenaming || isSaving) {
      return
    }
    if (document.readyState === 'loading') {
      return
    }
    onClose()
  }, [isProcessing, isRenaming, isSaving, onClose])

  const handleInputBlur = useCallback(() => {
    if (isProcessing) {
      return
    }
    const trimmedName = newCategoryName.trim()
    if (
      trimmedName &&
      trimmedName !== localCategoryName &&
      !categoryNameError
    ) {
      void handleSaveRenaming()
    } else if (categoryNameError) {
      inputRef.current?.focus()
    } else {
      handleCancelRenaming()
    }
  }, [
    isProcessing,
    newCategoryName,
    localCategoryName,
    categoryNameError,
    handleSaveRenaming,
    inputRef,
    handleCancelRenaming,
  ])

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        const trimmedName = newCategoryName.trim()
        if (
          trimmedName &&
          trimmedName !== localCategoryName &&
          !categoryNameError &&
          !isProcessing
        ) {
          void handleSaveRenaming()
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        handleCancelRenaming()
      }
    },
    [
      newCategoryName,
      localCategoryName,
      categoryNameError,
      isProcessing,
      handleSaveRenaming,
      handleCancelRenaming,
    ],
  )

  if (!isOpen) {
    return null
  }
  return (
    <Dialog open={isOpen} onOpenChange={handleDialogOpenChange}>
      <DialogContent className='max-h-[90vh] overflow-y-auto'>
        <DialogHeader className='text-left'>
          <DialogTitle>
            {t('savedTabs.categoryManagement.title', undefined, {
              name: localCategoryName,
            })}
          </DialogTitle>
        </DialogHeader>

        <div ref={modalContentRef} className='gap-y-4'>
          <CategoryRenameSection
            localCategoryName={localCategoryName}
            isRenaming={isRenaming}
            newCategoryName={newCategoryName}
            categoryNameError={categoryNameError}
            isProcessing={isProcessing}
            handleStartRenaming={handleStartRenaming}
            handleShowDeleteConfirm={handleShowDeleteConfirm}
            handleCategoryNameChange={handleCategoryNameChange}
            inputRef={inputRef}
            onBlur={handleInputBlur}
            onKeyDown={handleInputKeyDown}
          />

          <DeleteConfirmSection
            showDeleteConfirm={showDeleteConfirm}
            localCategoryName={localCategoryName}
            domains={domains}
            isProcessing={isProcessing}
            handleHideDeleteConfirm={handleHideDeleteConfirm}
            handleDelete={handleDelete}
          />

          <RegisteredDomainsSection
            domains={domains}
            isProcessing={isProcessing}
            onRemoveDomain={handleRemoveDomainWrapper}
          />

          <AddDomainSection
            availableDomains={availableDomains}
            activeSelectedDomain={activeSelectedDomain}
            isProcessing={isProcessing}
            setSelectedDomain={setSelectedDomain}
            onAddDomain={handleAddDomainClick}
          />
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
