import { Bookmark, GraduationCap, SaveAll } from 'lucide-react'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import { getPageHref } from '@/features/navigation/lib/pageNavigation'

type SavedTabsEmptyStateProps = {
  /**
   * 「開いているタブをすべて保存」CTA の操作 (issue #1131)。
   *
   * background の既存キャプチャフローへ委譲するハンドラ。未指定のときは
   * CTA を出さず、従来の説明文だけの空表示にする (practice / Storybook
   * など保存を実行できない環境向け)。
   */
  onSaveAllOpenTabs?: (() => Promise<void>) | undefined
}

/**
 * 保存タブが 0 件のときの空状態 (issue #1131)。
 *
 * 大きめのアイコンと CTA で初回ユーザーがこの画面から保存を体験できる
 * ようにする。主 CTA はワンクリックで既存の保存フローを実行し、保存後は
 * 一覧側の再読み込みで通常表示へ切り替わる。Academy への導線はサイドバー
 * と同じ `getPageHref('academy')` を使う。従来の説明文は補助として残す。
 */
export const SavedTabsEmptyState = ({
  onSaveAllOpenTabs,
}: SavedTabsEmptyStateProps) => {
  const { t } = useI18n()
  const [isSaving, setIsSaving] = useState(false)

  const handleSaveAllOpenTabs = useCallback(async () => {
    if (!onSaveAllOpenTabs || isSaving) {
      return
    }
    setIsSaving(true)
    try {
      await onSaveAllOpenTabs()
    } catch {
      toast.error(t('savedTabs.emptyState.saveAllOpenTabsError'))
    } finally {
      setIsSaving(false)
    }
  }, [isSaving, onSaveAllOpenTabs, t])

  const handleSaveClick = useCallback(() => {
    void handleSaveAllOpenTabs()
  }, [handleSaveAllOpenTabs])

  return (
    <div
      data-testid='saved-tabs-empty-state'
      className='flex min-h-[200px] flex-col items-center justify-center gap-4 py-8'
    >
      <Bookmark
        aria-hidden='true'
        className='text-muted-foreground'
        size={64}
        strokeWidth={1.25}
      />
      <div className='text-2xl text-foreground'>
        {t('savedTabs.emptyTitle')}
      </div>
      {onSaveAllOpenTabs && (
        <div className='flex flex-wrap items-center justify-center gap-3'>
          <Button disabled={isSaving} onClick={handleSaveClick}>
            <SaveAll aria-hidden='true' size={16} />
            {isSaving
              ? t('savedTabs.emptyState.saveAllOpenTabsSaving')
              : t('savedTabs.emptyState.saveAllOpenTabsCta')}
          </Button>
          <Button asChild variant='outline'>
            <a href={getPageHref('academy')}>
              <GraduationCap aria-hidden='true' size={16} />
              {t('savedTabs.emptyState.academyCta')}
            </a>
          </Button>
        </div>
      )}
      <div className='text-muted-foreground'>
        {t('savedTabs.emptyDescription')}
      </div>
    </div>
  )
}
