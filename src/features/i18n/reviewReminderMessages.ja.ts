import type { reviewReminderMessagesEn } from './reviewReminderMessages.en'

const reviewReminderMessagesJa: Record<
  keyof typeof reviewReminderMessagesEn,
  string
> = {
  'periodicExecution.review.targetTitle': '通知対象',
  'periodicExecution.review.scheduleTitle': '実行日時',
  'periodicExecution.review.quietTitle': '通知しない時間帯',
  'options.review.title': '整理リマインダー',
  'options.review.description':
    '保存したタブを見直すタイミングを設定します。リマインダーは整理の候補をお知らせするもので、自動でタブを削除しません。',
  'options.review.noHistory':
    '閲覧履歴は記録していないため、未閲覧のタブを通知対象にはできません。',
  'options.review.enabled': '整理リマインダーを有効にする',
  'options.review.target': '見直すタブ',
  'options.review.target.all': 'すべての保存タブ',
  'options.review.target.uncategorized': '未分類のタブ',
  'options.review.target.older': '保存から一定日数が経ったタブ',
  'options.review.target.category': '指定したカテゴリ',
  'options.review.olderThanDays': '最初の保存からの日数',
  'options.review.olderHelp':
    '正確な最初の保存日時で判定します。保存日時が不明なタブは対象外です。',
  'options.review.category': 'カテゴリ',
  'options.review.chooseCategory': 'カテゴリを選択',
  'options.review.missingCategory': '以前選択したカテゴリが見つかりません',
  'options.review.categoriesError':
    'カテゴリを読み込めませんでした。カテゴリを選ぶ前にページを再読み込みしてください。',
  'options.review.frequency': '通知の頻度',
  'options.review.frequency.daily': '毎日',
  'options.review.frequency.weekly': '毎週',
  'options.review.hour': '通知する時刻',
  'options.review.weekday': '曜日',
  'options.review.weekday.0': '日曜日',
  'options.review.weekday.1': '月曜日',
  'options.review.weekday.2': '火曜日',
  'options.review.weekday.3': '水曜日',
  'options.review.weekday.4': '木曜日',
  'options.review.weekday.5': '金曜日',
  'options.review.weekday.6': '土曜日',
  'options.review.localTime':
    '時刻は端末の現地時間を使います。候補がある場合、設定した見直しの予定ごとに1回通知します。',
  'options.review.quietEnabled': '静穏時間中は通知を止める',
  'options.review.quietStart': '静穏時間の開始',
  'options.review.quietEnd': '静穏時間の終了',
  'options.review.quietHelp':
    '静穏時間に予定された通知は終了後に届きます。開始と終了が同じ時刻なら静穏時間はありません。',
  'options.review.save': 'リマインダー設定を保存',
  'options.review.saving': 'リマインダー設定を保存中…',
  'options.review.saved': 'リマインダー設定を保存しました。',
  'options.review.unsaved': '未保存のリマインダー設定があります。',
  'options.review.invalid':
    '保存する前にカテゴリ、日数、時刻を確認してください。',
  'options.review.loading': 'リマインダー設定を読み込み中…',
  'options.review.loadError':
    'リマインダー設定を読み込めませんでした。編集する前にページを再読み込みしてください。',
  'options.review.saveError':
    'リマインダー設定を保存できませんでした。変更は画面に残っています。もう一度保存してください。',
  'options.review.reviewNow': '今すぐ見直す',
  'reviewReminder.notificationTitle': '保存タブを見直す時間です',
  'reviewReminder.notificationMessage':
    '{{count}} 件の保存タブが見直しの候補です。リストを開いて整理してください。',
  'reviewReminder.listTitle': '保存タブの見直し',
  'reviewReminder.description':
    '見直し候補を検索し、タブを開いて内容を確認したり、不要なタブを削除したりできます。',
  'reviewReminder.search': '見直し候補を検索',
  'reviewReminder.searchPlaceholder': 'タイトルやURLで検索',
  'reviewReminder.clearSearch': '検索をクリア',
  'reviewReminder.filteredCount':
    '見直し候補 {{total}} 件のうち {{count}} 件を表示',
  'reviewReminder.searchEmpty': '検索に一致する見直し候補はありません。',
  'reviewReminder.results': '見直し候補',
  'reviewReminder.sort': '並び順',
  'reviewReminder.sortOldest': '保存日が古い順',
  'reviewReminder.sortNewest': '保存日が新しい順',
  'reviewReminder.sortTitle': 'タイトル順',
  'reviewReminder.savedDate': '最初の保存：{{date}}',
  'reviewReminder.unknownDate': '最初の保存日時は不明',
  'reviewReminder.select': 'タブを選択',
  'reviewReminder.selectVisible': '表示中のタブを選択',
  'reviewReminder.clearSelection': '選択を解除',
  'reviewReminder.selectionHelp':
    '表示中のタブを一度に100件まで選択できます。検索やリストの更新で選択は解除されます。',
  'reviewReminder.delete': 'タブを削除',
  'reviewReminder.deleteSelected': '選択したタブを削除（{{count}}件）',
  'reviewReminder.deleteTitle': 'この保存タブを削除しますか？',
  'reviewReminder.deleteDescription':
    'すべてのカテゴリ・プロジェクトから削除します。この画面を開いている間は、30分以内なら直前の削除を取り消せます。',
  'reviewReminder.confirmDelete': '{{count}}件のタブを削除',
  'reviewReminder.cancel': 'キャンセル',
  'reviewReminder.deleted': '保存タブを削除しました。',
  'reviewReminder.undone': '削除を取り消しました。',
  'reviewReminder.undo': '削除を取り消す',
  'reviewReminder.actionError':
    'タブを削除できませんでした。保存データが変更された可能性があります。リストを更新してもう一度お試しください。',
  'reviewReminder.undoError':
    '削除を取り消せませんでした。保存データが変更されたか、取り消せる時間を過ぎた可能性があります。',
  'reviewReminder.notificationFailed':
    '変更は保存されましたが、他の画面への通知に失敗しました。他に開いている画面を更新してください。',
  'reviewReminder.listCount': '見直しの候補 {{count}} 件',
  'reviewReminder.listEmpty': 'リマインダー設定に一致するタブはありません。',
  'reviewReminder.listError':
    '見直しリストを読み込めませんでした。更新してもう一度お試しください。',
  'reviewReminder.refresh': '見直しリストを更新',
  'reviewReminder.backToSavedTabs': '保存タブに戻る',
  'reviewReminder.open': 'タブを開く',
  'reviewReminder.configure': 'リマインダー設定',
  'reviewReminder.loading': '見直しの候補を読み込み中…',
}

export { reviewReminderMessagesJa }
