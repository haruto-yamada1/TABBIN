import { ChevronDown, ChevronUp } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipTrigger } from '@/components/ui/tooltip'
import { getScopedObjectActionLabel } from '@/contexts/saved-tabs/presentation/lib/accessibility'
import { useI18n } from '@/features/i18n/context/I18nProvider'

import { SavedTabsResponsiveTooltipContent } from './SavedTabsResponsive'

/** CardCollapseControl の props */
interface CardCollapseControlProps {
  /** 折りたたみ状態 */
  isCollapsed: boolean
  /** 折りたたみ状態を設定する関数 */
  setIsCollapsed: (value: boolean) => void
  /** ユーザーが明示的に設定した折りたたみ状態 */
  setUserCollapsedState: (value: boolean) => void
  /** 無効化状態（並び替えモード中など） */
  isDisabled?: boolean
  /** 無効化時のツールチップメッセージ */
  disabledMessage?: string
  /** アクセシブルネームに含める対象名 */
  targetName?: string
  /** ポインターダウン時の追加ハンドラ */
  onPointerDown?: (event: React.PointerEvent<HTMLButtonElement>) => void
}

/**
 * 折りたたみ切り替えトグルボタン
 * @param props CardCollapseControlProps
 */
export const CardCollapseControl = ({
  isCollapsed,
  setIsCollapsed,
  setUserCollapsedState,
  isDisabled = false,
  disabledMessage,
  targetName,
  onPointerDown,
}: CardCollapseControlProps) => {
  const { t } = useI18n()
  const resolvedDisabledMessage =
    disabledMessage ?? t('savedTabs.reorder.disabled')
  const collapseLabel = getScopedObjectActionLabel(
    t,
    targetName,
    t('savedTabs.collapse'),
  )
  const expandLabel = getScopedObjectActionLabel(
    t,
    targetName,
    t('savedTabs.expand'),
  )
  let tooltipLabel = resolvedDisabledMessage
  if (!isDisabled) {
    tooltipLabel = isCollapsed ? expandLabel : collapseLabel
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant='secondary'
          size='sm'
          onPointerDown={onPointerDown}
          onClick={(e) => {
            e.stopPropagation()
            const newState = !isCollapsed
            setIsCollapsed(newState)
            setUserCollapsedState(newState)
          }}
          className={`flex items-center gap-1 ${
            isDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
          }`}
          aria-label={isCollapsed ? expandLabel : collapseLabel}
          disabled={isDisabled}
        >
          {isCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </Button>
      </TooltipTrigger>
      <SavedTabsResponsiveTooltipContent side='top'>
        {tooltipLabel}
      </SavedTabsResponsiveTooltipContent>
    </Tooltip>
  )
}
