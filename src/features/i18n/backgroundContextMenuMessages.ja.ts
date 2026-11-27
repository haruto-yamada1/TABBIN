import type { backgroundContextMenuMessagesEn } from './backgroundContextMenuMessages.en'

const backgroundContextMenuMessagesJa = {
  'background.contextMenu.openSavedTabs': '保存したタブを開く',
  'background.contextMenu.saveAllTabs': 'ウィンドウのすべてのタブを保存',
  'background.contextMenu.saveAllWindowsTabs':
    '他のウィンドウを含めすべてのタブを保存',
  'background.contextMenu.saveCurrentTab': '現在のタブを保存',
  'background.contextMenu.saveLinkToTabbin': 'リンク先をTABBINに保存',
  'background.contextMenu.saveSameDomainTabs':
    '現在開いているドメインのタブをすべて保存',
  'background.saveTabs.allWindowsSaved':
    'すべてのウィンドウから{{count}}個のタブを保存しました',
  'background.saveTabs.currentTabSaved': '現在のタブを保存しました',
  'background.saveTabs.linkNotSavable':
    'このリンクは保存できません。URLまたは除外パターンを確認してください。',
  'background.saveTabs.linkNotSavableTitle': 'リンクを保存できません',
  'background.saveTabs.linkSaveFailed':
    '今回のリンク保存を完了できませんでした。もう一度お試しください。',
  'background.saveTabs.linkSaveFailedTitle': 'リンク保存に失敗しました',
  'background.saveTabs.linkSaved': 'リンク先をTABBINに保存しました',
  'background.saveTabs.linkSavedTitle': 'リンク保存',
  'background.saveTabs.notificationTitle': 'タブ保存',
  'background.saveTabs.noneSavedExtensionPage':
    '拡張機能のページは保存できません。',
  'background.saveTabs.noneSavedPinned':
    'ピン留めタブを除外する設定が有効なため、対象のピン留めタブは保存されませんでした。',
  'background.saveTabs.noneSavedTitle': 'タブは保存されませんでした',
  'background.saveTabs.noneSavedUrlPolicy':
    '対象のタブは保存できません。URLまたは除外パターンを確認してください。',
  'background.saveTabs.sameDomainSaved':
    '{{domain}}の{{count}}個のタブを保存しました',
  'background.saveTabs.skippedSummary':
    '保存できない{{count}}個のタブをスキップしました。',
  'background.saveTabs.allResaved':
    'すでに保存済みの{{count}}個のタブです。保存日時を更新しました。',
  'background.saveTabs.resavedSummary':
    'うち{{count}}個は保存済みのため保存日時を更新しました。',
  'background.saveTabs.resavedMovedSummary':
    'うち{{count}}個は保存済みのため、振り分け先を更新しました。',
  'background.saveTabs.linkAlreadySaved':
    'このリンクはすでに保存済みです。保存日時を更新しました。',
  'background.saveTabs.linkAlreadySavedTitle': '保存済み',
  'background.saveTabs.windowTabsSaved':
    '{{count}}個のタブが保存されました。タブを閉じます。',
} as const satisfies Record<
  keyof typeof backgroundContextMenuMessagesEn,
  string
>

export { backgroundContextMenuMessagesJa }
