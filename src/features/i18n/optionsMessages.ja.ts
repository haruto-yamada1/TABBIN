import { linkCaptureMessagesJa } from './linkCaptureMessages.ja'
import type { optionsMessagesEn } from './optionsMessages.en'
import { reviewReminderMessagesJa } from './reviewReminderMessages.ja'

const optionsMessagesJa = {
  ...linkCaptureMessagesJa,
  ...reviewReminderMessagesJa,
  'background.saveTabs.filterErrorTitle': 'タブを保存できませんでした',
  'background.saveTabs.filterErrorMessage':
    '保存対象を判定できませんでした。タブの保存やクローズは行っていません。設定画面で固定タブと除外設定を確認してから再試行してください。',
  'background.saveTabs.captureErrorTitle': 'タブの保存を完了できませんでした',
  'background.saveTabs.captureErrorMessage':
    'タブは閉じていません。保存状態を確認してから、もう一度保存してください。',
  'background.settings.readErrorTitle': '設定を確認できません',
  'background.settings.readErrorMessage':
    'データを保護するため操作を中止しました。設定画面で設定を再読み込み・復旧してから再試行してください。',
  'options.settingsRead.title': '設定を読み込めませんでした',
  'options.settingsRead.unavailable':
    '保存済みの設定を読み込めません。設定を保護するため編集を停止しています。再読み込みしてください。',
  'options.settingsRead.invalid':
    '保存済みの設定に不正な値があります。再読み込みするか、設定を初期値に戻してください。初期化すると設定内容が置き換わります。保存したタブとカテゴリは保持されます。',
  'options.settingsRead.retry': '設定を再読み込み',
  'options.settingsRead.reset': '設定を初期値に戻す',
  'background.saveTabs.titleCaptureErrorTitle': 'タブを保存できませんでした',
  'background.saveTabs.titleCaptureErrorMessage':
    'タブのタイトルを確認できませんでした。タブの保存やクローズは行っていません。もう一度保存してください。',
  'options.savedTabTitle.title': 'ブラウザタブの保存済みマーク',
  'options.savedTabTitle.enable': '保存済みタブのタイトルに ✓ を表示する',
  'options.savedTabTitle.description':
    '保存済みの HTTP / HTTPS タブのタイトル先頭に ✓ を付けます。有効にすると任意のサイトアクセス権限を確認します。ブラウザの保護されたページは対象外です。サイト側もタイトルの変更を確認できます。この設定は端末内のみで保持し、バックアップに含めません。',
  'options.savedTabTitle.permissionError':
    'サイトアクセスが許可されませんでした。もう一度オンにして、権限を許可すると保存済みマークを表示できます。',
  'options.savedTabTitle.storageError':
    '設定を保存できませんでした。設定ページを再読み込みして、もう一度お試しください。',
  'options.savedTabTitle.loadError':
    '設定またはサイトアクセスを確認できませんでした。設定ページを再読み込みして、もう一度お試しください。',
} as const satisfies Record<keyof typeof optionsMessagesEn, string>

export { optionsMessagesJa }
