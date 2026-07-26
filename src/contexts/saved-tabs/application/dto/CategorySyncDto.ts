/**
 * `SyncCategoryAssignmentsUseCase` の結果 DTO。
 *
 * 「どの TabGroup をどの ParentCategory に割り当てたか / 外したか」と
 * 「どの ParentCategory の `domainNames` / `domains` を更新したか」を
 * 別フィールドで返す。UI で「Docs に 3 件移動しました」のような
 * 集計表示に使う。
 *
 * 既存の `TabGroup.parentCategoryId` が変わらなかった場合は
 * `assignedTabGroupIds` にも `unassignedTabGroupIds` にも含めない。
 */
export type CategorySyncDto = {
  /**
   * 新たにカテゴリへ割り当てられた `TabGroupId` 一覧。
   */
  readonly assignedTabGroupIds: readonly string[]
  /**
   * カテゴリから外れた（未分類に戻った）`TabGroupId` 一覧。
   */
  readonly unassignedTabGroupIds: readonly string[]
  /**
   * `domainNames` / `domains` の同期が発生した `ParentCategoryId` 一覧。
   */
  readonly updatedCategoryIds: readonly string[]
}
