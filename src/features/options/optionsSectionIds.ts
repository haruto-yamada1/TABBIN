/**
 * Options 画面の各セクションのアンカー id (issue #1127)。
 * 目次 (OptionsTableOfContents) と OptionsRoute の両方から参照する。
 */
export const OPTIONS_SECTION_IDS = {
  backup: 'options-section-backup',
  behavior: 'options-section-behavior',
  colors: 'options-section-colors',
  excludePatterns: 'options-section-exclude-patterns',
  fontSize: 'options-section-font-size',
  ollama: 'options-section-ollama',
  pageAccess: 'options-section-page-access',
} as const
