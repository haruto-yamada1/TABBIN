import { Button } from '@/components/ui/button'
import { useI18n } from '@/features/i18n/context/I18nProvider'

type SearchNoResultsNoticeProps = {
  /** 現在の検索語。そのまま説明文へ埋め込んで表示する。 */
  query: string
  /** 検索を解除して全件表示へ戻す操作。 */
  onClearSearch: () => void
}

/**
 * 検索・フィルタの結果が 0 件のときの案内 (issue #890)。
 *
 * 保存データ自体がない場合の空表示と区別するため、現在の検索語と
 * 解除操作を明示する。`<output>`（暗黙の status ロール）でスクリーン
 * リーダーにも結果が 0 件であることを伝え、解除は通常のボタンで
 * キーボード操作可能にする。
 */
export const SearchNoResultsNotice = ({
  query,
  onClearSearch,
}: SearchNoResultsNoticeProps) => {
  const { t } = useI18n()

  return (
    <output
      data-testid='search-no-results'
      className='flex min-h-[200px] flex-col items-center justify-center gap-4'
    >
      <span className='block text-2xl text-foreground'>
        {t('savedTabs.searchNoResultsTitle')}
      </span>
      <span className='block text-muted-foreground'>
        {t('savedTabs.searchNoResultsDescription', undefined, { query })}
      </span>
      <Button variant='outline' onClick={onClearSearch}>
        {t('savedTabs.searchClear')}
      </Button>
    </output>
  )
}

export { SavedTabsEmptyState } from './SavedTabsEmptyState'
