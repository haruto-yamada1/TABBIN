import type { dndMessagesEn } from './dndMessages.en'

const dndMessagesJa = {
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
} as const satisfies Record<keyof typeof dndMessagesEn, string>

export { dndMessagesJa }
