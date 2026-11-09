import { reviewReminderMessages } from './reviewReminderMessages'

export const optionsMessages = {
  en: {
    ...reviewReminderMessages.en,
    'background.settings.readErrorTitle': 'Settings could not be verified',
    'background.settings.readErrorMessage':
      'The operation was stopped to protect your data. Reload or recover your settings in Options, then try again.',
    'options.settingsRead.title': 'Settings could not be loaded',
    'options.settingsRead.unavailable':
      'Settings could not be read. Editing is paused to protect your saved preferences. Try loading them again.',
    'options.settingsRead.invalid':
      'Some saved settings are invalid. Try loading them again, or reset settings to defaults. Resetting replaces your preferences; saved tabs and categories are kept.',
    'options.settingsRead.retry': 'Retry loading settings',
    'options.settingsRead.reset': 'Reset settings to defaults',
    'background.saveTabs.titleCaptureErrorTitle': 'Tabs were not saved',
    'background.saveTabs.titleCaptureErrorMessage':
      'Could not confirm a tab title. No tabs were saved or closed by TABBIN. Retry saving the tab.',
    'options.savedTabTitle.title': 'Saved marks on browser tabs',
    'options.savedTabTitle.enable': 'Show ✓ in saved tab titles',
    'options.savedTabTitle.description':
      'Adds ✓ before the title of saved HTTP and HTTPS tabs. Enabling asks for optional site access. Restricted browser pages are excluded. Websites can see title changes. This preference stays on this device and is not included in backups.',
    'options.savedTabTitle.permissionError':
      'Site access was not granted. Turn this on again and allow the requested access to show saved marks.',
    'options.savedTabTitle.storageError':
      'Could not save the setting. Reload the settings page and try again.',
    'options.savedTabTitle.loadError':
      'Could not check the setting or site access. Reload the settings page and try again.',
  },
  ja: {
    ...reviewReminderMessages.ja,
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
  },
}
