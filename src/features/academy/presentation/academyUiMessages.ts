import { ACADEMY_MESSAGES } from '@/features/academy/domain/academyCatalog'
import { useI18n } from '@/features/i18n/context/I18nProvider'

const ui = {
  en: {
    title: 'TABBIN Academy',
    intro: 'Learn to save, organize and restore tabs at your own pace.',
    safe: 'Reading this guide does not save, move, delete or restore your tabs.',
    progress: 'Overall progress',
    mastered: 'Mastered',
    notStarted: 'Not started',
    inProgress: 'In progress',
    skipped: 'Skipped',
    relearning: 'Review required',
    resume: 'Continue where you left off',
    begin: 'Start learning',
    courses: 'Courses',
    beginner: 'Beginner',
    intermediate: 'Intermediate',
    minutes: 'min',
    video: 'Learn by video',
    practice: 'Practice with samples',
    text: 'Read the guide',
    videoPlanned: 'Video: coming soon',
    practicePlanned: 'Optional sample practice',
    practiceSafe:
      'Optional: practice category edits, moves and deletion using samples in the same TABBIN interface. Restoring tabs is simulated; your real saved data, settings and tabs stay unchanged.',
    noPractice: 'Use the real screen or text guide',
    videoUnavailable:
      'Videos, captions and playback controls are being prepared. Use the text guide below.',
    screenGuide:
      'Screen explanations use your usual TABBIN interface and current saved data. If the list is empty, use the text guide. No samples are added to your saved tabs.',
    empty: 'No lessons are available yet.',
    loading: 'Loading learning progress…',
    loadError: 'Could not load learning progress.',
    retry: 'Try again',
    actionError:
      'Could not save learning progress. Your previous progress is preserved. Try again.',
    back: 'All courses',
    missing: 'Lesson not found',
    chapters: 'Chapters',
    previous: 'Previous lesson',
    next: 'Next lesson',
    skip: 'Skip this lesson',
    replay: 'Review from the beginning',
    start: 'Start this lesson',
    saving: 'Saving…',
    completedVideo: 'Video watched',
    pendingVideo: 'Video not watched',
    completedPractice: 'Practice completed',
    pendingPractice: 'Practice not completed',
    textNote:
      'Reading and navigation do not mark video viewing or practice as completed.',
    related: 'Open the real screen',
    supplement: 'Custom mode and backups',
    custom:
      'In Custom mode, group URLs into projects independently of their domains. Switch between Domain and Custom from the sidebar.',
    backup:
      'In Options, use Export to download a JSON backup. Check the selected data and store the file safely. Import shows a preview; restoring selected sections replaces their current data, so export a current backup first.',
    prerequisite:
      'You can read every lesson in any order. Earlier lessons are recommended before practice.',
    reading: 'Text guide',
  },
  ja: {
    title: 'TABBIN Academy',
    intro: '保存・整理・復元を、自分のペースで学びましょう。',
    safe: 'このガイドを読むだけでは、タブの保存・移動・削除・復元は行いません。',
    progress: '全体の進捗',
    mastered: '習得済み',
    notStarted: '未開始',
    inProgress: '学習中',
    skipped: 'スキップ済み',
    relearning: '復習が必要',
    resume: '前回の続きから',
    begin: '学習を始める',
    courses: 'コース一覧',
    beginner: '初級',
    intermediate: '中級',
    minutes: '分',
    video: '動画で学ぶ',
    practice: 'サンプルで練習する',
    text: 'テキストで学ぶ',
    videoPlanned: '動画：準備中',
    practicePlanned: '任意のサンプル練習',
    practiceSafe:
      '希望する場合だけ、TABBINの同じ画面でカテゴリ編集・移動・削除をサンプルで練習できます。復元は模擬操作です。本物の保存データ・設定・タブは変わりません。',
    noPractice: '実画面・テキストで確認',
    videoUnavailable:
      '動画・字幕・再生制御は準備中です。下のテキストガイドをご利用ください。',
    screenGuide:
      '画面の見方は、普段のTABBINと現在の保存データで確認できます。一覧が空の場合はテキストを参考にしてください。保存タブにサンプルを追加することはありません。',
    empty: '公開中のレッスンはまだありません。',
    loading: '学習の進捗を読み込み中…',
    loadError: '学習の進捗を読み込めませんでした。',
    retry: '再試行',
    actionError:
      '学習の進捗を保存できませんでした。これまでの進捗は保持されています。もう一度お試しください。',
    back: 'コース一覧へ',
    missing: 'レッスンが見つかりません',
    chapters: 'チャプター',
    previous: '前のレッスン',
    next: '次のレッスン',
    skip: 'このレッスンをスキップ',
    replay: '最初から見直す',
    start: 'このレッスンを始める',
    saving: '保存中…',
    completedVideo: '動画視聴済み',
    pendingVideo: '動画未視聴',
    completedPractice: '実習達成済み',
    pendingPractice: '実習未達成',
    textNote:
      '読むことや「次へ」だけでは、動画視聴・操作達成には記録されません。',
    related: '関連する機能を開く',
    supplement: 'Customモードとバックアップ',
    custom:
      'Customモードでは、ドメインに関係なくURLをプロジェクトにまとめられます。サイドバーからDomain・Customを切り替えます。',
    backup:
      'OptionsのエクスポートでJSONバックアップをダウンロードできます。対象を確認し、ファイルを安全に保管してください。インポートではプレビューを確認します。選択した項目の復元は現在のデータを置き換えるため、先に現状のバックアップを保存しましょう。',
    prerequisite:
      'テキストは好きな順番で読めます。実習の前に、前のレッスンを確認することをおすすめします。',
    reading: 'テキストガイド',
  },
} as const
export type AcademyUiKey = keyof typeof ui.en
export const useAcademyText = () => {
  const { language } = useI18n()
  return {
    language,
    text: (key: AcademyUiKey) => ui[language][key],
    content: (key: string) => ACADEMY_MESSAGES[language][key] ?? key,
  }
}
