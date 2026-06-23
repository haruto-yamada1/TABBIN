/**
 * `ReorderTabGroupUrlsUseCase` の入力。
 *
 * 単一 `TabGroup` 内の `urlIds` 並び順を `newUrlOrder` の URL 文字列配列に
 * 従って並べ替える。`newUrlOrder` に含まれない URL は末尾に残る。
 *
 * 旧 `src/lib/storage/tabs.reorderTabGroupUrls(groupId, urls)` の
 * 等価物。`@/lib/storage/tabs` への直接依存を撤去するために新設
 * （issue #501）。
 *
 * @example
 * ```ts
 * await useCases.reorderTabGroupUrls({
 *   tabGroupId: 'group-1',
 *   newUrlOrder: ['https://b.com', 'https://a.com'],
 * })
 * ```
 */
export interface ReorderTabGroupUrlsCommand {
  readonly tabGroupId: string
  readonly newUrlOrder: readonly string[]
}
