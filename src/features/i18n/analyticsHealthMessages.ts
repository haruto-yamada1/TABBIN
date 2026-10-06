export const analyticsHealthMessages = {
  en: {
    'analytics.health.title': 'Saved-tab health',
    'analytics.health.score': 'Health score',
    'analytics.health.scope':
      'All {{count}} saved URLs, independent of chart filters',
    'analytics.health.empty': 'Save tabs to see a health overview.',
    'analytics.health.uncategorized': 'Uncategorized rate',
    'analytics.health.duplicates': 'Duplicate rate',
    'analytics.health.concentration': 'Largest category-label share',
    'analytics.health.count': '{{count}} URLs',
    'analytics.health.reviewUncategorized': 'Review uncategorized tabs',
    'analytics.health.reviewLargest':
      'Review largest category: {{mode}} / {{name}}',
    'analytics.health.reviewDuplicates': 'Review duplicate candidates',
    'analytics.health.reviewOld': 'Review tabs not re-saved for 90 days',
    'analytics.health.domainSuggestion':
      '{{name}} has {{count}} uncategorized URLs',
    'analytics.health.reviewDomain': 'Review {{name}}',
    'analytics.health.growthSuggestion':
      '{{mode}} / {{name}}: {{count}} new URLs in the past 7 days',
    'analytics.health.reviewCategory': 'Review recent additions to {{name}}',
    'analytics.health.mode.domain': 'Domain',
    'analytics.health.mode.custom': 'Custom',
    'analytics.health.oldBasis':
      '90-day candidates use exact last-save dates (available for {{count}} of {{total}} URLs). Legacy fallback or unknown dates are excluded.',
    'analytics.health.explanation': 'How is this score calculated?',
    'analytics.health.formula':
      'Organizing guide: 100 − 40 × uncategorized rate − 40 × duplicate rate − 20 × max(0, 2 × largest category-label share − 1), rounded to an integer. Rates are fractions from 0 to 1. A lower score suggests reviewing the candidates; it does not mean your tabs are unnecessary.',
    'analytics.health.definitions':
      'Each URL ID counts once across all saving events. Uncategorized means no domain or custom category; a collection group alone is not a category. Duplicates are extra URL IDs with an identical URL; multiple collection memberships are not duplicates. Category share counts categorized URLs with the same category label, combines identical labels within each mode, and counts each URL once per label. Recent additions use exact first-save dates, not re-saves. These are review suggestions, not automatic deletions.',
    'analytics.health.noHistory':
      'Viewing history is not tracked, so an unviewed rate cannot be calculated and does not affect the score.',
    'analytics.health.organize': 'Organize in Saved Tabs',
  },
  ja: {
    'analytics.health.title': '保存タブの健康状態',
    'analytics.health.score': '健康スコア',
    'analytics.health.scope':
      '保存 URL 全 {{count}} 件（チャートの絞り込みとは独立）',
    'analytics.health.empty': 'タブを保存すると健康状態を確認できます。',
    'analytics.health.uncategorized': '未分類率',
    'analytics.health.duplicates': '重複率',
    'analytics.health.concentration': '最大カテゴリ名の占有率',
    'analytics.health.count': '{{count}} URL',
    'analytics.health.reviewUncategorized': '未分類タブを確認',
    'analytics.health.reviewLargest': '最大カテゴリを確認：{{mode}} / {{name}}',
    'analytics.health.reviewDuplicates': '重複候補を確認',
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
      '整理の目安：100 − 40 × 未分類率 − 40 × 重複率 − 20 × max(0, 2 × 最大カテゴリ名の占有率 − 1) を整数に四捨五入します。率は0〜1の値です。低いスコアは候補を確認する目安であり、タブが不要であることを意味しません。',
    'analytics.health.definitions':
      '保存イベントをまたいで URL ID ごとに1件と数えます。未分類はドメイン・カスタムのカテゴリがない URL で、コレクションのグループだけでは分類済みとしません。重複は同一 URL を持つ余分な URL ID で、複数コレクションへの所属は重複ではありません。占有率は分類済み URL のうち同じカテゴリ名を持つ割合です。モード内の同名カテゴリをまとめ、各 URL をカテゴリ名ごとに1回数えます。最近の追加は正確な初回保存日時で判定し、再保存を含みません。提案は確認候補で、自動削除しません。',
    'analytics.health.noHistory':
      '閲覧履歴は記録していないため、未閲覧率は算出できず、スコアにも含めません。',
    'analytics.health.organize': '保存タブ画面で整理する',
  },
}
