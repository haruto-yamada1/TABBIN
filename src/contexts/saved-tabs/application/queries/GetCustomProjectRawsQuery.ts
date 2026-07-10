import type { SavedTabsCustomProjectRawSnapshotDto } from '@/contexts/saved-tabs/application/dto/SavedTabsCustomProjectRawSnapshotDto'
import { toSavedTabsCustomProjectRawSnapshotDto } from '@/contexts/saved-tabs/application/mappers/SavedTabsCustomProjectRawSnapshotMapper'
import type { CustomProject } from '@/contexts/saved-tabs/domain/entities/CustomProject'
import type { CustomProjectRepository } from '@/contexts/saved-tabs/domain/repositories/CustomProjectRepository'

/**
 * presentation 層が「rich フィールド付き `CustomProject` の生
 * snapshot」を必要とするときの application query (issue #538)。
 *
 * 旧 `useProjectManagement.loadCustomProjectRaws` (private helper) の
 * 責務を application query として切り出す。`findAllRaw` 実装が
 * ある repository では raw snapshot をそのまま返し、未実装の legacy
 * repository では `findAll()` (entity) を widen して最低限の
 * フィールドだけを埋めた raw snapshot を返す。
 *
 * `getCustomProjectsQuery` との対比: 本 query は undo / sync 用途に
 * rich フィールド (`projectKeywords` / `categoryOrder` / `urls` /
 * `urlMetadata`) を保持したまま storage 形へ投影したい場面で
 * 利用する。エンティティだけが必要な軽量経路は
 * `getCustomProjectsQuery` を併用する。
 */
export type GetCustomProjectRawsQuery = () => Promise<
  readonly SavedTabsCustomProjectRawSnapshotDto[]
>

/**
 * `GetCustomProjectRawsQuery` が依存する repository 群。
 */
export type GetCustomProjectRawsQueryDeps = {
  readonly customProjectRepository: CustomProjectRepository
}

const entityToRawSnapshot = (
  project: CustomProject,
): SavedTabsCustomProjectRawSnapshotDto => ({
  categories: [...project.categories],
  createdAt: project.createdAt,
  id: project.id,
  name: project.name,
  updatedAt: project.updatedAt,
  ...(project.urlIds.length > 0 ? { urlIds: [...project.urlIds] } : {}),
})

/**
 * `GetCustomProjectRawsQuery` を生成する。
 *
 * 責務:
 * 1. `customProjectRepository.findAllRaw` があればそれを呼び、
 *    rich フィールド保持 snapshot をそのまま返す
 * 2. 未実装なら `findAll()` で entity を取得し、必要最低限の
 *    フィールドだけを埋めた raw snapshot へ widen する
 *    (rich フィールドは storage 形 projection で省略される)
 *
 * @example
 * ```ts
 * const getCustomProjectRaws = createGetCustomProjectRawsQuery({
 *   customProjectRepository,
 * })
 * const raws = await getCustomProjectRaws()
 * ```
 */
export const createGetCustomProjectRawsQuery = (
  deps: GetCustomProjectRawsQueryDeps,
): GetCustomProjectRawsQuery => {
  return async (): Promise<readonly SavedTabsCustomProjectRawSnapshotDto[]> => {
    if (deps.customProjectRepository.findAllRaw) {
      const raws = await deps.customProjectRepository.findAllRaw()
      return raws.map(toSavedTabsCustomProjectRawSnapshotDto)
    }
    const projects = await deps.customProjectRepository.findAll()
    return projects.map(entityToRawSnapshot)
  }
}
