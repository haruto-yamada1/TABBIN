import { Check, Plus, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import { setCategoryKeywords } from '@/lib/storage/tabs'
import type { TabGroup } from '@/types/storage'

interface NewSubCategoryFieldProps {
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
}: NewSubCategoryFieldProps) => (
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
      onChange={(e) => {
        onChange(e.target.value)
      }}
      onBlur={onAdd}
      placeholder={placeholder}
      className='w-full rounded border border-border bg-input p-2 text-foreground focus:ring-2 focus:ring-ring'
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          onAdd()
        }
      }}
    />
  </div>
)

const replaceTabGroup = (
  savedTabs: TabGroup[],
  updatedTabGroup: TabGroup,
): TabGroup[] =>
  savedTabs.map((tab: TabGroup) =>
    tab.id === updatedTabGroup.id ? updatedTabGroup : tab,
  )

const getCategoryKeywordsForName = (
  tabGroup: TabGroup,
  categoryName: string | null,
): string[] =>
  tabGroup.categoryKeywords?.find((ck) => ck.categoryName === categoryName)
    ?.keywords || []

const getRenameDraftName = (activeCategory: string | null): string =>
  activeCategory || ''

const shouldSkipRename = (oldName: string, newName: string): boolean =>
  !(oldName && newName) || oldName === newName

// タブグループを更新するヘルパー関数
const updateTabGroup = async (updatedTabGroup: TabGroup) => {
  try {
    const { savedTabs = [] } = await chrome.storage.local.get<{
      savedTabs?: import('@/types/storage').TabGroup[]
    }>('savedTabs')
    const updatedTabs = replaceTabGroup(savedTabs, updatedTabGroup)
    await chrome.storage.local.set({ savedTabs: updatedTabs })
    return true
  } catch (error) {
    console.error('タブグループ更新エラー:', error)
    return false
  }
}

const useSubCategoryKeywordManagerView = ({
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

  const handleCategorySelect = (categoryName: string) => {
    // リネームモード中なら終了
    if (isRenamingSubCategory) {
      setIsRenamingSubCategory(false)
    }
    setActiveCategory(categoryName)
    setKeywords(getCategoryKeywordsForName(tabGroup, categoryName))
  }

  // キーワード追加関数に重複チェックを追加
  const handleAddKeyword = () => {
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
        .catch((error) => {
          console.error('キーワード保存エラー:', error)
        })
    }
  }

  // キーワードを削除した時に自動保存する処理を修正
  const handleRemoveKeyword = async (keywordToRemove: string) => {
    try {
      // キーワードをフィルタリング
      const updatedKeywords = keywords.filter((k) => k !== keywordToRemove)

      // UI状態を先に更新
      setKeywords(updatedKeywords)

      // ストレージに保存
      await setCategoryKeywords(tabGroup.id, activeCategory!, updatedKeywords)

      console.log(`キーワード "${keywordToRemove}" を削除しました`)
    } catch (error) {
      console.error('キーワード削除エラー:', error)

      // エラー時はキーワードリストを再取得して状態を元に戻す
      setKeywords(getCategoryKeywordsForName(tabGroup, activeCategory))

      // エラーを表示
      toast.error(t('savedTabs.subCategory.createError'))
    }
  }

  // 新しい子カテゴリを追加
  const handleAddSubCategory = async () => {
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
          ...(tabGroup.categoryKeywords || []),
          { categoryName, keywords: [] },
        ],
        subCategories: [...(tabGroup.subCategories || []), categoryName],
      }

      const success = await updateTabGroup(updatedTabGroup)
      if (success) {
        setNewSubCategory('')
        setActiveCategory(categoryName) // 新しいカテゴリを選択状態に
        setKeywords([])
      }
    }
  }

  // 子カテゴリ削除関数を完全に書き換え - saved-tabs/main.tsxのパターンに基づく
  const handleRemoveSubCategory = async (categoryToRemove: string) => {
    console.log(`子カテゴリの削除を開始: "${categoryToRemove}"`)

    try {
      // 確認ダイアログを一時的にスキップ (問題特定のため)
      // If (confirm(`子カテゴリ "${categoryToRemove}" を削除してもよろしいですか？`)) {

      // 選択中のカテゴリを削除する場合は選択を解除
      if (activeCategory === categoryToRemove) {
        setActiveCategory(null)
        setKeywords([])
      }

      // Saved-tabs/main.tsxのパターンに基づく直接的な実装
      console.log('削除するカテゴリ:', categoryToRemove)
      console.log('タブグループID:', tabGroup.id)

      // タブの情報を取得
      const { savedTabs = [] } = await chrome.storage.local.get<{
        savedTabs?: import('@/types/storage').TabGroup[]
      }>('savedTabs')
      console.log('取得したsavedTabs:', savedTabs)

      // 対象のタブグループを探す
      const groupToUpdate = savedTabs.find(
        (g: TabGroup) => g.id === tabGroup.id,
      )
      console.log('更新対象のグループ:', groupToUpdate)

      if (!groupToUpdate) {
        console.error('タブグループが見つかりません')
        return
      }

      // 子カテゴリリストと関連キーワードからカテゴリを削除
      const updatedSubCategories = (groupToUpdate.subCategories || []).filter(
        (cat: string) => cat !== categoryToRemove,
      )

      const updatedCategoryKeywords = (
        groupToUpdate.categoryKeywords || []
      ).filter(
        (ck: { categoryName: string }) => ck.categoryName !== categoryToRemove,
      )

      console.log('更新後のサブカテゴリ:', updatedSubCategories)
      console.log('更新後のキーワード設定:', updatedCategoryKeywords)

      // グループを更新
      const updatedGroup = {
        ...groupToUpdate,
        categoryKeywords: updatedCategoryKeywords,
        subCategories: updatedSubCategories,
      }

      // 保存
      const updatedTabs = replaceTabGroup(savedTabs, updatedGroup)
      // ストレージに保存
      await chrome.storage.local.set({ savedTabs: updatedTabs })
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
  }

  // リネームモードを開始する関数
  const startRenameMode = () => {
    setIsRenamingSubCategory(true)
    setNewCategoryName(getRenameDraftName(activeCategory))

    // 入力フィールドにフォーカスを当てる
    requestAnimationFrame(() => {
      if (renameInputRef.current) {
        renameInputRef.current.focus()
        renameInputRef.current.select()
      }
    })
  }

  // リネームを完了する関数
  const completeRename = async () => {
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
  }

  // カテゴリ名変更の処理関数
  const handleRenameCategory = async (oldName: string, newName: string) => {
    console.log(`カテゴリ名を変更: ${oldName} → ${newName}`)

    // ストレージからタブグループを取得
    const { savedTabs = [] } = await chrome.storage.local.get<{
      savedTabs?: import('@/types/storage').TabGroup[]
    }>('savedTabs')

    const updatedTabs = savedTabs.map((tab: TabGroup) => {
      if (tab.id === tabGroup.id) {
        // 1. subCategories配列を更新
        const updatedSubCategories =
          tab.subCategories?.map((cat) => (cat === oldName ? newName : cat)) ||
          []

        // 2. categoryKeywords内の該当カテゴリを更新
        const updatedCategoryKeywords =
          tab.categoryKeywords?.map((ck) => {
            if (ck.categoryName === oldName) {
              return { ...ck, categoryName: newName }
            }
            return ck
          }) || []

        // 3. 各URLのサブカテゴリ参照を更新
        const updatedUrls = (tab.urls || []).map((url) => {
          if (url.subCategory === oldName) {
            return { ...url, subCategory: newName }
          }
          return url
        })

        // 4. カテゴリ順序配列があれば更新
        const updatedSubCategoryOrder =
          tab.subCategoryOrder?.map((cat) =>
            cat === oldName ? newName : cat,
          ) || []

        const updatedSubCategoryOrderWithUncategorized =
          tab.subCategoryOrderWithUncategorized?.map((cat) =>
            cat === oldName ? newName : cat,
          ) || []

        return {
          ...tab,
          categoryKeywords: updatedCategoryKeywords,
          subCategories: updatedSubCategories,
          subCategoryOrder: updatedSubCategoryOrder,
          subCategoryOrderWithUncategorized:
            updatedSubCategoryOrderWithUncategorized,
          urls: updatedUrls,
        }
      }
      return tab
    })

    // 更新したタブをストレージに保存
    await chrome.storage.local.set({ savedTabs: updatedTabs })
    console.log(`カテゴリ名の変更を完了: ${oldName} → ${newName}`)
  }

  // キャンセル時の処理
  const cancelRename = () => {
    setIsRenamingSubCategory(false)
    setNewCategoryName(getRenameDraftName(activeCategory))
  }

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
        onAdd={handleAddSubCategory}
      />

      {/* 子カテゴリボタン一覧 - レスポンシブ対応を改善 */}
      <div className='mb-3 flex flex-wrap gap-2'>
        {tabGroup.subCategories.map((category) => (
          <div key={category} className='flex max-w-full items-center'>
            <Button
              type='button'
              onClick={() => {
                handleCategorySelect(category)
              }}
              variant={activeCategory === category ? 'secondary' : 'outline'}
              size='sm'
              className={`max-w-[180px] cursor-pointer truncate rounded-r-none ${
                activeCategory === category
                  ? 'bg-secondary text-secondary-foreground'
                  : 'bg-muted text-foreground hover:bg-secondary/80'
              }`}
            >
              {category}
            </Button>
            <Button
              type='button'
              onClick={() => handleRemoveSubCategory(category)}
              variant='outline'
              size='sm'
              className='shrink-0 cursor-pointer rounded-l-none'
              aria-label={t('savedTabs.subCategory.deleteAria', undefined, {
                name: category,
              })}
            >
              <X size={14} />
            </Button>
          </div>
        ))}
      </div>

      {activeCategory && (
        <div className='mt-2'>
          {/* カテゴリリネーム機能 - レスポンシブ対応を改善 */}
          {isRenamingSubCategory ? (
            <div className='relative mb-4'>
              <Label
                htmlFor='rename-category'
                className='mb-1 block text-sm text-foreground'
              >
                {t('savedTabs.subCategory.rename')}
              </Label>
              <div className='flex'>
                <Input
                  id='rename-category'
                  ref={renameInputRef}
                  type='text'
                  value={newCategoryName}
                  onChange={(e) => {
                    setNewCategoryName(e.target.value)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      completeRename()
                    } else if (e.key === 'Escape') {
                      e.preventDefault()
                      cancelRename()
                    }
                  }}
                  className='grow rounded-l border border-border bg-input p-2 text-foreground'
                />
                <div className='flex shrink-0'>
                  <Button
                    type='button'
                    onClick={completeRename}
                    variant='secondary'
                    size='icon'
                    className='rounded-none bg-secondary text-secondary-foreground hover:bg-secondary/80'
                  >
                    <Check size={16} />
                  </Button>
                  <Button
                    type='button'
                    onClick={cancelRename}
                    variant='ghost'
                    size='icon'
                    className='rounded-l-none'
                  >
                    <X size={16} />
                  </Button>
                </div>
              </div>
              <div className='mt-1 text-xs text-muted-foreground'>
                {t('savedTabs.subCategory.renameHint')}
              </div>
            </div>
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
                onChange={(e) => {
                  setNewKeyword(e.target.value)
                }}
                placeholder={t('savedTabs.keywords.placeholder')}
                className='grow rounded-l border border-border bg-input p-2 text-foreground focus:ring-2 focus:ring-ring'
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleAddKeyword()
                  }
                }}
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
                <div
                  key={keyword}
                  className='flex max-w-full items-center rounded bg-muted px-2 py-1 text-sm text-foreground'
                  title={keyword}
                >
                  <span className='max-w-[150px] truncate'>{keyword}</span>
                  <Button
                    type='button'
                    onClick={() => handleRemoveKeyword(keyword)}
                    variant='ghost'
                    size='sm'
                    className='ml-1 shrink-0 cursor-pointer p-0 text-muted-foreground hover:bg-transparent hover:text-foreground'
                    aria-label={t(
                      'savedTabs.keywords.deleteAriaWithName',
                      undefined,
                      { name: keyword },
                    )}
                  >
                    <X size={14} />
                  </Button>
                </div>
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

export {
  getCategoryKeywordsForName,
  getRenameDraftName,
  replaceTabGroup,
  shouldSkipRename,
  updateTabGroup,
}
