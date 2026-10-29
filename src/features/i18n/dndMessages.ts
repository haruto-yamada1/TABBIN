export const dndMessages = {
  en: {
    'savedTabs.dnd.instructions':
      'Tab to a reorder handle. Press Space or Enter to pick up one item. Use the arrow keys to move, Space or Enter to drop, and Escape to cancel the current drag.',
    'savedTabs.dnd.customInstructions':
      'For tabs, Up and Down reorder within the category first. At the ends, or with Left and Right, move to a category, uncategorized area, or another project in that direction.',
    'savedTabs.dnd.confirmHint':
      'The order is a preview. Tab to Confirm reorder to save, or Cancel reorder to discard it.',
    'savedTabs.dnd.saveHint':
      'The drop starts saving. The result will be announced.',
    'savedTabs.dnd.pickedUp': 'Picked up one item: {{name}}.',
    'savedTabs.dnd.position': 'Position {{position}} of {{count}}.',
    'savedTabs.dnd.over': '{{name}} is over {{target}}.',
    'savedTabs.dnd.dropped': 'Dropped {{name}} over {{target}}.',
    'savedTabs.dnd.canceled':
      'Canceled the drag of {{name}}. No change was saved.',
    'savedTabs.dnd.noTarget': '{{name}} has no drop target.',
    'savedTabs.dnd.saved': 'Reordered one tab.',
    'savedTabs.dnd.saveError': 'Could not save the order. Try again.',
  },
  ja: {
    'savedTabs.dnd.instructions':
      'Tabで並び替えハンドルへ移動し、SpaceまたはEnterで1件を持ち上げます。矢印キーで移動し、SpaceまたはEnterでドロップ、Escapeで現在のドラッグを取り消します。',
    'savedTabs.dnd.customInstructions':
      'タブは上下矢印で同じカテゴリ内の並び替えを優先します。上下端、または左右矢印では、その方向のカテゴリ、未分類エリア、別プロジェクトへ移動します。',
    'savedTabs.dnd.confirmHint':
      '順序はプレビューです。Tabで「並び替えを確定」に移動して保存、または「並び替えをキャンセル」で破棄します。',
    'savedTabs.dnd.saveHint': 'ドロップすると保存を開始し、結果を通知します。',
    'savedTabs.dnd.pickedUp': '「{{name}}」を1件持ち上げました。',
    'savedTabs.dnd.position': '{{count}}件中{{position}}番目です。',
    'savedTabs.dnd.over': '「{{name}}」の移動先は「{{target}}」です。',
    'savedTabs.dnd.dropped': '「{{name}}」を「{{target}}」へドロップしました。',
    'savedTabs.dnd.canceled':
      '「{{name}}」のドラッグを取り消しました。変更は保存されていません。',
    'savedTabs.dnd.noTarget': '「{{name}}」の移動先がありません。',
    'savedTabs.dnd.saved': 'タブ1件の並び順を保存しました。',
    'savedTabs.dnd.saveError':
      '並び順を保存できませんでした。もう一度お試しください。',
  },
} as const
