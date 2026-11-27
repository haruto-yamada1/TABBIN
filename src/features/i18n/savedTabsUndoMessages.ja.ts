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
  'savedTabs.undo.restoreError': '保存データを復元できませんでした',
  'savedTabs.undo.restored': '保存データを復元しました',
} as const satisfies Record<keyof typeof savedTabsUndoMessagesEn, string>

export { savedTabsUndoMessagesJa }
