import type { FindUrlRecordByUrlCommand } from '@/contexts/saved-tabs/application/commands/FindUrlRecordByUrlCommand'
import type { FindUrlRecordByUrlDto } from '@/contexts/saved-tabs/application/dto/FindUrlRecordByUrlDto'
import type { UrlRecordRepository } from '@/contexts/saved-tabs/domain/repositories/UrlRecordRepository'

/**
 * `FindUrlRecordByUrlUseCase` が依存する repository 群。
 */
export type FindUrlRecordByUrlUseCaseDeps = {
  readonly urlRecordRepository: UrlRecordRepository
}

/**
 * `FindUrlRecordByUrlUseCase` の関数型。
 */
export type FindUrlRecordByUrlUseCase = (
  command: FindUrlRecordByUrlCommand,
) => Promise<FindUrlRecordByUrlDto>

/**
 * `FindUrlRecordByUrlUseCase` を生成する。
 *
 * 責務:
 * 1. `UrlRecordRepository.findAll` で全 `UrlRecord` を取得し、
 *    `command.url` と `record.url` が完全一致するものを探す。
 * 2. 見つかれば `FindUrlRecordByUrlDto.record` に詰めて返す。
 *    見つからなければ `record: null`。
 *
 * 旧 `getUrlRecords().find((record) => record.url === url)` の
 * domain 等価物。issue #501 で presentation 層から
 * `@/lib/storage/urls` への直接依存を撤去するために新設。
 */
export const createFindUrlRecordByUrlUseCase = (
  deps: FindUrlRecordByUrlUseCaseDeps,
): FindUrlRecordByUrlUseCase => {
  return async (command) => {
    const allUrlRecords = await deps.urlRecordRepository.findAll()
    const targetRecord = allUrlRecords.find(
      (record) => record.url === command.url,
    )
    if (!targetRecord) {
      return { record: null }
    }
    return {
      record: {
        id: targetRecord.id,
        title: targetRecord.title,
        url: targetRecord.url,
      },
    }
  }
}
