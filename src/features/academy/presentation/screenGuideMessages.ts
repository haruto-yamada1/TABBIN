import { useI18n } from '@/features/i18n/context/I18nProvider'

const messages = {
  en: {
    title: 'Screen guide',
    start: 'Start screen guide',
    next: 'Next',
    back: 'Back',
    skip: 'Skip',
    close: 'Close',
    finish: 'Finish',
    retry: 'Retry',
    replay: 'Replay',
    return: 'Back to lesson',
    loading: 'Waiting for the real screen…',
    unavailable:
      'This part of the screen is not available. Check that your saved data is visible, or return to the text guide. No sample data will be added.',
    saved: 'Screen guide viewed',
    error:
      'Progress could not be saved. Retry to save it, or return to the lesson.',
    safe: 'Read-only guide. Viewing this guide does not complete sample practice.',
    url: 'This is one of your saved URLs. You can find its title and address here. This guide will not open it in your browser.',
    domain:
      'Domain mode groups your saved URLs by website. Next shows the same TABBIN interface in Custom mode.',
    custom:
      'Custom mode groups URLs into your projects. Empty projects are fine; this guide does not create or move anything.',
    parents:
      'This button opens parent category management. Next opens the real dialog for a read-only explanation.',
    dialog:
      'Parent categories are managed here. Creating, renaming and moving data are optional sample practice in the lesson. This guide will close the dialog without editing it.',
  },
  ja: {
    title: '画面案内',
    start: '画面案内を始める',
    next: '次へ',
    back: '戻る',
    skip: 'スキップ',
    close: '閉じる',
    finish: '閲覧を完了',
    retry: '再試行',
    replay: 'もう一度見る',
    return: 'レッスンへ戻る',
    loading: '実際の画面の表示を待っています…',
    unavailable:
      '案内する部分が表示されていません。保存データの表示を確認するか、テキストガイドへ戻ってください。サンプルは追加しません。',
    saved: '画面案内を閲覧しました',
    error:
      '進捗を保存できませんでした。再試行するか、レッスンへ戻ってください。',
    safe: '読み取り専用の案内です。閲覧してもサンプル実習の達成にはなりません。',
    url: 'これは保存済みURLです。タイトルとアドレスをここで確認できます。この案内ではブラウザのタブを開きません。',
    domain:
      'Domainモードは同じサイトの保存URLをまとめます。「次へ」で実際のTABBINをCustomモードに切り替えます。',
    custom:
      'CustomモードではURLをプロジェクトごとに確認できます。プロジェクトが空でも、この案内でデータを作成・移動することはありません。',
    parents:
      'このボタンから親カテゴリ管理を開きます。「次へ」で実際のダイアログを読み取り専用で案内します。',
    dialog:
      'ここで親カテゴリを管理します。作成・改名・移動はレッスンの任意のサンプル実習で試せます。この案内では編集せずに閉じます。',
  },
} as const
export const useScreenGuideText = () => {
  const { language } = useI18n()
  return messages[language]
}
