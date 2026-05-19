/**
 * アラーム・通知管理モジュール
 */

import { checkAndRemoveExpiredTabs } from './expired-tabs'

/**
 * 期限切れタブのチェック用アラームを設定
 */
const setupExpiredTabsCheckAlarm = (): void => {
  try {
    console.log('期限切れタブのチェックアラームを設定しています...')

    // Chrome.alarmsが利用可能か確認
    if (!chrome.alarms) {
      console.error(
        'chrome.alarms APIが利用できません。Manifest.jsonで権限を確認してください。',
      )
      // アラーム処理が使えない場合でも、初回のチェックは実行
      checkAndRemoveExpiredTabs()
      return
    }

    // エラーハンドリングを追加してアラームを作成
    const createAlarm = () => {
      try {
        console.log('アラームを作成します')
        chrome.alarms.create('checkExpiredTabs', {
          periodInMinutes: 0.5, // 30秒間隔（30sec設定にも追従）
        })
        console.log('アラームが作成されました')
      } catch (error) {
        console.error('アラーム作成エラー:', error)
      }
    }

    // 既存のアラームを確認
    chrome.alarms.get('checkExpiredTabs', (alarm) => {
      if (alarm) {
        console.log('既存のアラームを検出:', alarm)
        try {
          // 既存のアラームをクリア（必要に応じて）
          chrome.alarms.clear('checkExpiredTabs', (wasCleared) => {
            console.log('既存のアラームをクリア:', wasCleared)
            createAlarm()
          })
        } catch (error) {
          console.error('アラームクリアエラー:', error)
          // エラーが発生しても続行
          createAlarm()
        }
      } else {
        console.log('既存のアラームはありません')
        createAlarm()
      }
    })

    // アラームリスナーを登録
    chrome.alarms.onAlarm.addListener((alarm) => {
      console.log(
        `アラームが発火しました: ${alarm.name} (${new Date().toLocaleString()})`,
      )
      if (alarm.name === 'checkExpiredTabs') {
        checkAndRemoveExpiredTabs()
      }
    })

    // 初回チェックを非同期で実行
    scheduleInitialCheck()
  } catch (error: unknown) {
    console.error(
      'アラーム設定エラー:',
      error instanceof Error ? error.message : error,
    )

    // エラーが発生しても初回チェックは実行
    scheduleInitialCheck()
  }
}
/**
 * 初回チェックをスケジュール
 */
const scheduleInitialCheck = (): void => {
  Promise.resolve().then(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100))
    checkAndRemoveExpiredTabs()
  })
}
/**
 * 通知を表示する関数
 */
const showNotification = async (
  title: string,
  message: string,
): Promise<void> => {
  try {
    // 正しいアイコンパスを設定
    const iconUrl = chrome.runtime.getURL('icon/128.png')
    console.log('通知アイコンURL:', iconUrl)
    chrome.notifications.create({
      iconUrl,
      message,
      title,
      type: 'basic',
    })
  } catch (notificationError) {
    // 通知エラーをキャッチしても処理を続行
    console.error('通知表示エラー:', notificationError)
  }
}

export { setupExpiredTabsCheckAlarm, showNotification }
