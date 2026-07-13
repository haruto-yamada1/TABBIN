import type { UserSettingsDto } from '@/contexts/saved-tabs/domain/dto/UserSettingsDto'

type SavedTabsActionSettings = Pick<
  UserSettingsDto,
  | 'confirmDeleteAll'
  | 'confirmDeleteEach'
  | 'openAllInNewWindow'
  | 'removeTabAfterExternalDrop'
  | 'removeTabAfterOpen'
>

/**
 * Saved Tabs のデータ変更とウィンドウ操作に関する既定ポリシー。
 *
 * 明示的な削除と URL を開いた後の削除は Undo 可能なため確認を opt-in
 * とする。外部ドロップ後の削除は確認も Undo もないため opt-in とする。
 * 保存済みの明示値は settings merge で常にこの既定値より優先される。
 */
export const savedTabsActionSettingsDefaults = {
  confirmDeleteAll: false,
  confirmDeleteEach: false,
  openAllInNewWindow: false,
  removeTabAfterExternalDrop: false,
  removeTabAfterOpen: true,
} satisfies SavedTabsActionSettings
