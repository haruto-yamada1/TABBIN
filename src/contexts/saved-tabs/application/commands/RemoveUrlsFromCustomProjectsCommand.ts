import type { TabGroupDto } from '../../domain/dto/TabGroupDto'

/**
 * `RemoveUrlsFromCustomProjectsUseCase` の入力。
 *
 * 旧 `savedTabsApp.helpers.ts` の `removeUrlsFromCustomProjectsForGroup` /
 * `removeUrlsFromCustomProjectsForGroups` の責務を application 層に
 * 切り出した use-case (issue #512)。
 *
 * - `tabGroups`: 削除対象に該当する `TabGroupDto` 群 (1 件または複数)。
 *   `urlIds` を持つ modern 形式と `urls` を持たない legacy 形式が
 *   混在していても、各グループの形式に応じて URL 解決 + 同期削除を行う。
 *
 * `LoadTabGroupUrlsUseCase` を内部で呼ぶため、use-case には
 * `loadTabGroupUrls` の関数参照を deps として渡す。
 *
 * `@/types/storage` には依存せず、domain DTO `TabGroupDto` だけを
 * 受け取る (issue #511)。
 */
export interface RemoveUrlsFromCustomProjectsCommand {
  readonly tabGroups: readonly TabGroupDto[]
}
