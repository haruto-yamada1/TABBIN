const AI_CHAT_TOOL_DEFINITIONS = [
  {
    description:
      '現在時刻を取得する。今日、今月、何日前、相対日付を扱う前に使う',
    name: 'getCurrentDateTime',
    title: '現在時刻確認',
  },
  {
    description:
      '現在保存されているタブを保存日時順に一覧化する。page/pageSize/sortDirection を指定できる',
    name: 'listSavedUrls',
    title: '保存済みタブ一覧',
  },
  {
    description:
      '指定した年月に保存されたタブを一覧化する。page/pageSize/sortDirection を指定できる',
    name: 'findUrlsByMonth',
    title: '月別タブ検索',
  },
  {
    description:
      'キーワードで保存済みタブを検索する。page/pageSize/sortDirection を指定できる',
    name: 'searchSavedUrls',
    title: 'キーワードタブ検索',
  },
  {
    description:
      '保存済みタブをドメイン、カテゴリ、プロジェクト、時系列で集計し、chartSpecs を返す。チャートや分析を求められたら優先して使う',
    name: 'generateSavedTabsAnalytics',
    title: '保存分析',
  },
  {
    description: '保存傾向から興味のありそうなテーマを推定する',
    name: 'inferUserInterests',
    title: '興味推定',
  },
] as const

type AiChatToolDefinition = (typeof AI_CHAT_TOOL_DEFINITIONS)[number]

const AI_CHAT_TOOL_TITLES = Object.fromEntries(
  AI_CHAT_TOOL_DEFINITIONS.map((toolDefinition) => [
    toolDefinition.name,
    toolDefinition.title,
  ]),
) as Record<AiChatToolDefinition['name'], AiChatToolDefinition['title']>

const AI_CHAT_TOOL_DESCRIPTIONS = Object.fromEntries(
  AI_CHAT_TOOL_DEFINITIONS.map((toolDefinition) => [
    toolDefinition.name,
    toolDefinition.description,
  ]),
) as Record<AiChatToolDefinition['name'], AiChatToolDefinition['description']>

export type { AiChatToolDefinition }
export {
  AI_CHAT_TOOL_DEFINITIONS,
  AI_CHAT_TOOL_DESCRIPTIONS,
  AI_CHAT_TOOL_TITLES,
}
