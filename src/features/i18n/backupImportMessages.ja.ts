import type { backupImportMessagesEn } from './backupImportMessages.en'

const backupImportMessagesJa: Record<
  keyof typeof backupImportMessagesEn,
  string
> = {
  'options.importExport.importConcurrentChange':
    '復元が完了しました。その後、別の画面でデータが更新されました。最新の状態を確認してください。',
  'options.importExport.backupDetails': 'バックアップの詳細',
  'options.importExport.diffTitle': '選択したデータの変更',
  'options.importExport.restoreSections': '復元するデータを選択',
  'options.importExport.selectionHelp':
    '選択を外したデータは現在の内容を保持します。保存タブとAI会話は関連するデータをまとめて復元します。',
  'options.importExport.diffCounts':
    '追加: {{added}} ・ 更新: {{updated}} ・ 削除: {{deleted}}',
  'options.importExport.noChanges': '選択したデータに変更はありません。',
  'options.importExport.diffPages': '変更一覧のページ',
  'options.importExport.previousPage': '前へ',
  'options.importExport.nextPage': '次へ',
  'options.importExport.section.savedTabs': '保存タブ',
  'options.importExport.section.userSettings': '設定',
  'options.importExport.section.aiChat': 'AIチャット履歴',
  'options.importExport.section.analyticsViews': '分析ビュー',
  'options.importExport.change.added': '追加',
  'options.importExport.change.updated': '更新',
  'options.importExport.change.deleted': '削除',
  'options.importExport.entity.urls': 'URL',
  'options.importExport.entity.collections': 'コレクション',
  'options.importExport.entity.categories': 'カテゴリ',
  'options.importExport.entity.groups': 'グループ',
  'options.importExport.entity.memberships': 'タブの配置',
  'options.importExport.entity.conversations': '会話',
  'options.importExport.entity.messages': 'メッセージ',
  'options.importExport.entity.userSettings': '設定',
  'options.importExport.entity.analyticsViews': '分析ビュー',
  'options.importExport.previewStale':
    'プレビュー後にデータが変更されました。戻ってファイルを選び直し、最新の差分を確認してください。',
}

export { backupImportMessagesJa }
