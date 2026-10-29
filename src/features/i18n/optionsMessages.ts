import { onboardingMessages } from './onboardingMessages'
import { reviewReminderMessages } from './reviewReminderMessages'

export const optionsMessages = {
  en: {
    ...onboardingMessages.en,
    ...reviewReminderMessages.en,
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
    ...onboardingMessages.ja,
    ...reviewReminderMessages.ja,
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
