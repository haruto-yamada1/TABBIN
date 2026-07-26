import { LazySavedTabsChatWidget } from '@/features/ai-chat/components/LazySavedTabsChatWidget'

/**
 * `SavedTabsChatWidgetBridge` の props。
 *
 * 旧 `features/saved-tabs/routes/SavedTabsRoute` 内で
 * `LazySavedTabsChatWidget` を呼び出していた導線を contexts 側へ
 * port するための薄いラッパー。`historyVariant='dropdown'` 固定で
 * rendering する責務だけを切り出し、mode 別 (dropdown / sidebar-toggle)
 * の差分を contexts 側で拡張できる土台にする。
 */
export type SavedTabsChatWidgetBridgeProps = {
  readonly onOpenChange: (isOpen: boolean) => void
}

/**
 * saved-tabs 右ペインの AI チャットウィジェット bridge。
 *
 * 旧 route が `LazySavedTabsChatWidget` を直接 import していたのを
 * contexts/presentation 側で抽象化し、features/ai-chat への
 * 直接依存を 1 箇所へ閉じる。
 */
export const SavedTabsChatWidgetBridge = ({
  onOpenChange,
}: SavedTabsChatWidgetBridgeProps) => (
  <LazySavedTabsChatWidget
    historyVariant='dropdown'
    onOpenChange={onOpenChange}
  />
)
