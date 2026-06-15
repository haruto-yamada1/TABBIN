import type { UrlRecordRepository } from '../../domain/repositories/UrlRecordRepository'
import { resolveGroupUrls } from '../../domain/services/TabGroupUrlResolver'
import { urlRecordIdToString } from '../../domain/value-objects/UrlRecordId'
import type { LoadTabGroupUrlsCommand } from '../commands/LoadTabGroupUrlsCommand'
import type { LoadTabGroupUrlsDto } from '../dto/LoadTabGroupUrlsDto'

/**
 * `LoadTabGroupUrlsUseCase` が依存する repository 群。
 *
 * テスト時は in-memory mock を注入する。`chrome.storage.local` への
 * 依存を排除した unit test を書けるように、interface のみを公開する。
 */
export interface LoadTabGroupUrlsUseCaseDeps {
  readonly urlRecordRepository: UrlRecordRepository
}

/**
 * `LoadTabGroupUrlsUseCase` の関数型。
 */
export type LoadTabGroupUrlsUseCase = (
  command: LoadTabGroupUrlsCommand,
) => Promise<LoadTabGroupUrlsDto>

/**
 * `LoadTabGroupUrlsUseCase` を生成する。
 *
 * 責務:
 * 1. `UrlRecordRepository.findAll` で全 URL レコードを取得する。
 * 2. `command.tabGroup.urlIds` を `urlRecord` で逆引きし、`subCategory`
 *    を `urlSubCategories` から引き継いだ配列を返す。
 * 3. `urlIds` が空のグループは空配列を返す。
 *
 * 旧 `src/lib/storage/tabs.getTabGroupUrls` の domain 等価物。
 * issue #501 で presentation 層から `@/lib/storage/tabs` への
 * 直接依存を撤去するために新設。
 *
 * `@/types/storage` には依存せず、domain DTO のみを契約とする
 * (issue #511)。
 */
export const createLoadTabGroupUrlsUseCase = (
  deps: LoadTabGroupUrlsUseCaseDeps,
): LoadTabGroupUrlsUseCase => {
  return async (command) => {
    const allUrlRecords = await deps.urlRecordRepository.findAll()
    const urlRecordMap = new Map<string, (typeof allUrlRecords)[number]>()
    for (const record of allUrlRecords) {
      urlRecordMap.set(urlRecordIdToString(record.id), record)
    }
    const urls = resolveGroupUrls({
      group: command.tabGroup,
      urlRecordMap,
    })
    return { urls }
  }
}
