const savedTabsUndoMessages = {
  en: {
    'savedTabs.undo.deletedTab':
      'You can restore {{count}} deleted tab to saved data',
    'savedTabs.undo.deletedTabs':
      'You can restore {{count}} deleted tabs to saved data',
    'savedTabs.undo.removedAfterOpen':
      'Removed {{count}} opened tabs from saved data',
    'savedTabs.undo.removedAfterOpenTab':
      'Removed {{count}} opened tab from saved data',
    'savedTabs.undo.restoreError': 'Could not restore saved data',
    'savedTabs.undo.restored': 'Restored saved data',
  },
  ja: {
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
  },
} as const

export { savedTabsUndoMessages }
