import type { RemoveUrlsFromCustomProjectsCommand } from '../commands/RemoveUrlsFromCustomProjectsCommand'
import type { RemovedUrlsFromCustomProjectsDto } from '../dto/RemovedUrlsFromCustomProjectsDto'
import type { CustomProjectsCommandService } from '../ports/CustomProjectsCommandService'
import type { LoadTabGroupUrlsUseCase } from './LoadTabGroupUrlsUseCase'

/**
 * `RemoveUrlsFromCustomProjectsUseCase` が依存する port / use-case 群。
 *
 * `CustomProjectsCommandService` は `customProjectsCommandService` port
 * (`@/contexts/saved-tabs/application/ports/CustomProjectsCommandService`) の
 * 実装で、URL / URL ID ベースで全 `CustomProject` から URL を同期削除する
 * 2 種類のメソッドを持つ。
 *
 * `loadTabGroupUrls` は `urlIds` を持たない legacy 形式グループで
 * URL 文字列を引くために使う (issue #501 対応で
 * `@/lib/storage/tabs.getTabGroupUrls` 直叩きを撤去した経緯)。
 */
export interface RemoveUrlsFromCustomProjectsUseCaseDeps {
  readonly customProjectsCommandService: CustomProjectsCommandService
  readonly loadTabGroupUrls: LoadTabGroupUrlsUseCase
}

/**
 * `RemoveUrlsFromCustomProjectsUseCase` の関数型。
 */
export type RemoveUrlsFromCustomProjectsUseCase = (
  command: RemoveUrlsFromCustomProjectsCommand,
) => Promise<RemovedUrlsFromCustomProjectsDto>

/**
 * `RemoveUrlsFromCustomProjectsUseCase` を生成する。
 *
 * 責務 (issue #512 で `savedTabsApp.helpers.ts` から application 層へ移設):
 * 1. 入力 `tabGroups` を modern 形式 (`urlIds` を持つ) と
 *    legacy 形式 (`urlIds` 無し) に分ける。
 * 2. modern 形式グループの `urlIds` を集約し、
 *    `CustomProjectsCommandService.removeUrlIdsFromAllCustomProjects` で
 *    一括同期削除する。
 * 3. legacy 形式グループに対しては `loadTabGroupUrls` で URL を解決し、
 *    解決できた URL を
 *    `CustomProjectsCommandService.removeUrlsFromAllCustomProjects` で
 *    一括同期削除する。
 * 4. URL 解決 / 削除で例外が発生した場合は `console.error` を残し、
 *    他のグループの削除処理は継続する (旧 `helpers.ts` の挙動を踏襲)。
 *
 * `@/types/storage` には依存せず、domain DTO `TabGroupDto` のみを
 * 契約とする (issue #511)。
 */
export const createRemoveUrlsFromCustomProjectsUseCase = (
  deps: RemoveUrlsFromCustomProjectsUseCaseDeps,
): RemoveUrlsFromCustomProjectsUseCase => {
  return async (command) => {
    const groupsWithUrlIds = command.tabGroups.filter(
      (group) => (group.urlIds?.length ?? 0) > 0,
    )
    const groupsWithoutUrlIds = command.tabGroups.filter(
      (group) => (group.urlIds?.length ?? 0) === 0,
    )

    const allUrlIdsToDelete: string[] = groupsWithUrlIds.flatMap(
      (group) => group.urlIds ?? [],
    )
    if (allUrlIdsToDelete.length > 0) {
      await deps.customProjectsCommandService.removeUrlIdsFromAllCustomProjects(
        allUrlIdsToDelete,
        { throwOnError: true },
      )
    }

    let urlsByGroup: { url: string }[][]
    try {
      urlsByGroup = await Promise.all(
        groupsWithoutUrlIds.map(async (group) => {
          const { urls } = await deps.loadTabGroupUrls({ tabGroup: group })
          return urls.map((item) => ({ url: item.url }))
        }),
      )
    } catch (error) {
      console.error('複数グループのURL取得エラー:', error)
      urlsByGroup = []
    }

    const allUrlsToDelete: string[] = urlsByGroup.flatMap((urls) =>
      urls.map((item) => item.url),
    )
    if (allUrlsToDelete.length > 0) {
      await deps.customProjectsCommandService.removeUrlsFromAllCustomProjects(
        allUrlsToDelete,
        { throwOnError: true },
      )
    }

    return {
      removedUrlIdCount: allUrlIdsToDelete.length,
      removedUrlCount: allUrlsToDelete.length,
    }
  }
}
