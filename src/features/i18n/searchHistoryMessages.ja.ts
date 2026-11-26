import type { searchHistoryMessagesEn } from './searchHistoryMessages.en'

const searchHistoryMessagesJa: Record<
  keyof typeof searchHistoryMessagesEn,
  string
> = {
  'savedTabs.searchHistory': '検索履歴',
  'savedTabs.removeSearchHistory': '「{{query}}」を検索履歴から削除',
  'savedTabs.searchHistoryError':
    '検索履歴を更新できませんでした。もう一度お試しください。',
}

export { searchHistoryMessagesJa }
