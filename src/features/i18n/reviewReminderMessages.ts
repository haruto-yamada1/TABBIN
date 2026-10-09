export const reviewReminderMessages = {
  en: {
    'periodicExecution.review.targetTitle': 'Review candidates',
    'periodicExecution.review.scheduleTitle': 'Notification schedule',
    'periodicExecution.review.quietTitle': 'Quiet hours',
    'options.review.title': 'Review reminders',
    'options.review.description':
      'Choose when to review saved tabs. Reminders suggest candidates for you to organize; they never delete tabs automatically.',
    'options.review.noHistory':
      'Viewing history is not tracked, so reminders cannot select unread tabs.',
    'options.review.enabled': 'Enable review reminders',
    'options.review.target': 'Tabs to review',
    'options.review.target.all': 'All saved tabs',
    'options.review.target.uncategorized': 'Uncategorized tabs',
    'options.review.target.older': 'Tabs saved at least this many days ago',
    'options.review.target.category': 'A specific category',
    'options.review.olderThanDays': 'Days since first save',
    'options.review.olderHelp':
      'Only exact first-save dates are used. Tabs with unknown dates are excluded.',
    'options.review.category': 'Category',
    'options.review.chooseCategory': 'Choose a category',
    'options.review.missingCategory':
      'Previously selected category is unavailable',
    'options.review.categoriesError':
      'Categories could not be loaded. Reload the page before choosing a category.',
    'options.review.frequency': 'Frequency',
    'options.review.frequency.daily': 'Daily',
    'options.review.frequency.weekly': 'Weekly',
    'options.review.hour': 'Reminder hour',
    'options.review.weekday': 'Day of the week',
    'options.review.weekday.0': 'Sunday',
    'options.review.weekday.1': 'Monday',
    'options.review.weekday.2': 'Tuesday',
    'options.review.weekday.3': 'Wednesday',
    'options.review.weekday.4': 'Thursday',
    'options.review.weekday.5': 'Friday',
    'options.review.weekday.6': 'Saturday',
    'options.review.localTime':
      'Times use your device’s local time. One notification is sent per scheduled review when candidates exist.',
    'options.review.quietEnabled': 'Pause notifications during quiet hours',
    'options.review.quietStart': 'Quiet hours start',
    'options.review.quietEnd': 'Quiet hours end',
    'options.review.quietHelp':
      'Reminders due during quiet hours are delivered after quiet hours end. Equal start and end hours mean there is no quiet period.',
    'options.review.save': 'Save reminder settings',
    'options.review.saving': 'Saving reminder settings…',
    'options.review.saved': 'Reminder settings saved.',
    'options.review.unsaved': 'You have unsaved reminder changes.',
    'options.review.invalid':
      'Check the category, day count, and hours before saving.',
    'options.review.loading': 'Loading reminder settings…',
    'options.review.loadError':
      'Reminder settings could not be loaded. Reload the page before editing.',
    'options.review.saveError':
      'Reminder settings could not be saved. Your changes are still here; try saving again.',
    'options.review.reviewNow': 'Review now',
    'reviewReminder.notificationTitle': 'Time to review your saved tabs',
    'reviewReminder.notificationMessage':
      'Saved tabs to review: {{count}}. Open the review list to organize them.',
    'reviewReminder.listTitle': 'Review saved tabs',
    'reviewReminder.description':
      'Search your review candidates, open tabs to check them, and delete tabs you no longer need.',
    'reviewReminder.search': 'Search review candidates',
    'reviewReminder.searchPlaceholder': 'Search by title or URL',
    'reviewReminder.clearSearch': 'Clear search',
    'reviewReminder.filteredCount':
      'Showing {{count}} of {{total}} review candidates',
    'reviewReminder.searchEmpty': 'No review candidates match your search.',
    'reviewReminder.results': 'Review candidates',
    'reviewReminder.sort': 'Sort by',
    'reviewReminder.sortOldest': 'Oldest saved first',
    'reviewReminder.sortNewest': 'Newest saved first',
    'reviewReminder.sortTitle': 'Title',
    'reviewReminder.savedDate': 'First saved: {{date}}',
    'reviewReminder.unknownDate': 'First save date unknown',
    'reviewReminder.select': 'Select tab',
    'reviewReminder.selectVisible': 'Select displayed tabs',
    'reviewReminder.clearSelection': 'Clear selection',
    'reviewReminder.selectionHelp':
      'Select up to 100 displayed tabs at a time. Changing the search or refreshing the list clears the selection.',
    'reviewReminder.delete': 'Delete tab',
    'reviewReminder.deleteSelected': 'Delete selected ({{count}})',
    'reviewReminder.deleteTitle': 'Delete these saved tabs?',
    'reviewReminder.deleteDescription':
      'These tabs will be deleted from all categories and projects. You can undo the most recent deletion for 30 minutes while this page stays open.',
    'reviewReminder.confirmDelete': 'Delete {{count}} tabs',
    'reviewReminder.cancel': 'Cancel',
    'reviewReminder.deleted': 'Saved tabs deleted.',
    'reviewReminder.undone': 'Deletion undone.',
    'reviewReminder.undo': 'Undo deletion',
    'reviewReminder.actionError':
      'The tabs could not be deleted. The saved data may have changed. Refresh the list and try again.',
    'reviewReminder.undoError':
      'Deletion could not be undone. The saved data may have changed or the undo period has expired.',
    'reviewReminder.notificationFailed':
      'The change was saved, but other open pages could not be notified. Refresh those pages to see the change.',
    'reviewReminder.listCount': 'Tabs to review: {{count}}',
    'reviewReminder.listEmpty':
      'There are no tabs matching your reminder settings.',
    'reviewReminder.listError':
      'The review list could not be loaded. Try refreshing it.',
    'reviewReminder.refresh': 'Refresh review list',
    'reviewReminder.backToSavedTabs': 'Back to Saved Tabs',
    'reviewReminder.open': 'Open tab',
    'reviewReminder.configure': 'Reminder settings',
    'reviewReminder.loading': 'Loading review candidates…',
  },
  ja: {
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
  },
}
