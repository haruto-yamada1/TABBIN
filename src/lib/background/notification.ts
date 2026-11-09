/**
 * 通知を表示する関数
 */
export const showNotification = async (
  title: string,
  message: string,
): Promise<void> => {
  try {
    const iconUrl = chrome.runtime.getURL('icon/128.png')
    console.log('通知アイコンURL:', iconUrl)
    await chrome.notifications.create({
      iconUrl,
      message,
      title,
      type: 'basic',
    })
  } catch (notificationError) {
    console.error('通知表示エラー:', notificationError)
  }
}
