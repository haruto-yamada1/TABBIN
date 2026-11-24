import { useCallback, useState } from 'react'

import { Button } from '@/components/ui/button'
import type { SavedTabsParentCategoryDto } from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'
import { useI18n } from '@/features/i18n/context/I18nProvider'

type EmptyCategoryRowProps = {
  category: SavedTabsParentCategoryDto
  onDeleteCategory: (categoryId: string) => Promise<void>
}

/**
 * 空カテゴリ 1 件分の行。削除前に、割り当てドメインがなく URL は
 * 削除されないことをその場で確認させる (issue #898)。
 */
const EmptyCategoryRow = ({
  category,
  onDeleteCategory,
}: EmptyCategoryRowProps) => {
  const { t } = useI18n()
  const [isConfirming, setIsConfirming] = useState(false)

  const handleShowConfirm = useCallback(() => {
    setIsConfirming(true)
  }, [])
  const handleCancel = useCallback(() => {
    setIsConfirming(false)
  }, [])
  const handleConfirmDelete = useCallback(() => {
    void onDeleteCategory(category.id)
  }, [category.id, onDeleteCategory])

  return (
    <div className='flex flex-wrap items-center gap-3'>
      <span className='text-foreground'>{category.name}</span>
      {isConfirming ? (
        <>
          <span className='text-muted-foreground'>
            {t('savedTabs.emptyCategoriesConfirm', undefined, {
              name: category.name,
            })}
          </span>
          <Button variant='destructive' size='sm' onClick={handleConfirmDelete}>
            {t('common.delete')}
          </Button>
          <Button variant='outline' size='sm' onClick={handleCancel}>
            {t('common.cancel')}
          </Button>
        </>
      ) : (
        <Button variant='outline' size='sm' onClick={handleShowConfirm}>
          {t('common.delete')}
        </Button>
      )}
    </div>
  )
}

type EmptyCategoriesCleanupProps = {
  /** ドメインが 1 件も割り当てられていない親カテゴリ。 */
  categories: readonly SavedTabsParentCategoryDto[]
  /** カテゴリ自体の削除。保存した URL は削除されない。 */
  onDeleteCategory: (categoryId: string) => Promise<void>
}

/**
 * 空カテゴリの整理候補 (issue #898)。
 *
 * ドメインが割り当てられていない親カテゴリは通常の Domain モード
 * 一覧に表示されず、従来は削除する手段がなかった。ここに候補として
 * 一覧し、影響（割り当てドメインなし・URL は削除されない）を
 * 確認してから削除できるようにする。
 */
export const EmptyCategoriesCleanup = ({
  categories,
  onDeleteCategory,
}: EmptyCategoriesCleanupProps) => {
  const { t } = useI18n()

  if (categories.length === 0) {
    return null
  }

  return (
    <section
      data-testid='empty-categories-cleanup'
      className='mt-6 flex flex-col gap-3 rounded-lg border border-border bg-card p-4'
    >
      <h2 className='text-lg text-foreground'>
        {t('savedTabs.emptyCategoriesTitle')}
      </h2>
      <p className='text-muted-foreground'>
        {t('savedTabs.emptyCategoriesDescription')}
      </p>
      <div className='flex flex-col gap-2'>
        {categories.map((category) => (
          <EmptyCategoryRow
            key={category.id}
            category={category}
            onDeleteCategory={onDeleteCategory}
          />
        ))}
      </div>
    </section>
  )
}
