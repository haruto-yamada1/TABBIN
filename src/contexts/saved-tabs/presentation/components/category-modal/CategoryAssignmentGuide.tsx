import { useCallback } from 'react'

import { Button } from '@/components/ui/button'
import { useI18n } from '@/features/i18n/context/I18nProvider'

import { useCategoryModalContext } from './CategoryModalContext'
import { DOMAIN_ASSIGNMENT_SECTION_ID } from './domainAssignmentSectionId'

/**
 * 親カテゴリ作成直後の割当ガイド (issue #1130)
 *
 * 作成したカテゴリが選択中の間だけ表示し、「ドメインを割り当てる」
 * ボタンで既存のドメイン選択リスト (DomainSelectionList) へスクロール
 * して最初のチェックボックスへフォーカスを移す。割当ロジック自体は
 * 既存のチェックボックス操作をそのまま使う。
 */
export const CategoryAssignmentGuide = () => {
  const { t } = useI18n()
  const { state } = useCategoryModalContext()
  const { create, selection } = state
  const justCreatedCategory = create.justCreatedCategory

  const handleAssignClick = useCallback(() => {
    const section = document.querySelector(`#${DOMAIN_ASSIGNMENT_SECTION_ID}`)
    if (!section) {
      return
    }
    section.scrollIntoView({ behavior: 'smooth', block: 'start' })
    section
      .querySelector<HTMLElement>('[role="checkbox"]:not([disabled])')
      ?.focus({ preventScroll: true })
  }, [])

  if (
    !justCreatedCategory ||
    selection.selectedCategoryId !== justCreatedCategory.id
  ) {
    return null
  }

  return (
    <div
      data-testid='category-assignment-guide'
      className='rounded border border-primary/40 bg-primary/5 p-3'
    >
      <p className='text-sm font-medium'>
        {t('savedTabs.categoryModal.assignmentGuideTitle', undefined, {
          name: justCreatedCategory.name,
        })}
      </p>
      <p className='mt-1 text-sm text-muted-foreground'>
        {t('savedTabs.categoryModal.assignmentGuideDescription')}
      </p>
      <Button
        type='button'
        size='sm'
        className='mt-2 cursor-pointer'
        onClick={handleAssignClick}
      >
        {t('savedTabs.categoryModal.assignmentGuideAction')}
      </Button>
    </div>
  )
}
