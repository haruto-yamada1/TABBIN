const analyticsHealthMessagesEn = {
  'analytics.health.title': 'Saved-tab health',
  'analytics.health.score': 'Health score',
  'analytics.health.scope':
    'All {{count}} saved URLs, independent of chart filters',
  'analytics.health.empty': 'Save tabs to see a health overview.',
  'analytics.health.uncategorized': 'Uncategorized rate',
  'analytics.health.concentration': 'Largest category-label share',
  'analytics.health.count': '{{count}} URLs',
  'analytics.health.reviewUncategorized': 'Review uncategorized tabs',
  'analytics.health.reviewLargest':
    'Review largest category: {{mode}} / {{name}}',
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
    'Organizing guide: 100 − 40 × uncategorized rate − 20 × max(0, 2 × largest category-label share − 1), rounded to an integer. Rates are fractions from 0 to 1. A lower score suggests reviewing the candidates; it does not mean your tabs are unnecessary.',
  'analytics.health.definitions':
    'Each URL ID counts once across all saving events. Uncategorized means no domain or custom category; a collection group alone is not a category. Category share counts categorized URLs with the same category label, combines identical labels within each mode, and counts each URL once per label. Recent additions use exact first-save dates, not re-saves. These are review suggestions, not automatic deletions.',
  'analytics.health.noHistory':
    'Viewing history is not tracked, so an unviewed rate cannot be calculated and does not affect the score.',
  'analytics.health.organize': 'Organize in Saved Tabs',
  'analytics.ghost.title': 'Preview: how Analytics will look',
  'analytics.ghost.badge': 'Sample',
  'analytics.ghost.description':
    'This is a sample preview, not your data. Save tabs to see a health overview and charts like these, built from your own saved tabs.',
  'analytics.ghost.openSavedTabs': 'Save tabs in Saved Tabs',
} as const

export { analyticsHealthMessagesEn }
