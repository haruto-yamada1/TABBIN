import type { TabGroupId } from '../../domain/value-objects/TabGroupId'

/**
 * `DeleteTabGroupUseCase` の入力。
 *
 * `tabGroupId` だけを受け取り、Undo 用の snapshot は use-case が
 * 結果 DTO として返す。呼び出し側は復元時にその DTO を
 * `RestoreOpenedUrlsSnapshotCommand` 相当に渡せばよい。
 *
 * @example
 * ```ts
 * const command: DeleteTabGroupCommand = { tabGroupId }
 * const result = await deleteTabGroupUseCase(command)
 * ```
 */
export interface DeleteTabGroupCommand {
  readonly tabGroupId: TabGroupId
}
