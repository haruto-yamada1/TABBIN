import { Plus } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import { SubCategoryButton } from '@/features/options/SubCategoryButton'
import { SubCategoryKeywordTag } from '@/features/options/SubCategoryKeywordTag'
import { SubCategoryRenameSection } from '@/features/options/SubCategoryRenameSection'
import {
  removeSubCategoryFromTabGroup,
  renameSubCategoryInTabGroup,
  setCategoryKeywords,
} from '@/lib/storage/tabs'
import type { TabGroup } from '@/types/storage'

import {
  getCategoryKeywordsForName,
  getRenameDraftName,
  updateTabGroup,
} from './subCategoryKeywordManager.helpers'

type NewSubCategoryFieldProps = {
  value: string
  label: string
  placeholder: string
  onChange: (value: string) => void
  onAdd: () => void
}

const NewSubCategoryField = ({
  value,
  label,
  placeholder,
  onChange,
  onAdd,
}: NewSubCategoryFieldProps) => {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value)
    },
    [onChange],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        onAdd()
      }
    },
    [onAdd],
  )

  return (
    <div className='mb-4'>
      <Label
        htmlFor='new-subcategory'
        className='mb-1 block text-sm font-medium text-foreground'
      >
        {label}
      </Label>
      <Input
        id='new-subcategory'
        type='text'
        value={value}
        onChange={handleChange}
        onBlur={onAdd}
        placeholder={placeholder}
        className='w-full rounded border border-border bg-input p-2 text-foreground focus:ring-2 focus:ring-ring'
        onKeyDown={handleKeyDown}
      />
    </div>
  )
}

const useSubCategoryKeywordManagerView = ({
  // eslint-disable-line eslint/max-lines-per-function
  tabGroup,
}: {
  tabGroup: TabGroup
}) => {
  const { t } = useI18n()
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [keywords, setKeywords] = useState<string[]>([])
  const [newKeyword, setNewKeyword] = useState('')
  const [newSubCategory, setNewSubCategory] = useState('')

  // リネームモード用の状態を追加
  const [isRenamingSubCategory, setIsRenamingSubCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)

  const handleCategorySelect = useCallback(
    (categoryName: string) => {
      // リネームモード中なら終了
      if (isRenamingSubCategory) {
        setIsRenamingSubCategory(false)
      }
      setActiveCategory(categoryName)
      setKeywords(getCategoryKeywordsForName(tabGroup, categoryName))
    },
    [isRenamingSubCategory, tabGroup],
  )

  // キーワード追加関数に重複チェックを追加
  const handleAddKeyword = useCallback(() => {
    if (newKeyword.trim() && activeCategory) {
      // 重複チェックを追加
      if (
        keywords.some(
          (keyword) =>
            keyword.toLowerCase() === newKeyword.trim().toLowerCase(),
        )
      ) {
        toast.error(t('savedTabs.keywords.duplicate'))
        return
      }

      const updatedKeywords = [...keywords, newKeyword.trim()]
      setKeywords(updatedKeywords)
      setCategoryKeywords(tabGroup.id, activeCategory, updatedKeywords)
        .then(() => {
          setNewKeyword('')
        })
        .catch((error: unknown) => {
          console.error('キーワード保存エラー:', error)
        })
    }
  }, [newKeyword, activeCategory, keywords, tabGroup.id, t])

  // キーワードを削除した時に自動保存する処理を修正
  const handleRemoveKeyword = useCallback(
    async (keywordToRemove: string) => {
      try {
        // キーワードをフィルタリング
        const updatedKeywords = keywords.filter((k) => k !== keywordToRemove)

        // UI状態を先に更新
        setKeywords(updatedKeywords)

        // ストレージに保存
        if (!activeCategory) {
          return
        }
        await setCategoryKeywords(tabGroup.id, activeCategory, updatedKeywords)

        console.log(`キーワード "${keywordToRemove}" を削除しました`)
      } catch (error) {
        console.error('キーワード削除エラー:', error)

        // エラー時はキーワードリストを再取得して状態を元に戻す
        setKeywords(getCategoryKeywordsForName(tabGroup, activeCategory))

        // エラーを表示
        toast.error(t('savedTabs.subCategory.createError'))
      }
    },
    [keywords, activeCategory, tabGroup, t],
  )

  // 新しい子カテゴリを追加
  const handleAddSubCategory = useCallback(async () => {
    if (newSubCategory.trim()) {
      const categoryName = newSubCategory.trim()

      // 既存の子カテゴリと重複していないか確認
      if (tabGroup.subCategories?.includes(categoryName)) {
        toast.error(t('savedTabs.subCategory.duplicateName'))
        return
      }

      // 子カテゴリを追加
      const updatedTabGroup = {
        ...tabGroup,
        categoryKeywords: [
          ...(tabGroup.categoryKeywords ?? []),
          { categoryName, keywords: [] },
        ],
        subCategories: [...(tabGroup.subCategories ?? []), categoryName],
      }

      const success = await updateTabGroup(updatedTabGroup)
      if (success) {
        setNewSubCategory('')
        setActiveCategory(categoryName) // 新しいカテゴリを選択状態に
        setKeywords([])
      }
    }
  }, [newSubCategory, tabGroup, t])

  // 子カテゴリ削除関数を完全に書き換え - saved-tabs/main.tsxのパターンに基づく
  const handleRemoveSubCategory = useCallback(
    async (categoryToRemove: string) => {
      console.log(`子カテゴリの削除を開始: "${categoryToRemove}"`)

      try {
        // 選択中のカテゴリを削除する場合は選択を解除
        if (activeCategory === categoryToRemove) {
          setActiveCategory(null)
          setKeywords([])
        }

        // Saved-tabs/main.tsxのパターンに基づく直接的な実装
        console.log('削除するカテゴリ:', categoryToRemove)
        console.log('タブグループID:', tabGroup.id)

        // ストレージ経由で子カテゴリを削除
        await removeSubCategoryFromTabGroup(tabGroup.id, categoryToRemove)
        console.log('ストレージに保存完了')

        toast.success(
          t('savedTabs.subCategory.deleted', undefined, {
            name: categoryToRemove,
          }),
        )
        // }
      } catch (error) {
        console.error('子カテゴリ削除エラー:', error)
        toast.error(t('savedTabs.subCategory.deleteError'))
      }
    },
    [activeCategory, tabGroup, t],
  )

  // リネームモードを開始する関数
  const startRenameMode = useCallback(() => {
    setIsRenamingSubCategory(true)
    setNewCategoryName(getRenameDraftName(activeCategory))
  }, [activeCategory])

  // カテゴリ名変更の処理関数
  const handleRenameCategory = useCallback(
    async (oldName: string, newName: string) => {
      console.log(`カテゴリ名を変更: ${oldName} → ${newName}`)

      // ストレージ経由で子カテゴリ名をリネーム
      await renameSubCategoryInTabGroup(tabGroup.id, oldName, newName)
      console.log(`カテゴリ名の変更を完了: ${oldName} → ${newName}`)
    },
    [tabGroup],
  )

  // リネームを完了する関数
  const completeRename = useCallback(async () => {
    if (!(isRenamingSubCategory && activeCategory && newCategoryName.trim())) {
      setIsRenamingSubCategory(false)
      return
    }

    // 名前が変わっていない場合は何もしない
    if (newCategoryName.trim() === activeCategory) {
      setIsRenamingSubCategory(false)
      return
    }

    // 既存のカテゴリ名と重複していないか確認
    if (tabGroup.subCategories?.includes(newCategoryName.trim())) {
      toast.error(t('savedTabs.subCategory.duplicateName'))
      setNewCategoryName(activeCategory) // 元の名前に戻す
      return
    }

    try {
      await handleRenameCategory(activeCategory, newCategoryName.trim())

      // リネームが成功したら、アクティブカテゴリを新しい名前に更新
      setActiveCategory(newCategoryName.trim())
      setIsRenamingSubCategory(false)
    } catch (error) {
      console.error('カテゴリ名変更エラー:', error)
      toast.error(t('savedTabs.subCategory.renameError'))
    }
  }, [
    isRenamingSubCategory,
    activeCategory,
    newCategoryName,
    tabGroup,
    t,
    handleRenameCategory,
  ])

  // キャンセル時の処理
  const cancelRename = useCallback(() => {
    setIsRenamingSubCategory(false)
    setNewCategoryName(getRenameDraftName(activeCategory))
  }, [activeCategory])

  const handleRenameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setNewCategoryName(e.target.value)
    },
    [],
  )

  const handleRenameKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        void completeRename()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        cancelRename()
      }
    },
    [completeRename, cancelRename],
  )

  const handleKeywordChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setNewKeyword(e.target.value)
    },
    [],
  )

  const handleKeywordKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        handleAddKeyword()
      }
    },
    [handleAddKeyword],
  )

  if (!tabGroup.subCategories || tabGroup.subCategories.length === 0) {
    return (
      <div className='mt-4 border-t border-border pt-4'>
        <p className='mb-3 text-muted-foreground'>
          {t('savedTabs.subCategory.empty')}
        </p>
        <NewSubCategoryField
          value={newSubCategory}
          label={t('savedTabs.subCategory.addTitle')}
          placeholder={t('savedTabs.subCategory.addPlaceholder')}
          onChange={setNewSubCategory}
          // eslint-disable-next-line typescript/no-misused-promises
          onAdd={handleAddSubCategory}
        />
      </div>
    )
  }

  return (
    <div className='mt-4 border-t border-border pt-4'>
      <h4 className='text-md mb-2 font-medium text-foreground'>
        {t('savedTabs.subCategory.keywordManagerTitle')}
      </h4>

      {/* 新しい子カテゴリの追加フォーム */}
      <NewSubCategoryField
        value={newSubCategory}
        label={t('savedTabs.subCategory.addTitle')}
        placeholder={t('savedTabs.subCategory.addPlaceholder')}
        onChange={setNewSubCategory}
        // eslint-disable-next-line typescript/no-misused-promises
        onAdd={handleAddSubCategory}
      />

      {/* 子カテゴリボタン一覧 - レスポンシブ対応を改善 */}
      <div className='mb-3 flex flex-wrap gap-2'>
        {tabGroup.subCategories.map((category) => (
          <SubCategoryButton
            key={category}
            category={category}
            activeCategory={activeCategory}
            onSelect={handleCategorySelect}
            onRemove={handleRemoveSubCategory}
            deleteAriaLabel={t('savedTabs.subCategory.deleteAria', undefined, {
              name: category,
            })}
          />
        ))}
      </div>

      {activeCategory && (
        <div className='mt-2'>
          {/* カテゴリリネーム機能 - レスポンシブ対応を改善 */}
          {isRenamingSubCategory ? (
            <SubCategoryRenameSection
              renameInputRef={renameInputRef}
              newCategoryName={newCategoryName}
              onChange={handleRenameChange}
              onKeyDown={handleRenameKeyDown}
              onCompleteRename={completeRename}
              onCancelRename={cancelRename}
              renameLabel={t('savedTabs.subCategory.rename')}
              renameHint={t('savedTabs.subCategory.renameHint')}
            />
          ) : (
            <div className='mb-3 flex items-center justify-between'>
              <div className='flex items-center gap-2 overflow-hidden'>
                <h4
                  className='max-w-[200px] truncate font-medium text-foreground'
                  title={activeCategory}
                >
                  {t('savedTabs.subCategory.titleKeywords', undefined, {
                    name: activeCategory,
                  })}
                </h4>
                <Button
                  type='button'
                  onClick={startRenameMode}
                  variant='outline'
                  size='sm'
                  className='shrink-0 bg-muted text-xs text-foreground hover:bg-muted/70'
                >
                  {t('savedTabs.projectManagement.renameAction')}
                </Button>
              </div>
            </div>
          )}

          <div className='mb-2'>
            <Label
              htmlFor={`keyword-input-${activeCategory}`}
              className='mb-1 block text-sm text-foreground'
            >
              {t('savedTabs.keywords.activeCategoryLabel', undefined, {
                name: activeCategory,
              })}
              <span className='ml-2 text-xs text-muted-foreground'>
                ({t('savedTabs.keywords.autoAssignHint')})
              </span>
            </Label>
            {/* キーワード追加フォーム */}
            <div className='flex'>
              <Input
                id={`keyword-input-${activeCategory}`}
                type='text'
                value={newKeyword}
                onChange={handleKeywordChange}
                placeholder={t('savedTabs.keywords.placeholder')}
                className='grow rounded-l border border-border bg-input p-2 text-foreground focus:ring-2 focus:ring-ring'
                onKeyDown={handleKeywordKeyDown}
              />
              <Button
                type='button'
                onClick={handleAddKeyword}
                disabled={!newKeyword.trim()}
                variant='secondary'
                className={`shrink-0 cursor-pointer rounded-l-none ${
                  newKeyword.trim()
                    ? 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                    : 'cursor-not-allowed bg-secondary/50 text-muted-foreground'
                }`}
                aria-label={t('savedTabs.keywords.addAria')}
              >
                <Plus size={18} />
              </Button>
            </div>
          </div>

          {/* キーワード表示を改善 */}
          <div className='mt-2 flex flex-wrap gap-2'>
            {keywords.length === 0 ? (
              <p className='text-sm text-muted-foreground'>
                {t('savedTabs.keywords.empty')}
              </p>
            ) : (
              keywords.map((keyword) => (
                <SubCategoryKeywordTag
                  key={keyword}
                  keyword={keyword}
                  onRemove={handleRemoveKeyword}
                  deleteAriaLabel={t(
                    'savedTabs.keywords.deleteAriaWithName',
                    undefined,
                    { name: keyword },
                  )}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
export const SubCategoryKeywordManager = (props: { tabGroup: TabGroup }) =>
  useSubCategoryKeywordManagerView(props)
