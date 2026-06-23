/**
 * `SetCategoryKeywordsUseCase` の入力。
 *
 * 単一の `TabGroup` 内の `categoryKeywords` を更新し、
 * ドメイン別設定（`DomainCategorySettings`）と
 * 自動再カテゴリ化を連動して実行する。
 *
 * 旧 `src/lib/storage/tabs.setCategoryKeywords(groupId, categoryName, keywords)` の
 * 等価物。`@/lib/storage/tabs` への直接依存を撤去するために新設
 * （issue #501）。
 *
 * @example
 * ```ts
 * await useCases.setCategoryKeywords({
 *   tabGroupId: 'group-1',
 *   categoryName: 'Docs',
 *   keywords: ['guide', 'api'],
 * })
 * ```
 */
export interface SetCategoryKeywordsCommand {
  readonly tabGroupId: string
  readonly categoryName: string
  readonly keywords: readonly string[]
}
