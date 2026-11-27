import type { analyticsHealthMessagesEn } from './analyticsHealthMessages.en'

const analyticsHealthMessagesJa = {
  'analytics.health.title': '保存タブの健康状態',
  'analytics.health.score': '健康スコア',
  'analytics.health.scope':
    '保存 URL 全 {{count}} 件（チャートの絞り込みとは独立）',
  'analytics.health.empty': 'タブを保存すると健康状態を確認できます。',
  'analytics.health.uncategorized': '未分類率',
  'analytics.health.concentration': '最大カテゴリ名の占有率',
  'analytics.health.count': '{{count}} URL',
  'analytics.health.reviewUncategorized': '未分類タブを確認',
  'analytics.health.reviewLargest': '最大カテゴリを確認：{{mode}} / {{name}}',
  'analytics.health.reviewOld': '90日以上再保存していないタブを確認',
  'analytics.health.domainSuggestion':
    '{{name}} に未分類 URL が {{count}} 件あります',
  'analytics.health.reviewDomain': '{{name}} を確認',
  'analytics.health.growthSuggestion':
    '{{mode}} / {{name}}：過去7日間に {{count}} URL を新規保存',
  'analytics.health.reviewCategory': '{{name}} の最近の追加を確認',
  'analytics.health.mode.domain': 'ドメイン',
  'analytics.health.mode.custom': 'カスタム',
  'analytics.health.oldBasis':
    '90日の候補は正確な最終保存日時で判定します（全 {{total}} URL 中 {{count}} URL で利用可能）。旧形式や不明な日時は対象外です。',
  'analytics.health.explanation': 'スコアの計算方法',
  'analytics.health.formula':
    '整理の目安：100 − 40 × 未分類率 − 20 × max(0, 2 × 最大カテゴリ名の占有率 − 1) を整数に四捨五入します。率は0〜1の値です。低いスコアは候補を確認する目安であり、タブが不要であることを意味しません。',
  'analytics.health.definitions':
    '保存イベントをまたいで URL ID ごとに1件と数えます。未分類はドメイン・カスタムのカテゴリがない URL で、コレクションのグループだけでは分類済みとしません。占有率は分類済み URL のうち同じカテゴリ名を持つ割合です。モード内の同名カテゴリをまとめ、各 URL をカテゴリ名ごとに1回数えます。最近の追加は正確な初回保存日時で判定し、再保存を含みません。提案は確認候補で、自動削除しません。',
  'analytics.health.noHistory':
    '閲覧履歴は記録していないため、未閲覧率は算出できず、スコアにも含めません。',
  'analytics.health.organize': '保存タブ画面で整理する',
} as const satisfies Record<keyof typeof analyticsHealthMessagesEn, string>

export { analyticsHealthMessagesJa }
