import type { selectionMessagesEn } from './selectionMessages.en'

const selectionMessagesJa: Record<keyof typeof selectionMessagesEn, string> = {
  'savedTabs.deleteAll': 'すべて削除',
  'savedTabs.openAll': 'すべて開く',
  'savedTabs.openAllTabs': 'すべてのタブを開く',
  'savedTabs.selection.toolbar': '保存したタブの選択',
  'savedTabs.selection.start': 'タブを選択',
  'savedTabs.selection.instructions':
    'クリックまたはCtrl/Cmd+クリックで選択を切り替えます。Shift+クリックで範囲選択できます。チェックボックス上のSpaceで選択し、Escapeで選択を解除して終了します。',
  'savedTabs.selection.item': '{{title}}を選択',
  'savedTabs.selection.count.one': '{{count}}件のタブを選択中',
  'savedTabs.selection.count.other': '{{count}}件のタブを選択中',
  'savedTabs.selection.selectAll': '表示中をすべて選択',
  'savedTabs.selection.clear': '選択を解除',
  'savedTabs.selection.done': '選択を終了',
  'savedTabs.selection.open': '選択したタブを開く',
  'savedTabs.selection.opening': '選択したタブを開いています…',
  'savedTabs.selection.delete': '選択したタブを削除',
  'savedTabs.selection.deleting': '選択したタブを削除しています…',
  'savedTabs.selection.openConfirmTitle.one':
    '選択した{{count}}件のタブを開きますか？',
  'savedTabs.selection.openConfirmTitle.other':
    '選択した{{count}}件のタブを開きますか？',
  'savedTabs.selection.openConfirmDescription':
    '選択したタブをブラウザで開きます。',
  'savedTabs.selection.deleteConfirmTitle.one':
    '選択した{{count}}件のタブを削除しますか？',
  'savedTabs.selection.deleteConfirmTitle.other':
    '選択した{{count}}件のタブを削除しますか？',
  'savedTabs.selection.deleteConfirmDescription':
    '選択したタブと同じ URL の Custom 登録を削除します。削除後に元に戻せます。',
  'savedTabs.selection.openError':
    '選択したタブを開けませんでした。選択はそのままです。',
  'savedTabs.selection.deleteError':
    '選択したタブを削除できませんでした。選択はそのままです。',
  'savedTabs.selection.copyMarkdown': 'Markdownでコピー',
  'savedTabs.selection.copying': 'コピーしています…',
  'savedTabs.selection.copySuccess.one':
    '{{count}}件のタブをMarkdownリストとしてコピーしました。',
  'savedTabs.selection.copySuccess.other':
    '{{count}}件のタブをMarkdownリストとしてコピーしました。',
  'savedTabs.selection.copyError':
    'クリップボードにコピーできませんでした。選択はそのままです。',
  'savedTabs.selection.refreshFailed':
    'タブは削除されました。最新の一覧を表示するには再読み込みしてください。',
}

export { selectionMessagesJa }
