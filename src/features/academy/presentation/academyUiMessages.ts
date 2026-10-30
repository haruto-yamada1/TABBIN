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
    practice: 'Try it yourself',
    text: 'Read the guide',
    videoPlanned: 'Video: coming soon',
    practicePlanned: 'Practice available',
    practiceSafe:
      'Practice uses fictional data. Saving and restoring tabs are simulated; your real tabs, saved data and settings stay unchanged.',
    noPractice: 'Practice: not available for this lesson',
    videoUnavailable:
      'Videos, captions and playback controls are being prepared. Use the text guide below.',
    practiceUnavailable:
      'Safe practice is being prepared. No real tabs or saved data will be changed by this guide.',
    nativePractice:
      'Installation and pinning use the browser toolbar and cannot be practiced inside this page.',
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
    related: 'Open the related feature',
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
    practice: '実際に試す',
    text: 'テキストで学ぶ',
    videoPlanned: '動画：準備中',
    practicePlanned: '実習できます',
    practiceSafe:
      '架空データで練習します。タブの保存・復元は模擬操作です。本物のタブ・保存データ・設定は変わりません。',
    noPractice: '実習：このレッスンでは非対応',
    videoUnavailable:
      '動画・字幕・再生制御は準備中です。下のテキストガイドをご利用ください。',
    practiceUnavailable:
      '安全に試せる実習を準備中です。このガイドは実際のタブや保存データを変更しません。',
    nativePractice:
      'インストールと固定はブラウザのツールバーで行うため、この画面では実習できません。',
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
