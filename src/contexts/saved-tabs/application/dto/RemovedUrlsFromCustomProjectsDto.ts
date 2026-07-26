/**
 * `RemoveUrlsFromCustomProjectsUseCase` の結果 DTO。
 *
 * 旧 `savedTabsApp.helpers.ts` の
 * `removeUrlsFromCustomProjectsForGroup` /
 * `removeUrlsFromCustomProjectsForGroups` 戻り値 void を、
 * 「実際に同期削除した URL / URL ID の件数」として観測できる形に
 * 拡張する (issue #512)。
 *
 * - `removedUrlIdCount`: `removeUrlIdsFromAllCustomProjects` で
 *   同期削除した URL ID の件数 (modern 形式グループの `urlIds` 由来)。
 * - `removedUrlCount`: `removeUrlsFromAllCustomProjects` で
 *   同期削除した URL 文字列の件数 (legacy 形式グループ由来)。
 */
export type RemovedUrlsFromCustomProjectsDto = {
  readonly removedUrlIdCount: number
  readonly removedUrlCount: number
}
