/**
 * AI system prompt プリセットを表す domain DTO (issue #511)。
 *
 * `@/types/storage.AiSystemPromptPreset` と構造互換。
 */
export interface AiSystemPromptPresetDto {
  readonly id: string
  readonly name: string
  readonly template: string
  readonly createdAt: number
  readonly updatedAt: number
}

/**
 * `UserSettings` の domain DTO (issue #511)。
 *
 * `@/types/storage.UserSettings` の全フィールド (optional 含む) を
 * 持つ構造互換 DTO。`chrome.storage.local` との境界は
 * `application/mappers/SavedTabsDtosMapper.ts` (将来追加) と
 * `ChromeUserSettingsRepository` 実装側に閉じ、domain 側は
 * この DTO だけを契約とする。
 *
 * `clickBehavior` のリテラル union は storage 形と完全一致させ、
 * `normalizeUserSettings` 等の純粋関数が型レベルで挙動を保証できる
 * 形を維持する。
 *
 * 配列 / オブジェクトフィールドは `@/types/storage.UserSettings` との
 * structural 互換のため readonly 修飾を敢えて付けず、mutable
 * として公開する (presentation 側 context が `UserSettings`
 * 形の `excludePatterns: string[]` を props として受け取る既存
 * コンポーネントとの代入互換を取る)。
 */
export interface UserSettingsDto {
  language?: 'system' | 'ja' | 'en'
  removeTabAfterOpen: boolean
  removeTabAfterExternalDrop: boolean
  excludePatterns: string[]
  enableCategories: boolean
  autoDeletePeriod?: string
  showSavedTime: boolean
  clickBehavior:
    | 'saveCurrentTab'
    | 'saveWindowTabs'
    | 'saveSameDomainTabs'
    | 'saveAllWindowsTabs'
  excludePinnedTabs: boolean
  openUrlInBackground: boolean
  openAllInNewWindow: boolean
  confirmDeleteAll: boolean
  confirmDeleteEach: boolean
  fontSizePercent?: number
  colors?: Record<string, string>
  ollamaModel?: string
  aiSystemPrompts?: AiSystemPromptPresetDto[]
  activeAiSystemPromptId?: string
}
