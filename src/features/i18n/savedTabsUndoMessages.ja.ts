import type { savedTabsUndoMessagesEn } from './savedTabsUndoMessages.en'

const savedTabsUndoMessagesJa = {
  'savedTabs.undo.deletedTab':
    '削除した{{count}}件のタブを保存データに戻せます',
  'savedTabs.undo.deletedTabs':
    '削除した{{count}}件のタブを保存データに戻せます',
  'savedTabs.undo.removedAfterOpen':
    '開いた{{count}}件のタブを保存データから削除しました',
  'savedTabs.undo.removedAfterOpenTab':
    '開いた{{count}}件のタブを保存データから削除しました',
  'savedTabs.undo.availabilityNote':
    'この通知が表示されている間だけ元に戻せます',
  'savedTabs.undo.operationError':
    '操作を元に戻せませんでした。データが更新された可能性があります。',
  'savedTabs.undo.operationUndone': '操作を元に戻しました',
  'savedTabs.undo.refreshError':
    '操作を元に戻しました。最新のデータを表示するにはページを再読み込みしてください。',
  'savedTabs.undo.restoreError': '保存データを復元できませんでした',
  'savedTabs.undo.restored': '保存データを復元しました',
} as const satisfies Record<keyof typeof savedTabsUndoMessagesEn, string>

export { savedTabsUndoMessagesJa }
