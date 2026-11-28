import { Bookmark, GraduationCap, SaveAll } from 'lucide-react'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import { getPageHref } from '@/features/navigation/lib/pageNavigation'

type SavedTabsEmptyStateProps = {
  /**
   * 「このウィンドウのタブをすべて保存」CTA の操作 (issue #1131)。
   *
   * background の既存キャプチャフローへ委譲するハンドラ。未指定のときは
   * CTA を出さず、従来の説明文だけの空表示にする (practice / Storybook
   * など保存を実行できない環境向け)。
   */
  onSaveAllOpenTabs?: (() => Promise<void>) | undefined
  /**
   * 空表示を画面全体の垂直中央に配置するか (issue #1131 フォローアップ)。
   *
   * true のとき root を `absolute inset-0` にして、配置基準を最も近い
   * positioned な祖先 (= SavedTabsApp のレイアウト全体 = 検索バー等の
   * ヘッダーを含めた画面全体) へ広げる。呼び出し側は空状態のときだけ
   * 祖先へ `relative` を付与する前提。root はクリックを透過させて
   * 背後のヘッダー操作を妨げず、CTA 行だけ `pointer-events-auto` で
   * 操作可能に戻す。未指定 (単体表示) では従来どおり親の高さに広がる。
   */
  centerInViewport?: boolean
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
  centerInViewport = false,
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

  // 通常は親の高さいっぱいに広げて (flex-1) その中で垂直中央に配置
  // する。centerInViewport のときは配置基準を画面全体へ広げるため
  // absolute で祖先いっぱいに広げ、justify-center で画面の垂直中央に
  // 置く。root の pointer-events-none は背後のヘッダー操作を通すため
  // で、CTA 行だけ後段で pointer-events-auto に戻す。
  return (
    <div
      data-testid='saved-tabs-empty-state'
      className={`flex flex-col items-center justify-center gap-4 py-8 ${
        centerInViewport
          ? 'pointer-events-none absolute inset-0'
          : 'min-h-[200px] flex-1'
      }`}
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
        <div
          className={`flex flex-wrap items-center justify-center gap-3${
            centerInViewport ? ' pointer-events-auto' : ''
          }`}
        >
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
