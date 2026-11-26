import type { backupExportMessagesEn } from './backupExportMessages.en'

const backupExportMessagesJa = {
  'options.importExport.exportSizeLimit':
    'バックアップファイルの最大サイズ: {{maxSize}}。',
  'options.importExport.exportPreviewTitle': 'エクスポートプレビュー',
  'options.importExport.exportPreviewDescription':
    'JSON バックアップに含める対象を選択してください。この画面を開いた時点のデータを書き出します。',
  'options.importExport.preparingExport': 'バックアップの内容を確認中...',
  'options.importExport.exportSections': '書き出すデータを選択',
  'options.importExport.exportCollections': '含めるドメインとプロジェクト',
  'options.importExport.exportSharedUrls':
    '同じ URL が別の選択済みドメインやプロジェクトにもある場合、その URL は含まれます。',
  'options.importExport.exportUncollected':
    'ドメインやプロジェクトに属さない URL（{{count}}件）',
  'options.importExport.exportCollectionPages':
    'ドメインとプロジェクトのページ',
  'options.importExport.exportCounts': '選択したバックアップの件数',
  'options.importExport.exportPrivacy':
    '選択したデータには完全な URL・タイトル・メモが含まれ、AI 履歴や設定を選ぶとその内容も含まれます。共有前に機密情報がないか確認してください。外部へのアップロードは行いません。',
  'options.importExport.exportPartialWarning':
    '選択外のデータはファイル内で空になり、設定は既定値になります。部分バックアップの復元時も、置き換える対象だけを選択してください。保存タブを復元すると、現在の保存タブ全体が置き換わります。',
  'options.importExport.confirmExport': 'JSON バックアップをダウンロード',
} as const satisfies Record<keyof typeof backupExportMessagesEn, string>

export { backupExportMessagesJa }
