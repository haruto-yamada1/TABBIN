import type { SavedTabsCustomProjectDto } from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'
import { toSavedTabsCustomProjectDto } from '@/contexts/saved-tabs/application/mappers/SavedTabsPresentationMapper'
import type { ClockPort } from '@/contexts/saved-tabs/application/ports/ClockPort'
import type { IdGeneratorPort } from '@/contexts/saved-tabs/application/ports/IdGeneratorPort'
import type { CustomProject } from '@/contexts/saved-tabs/domain/entities/CustomProject'
import { createCustomProject } from '@/contexts/saved-tabs/domain/entities/CustomProject'
import type { CustomProjectRepository } from '@/contexts/saved-tabs/domain/repositories/CustomProjectRepository'

/**
 * `CreateCustomProjectUseCase` の入力。
 */
export type CreateCustomProjectCommand = {
  readonly name: string
}

export type CreateCustomProjectResult = {
  readonly all: readonly SavedTabsCustomProjectDto[]
  readonly project: SavedTabsCustomProjectDto
}

export type CreateCustomProjectUseCase = (
  command: CreateCustomProjectCommand,
) => Promise<CreateCustomProjectResult>

export type CreateCustomProjectUseCaseDeps = {
  readonly customProjectRepository: CustomProjectRepository
  readonly clock: ClockPort
  readonly idGenerator: IdGeneratorPort
}

/**
 * `CreateCustomProjectUseCase` を生成する。
 *
 * 責務:
 * 1. 既存 `CustomProject` 一覧から同名 (大小無視) 重複を検出
 * 2. `idGenerator.generate()` で `CustomProjectId` を採番
 * 3. 空 `urlIds` / 空 `categories` の新規プロジェクトを repository に保存
 *
 * 旧 `src/lib/storage/projects.createCustomProject` の DDD use-case 化
 * (issue #509)。`customProjectRepository.saveAll` の mapper が
 * `projectKeywords` / `urls` / `urlMetadata` / `categoryOrder` などの
 * rich 補助フィールドを original raw から持ち越すため、新規プロジェクト
 * には不要。
 */
export const createCreateCustomProjectUseCase = (
  deps: CreateCustomProjectUseCaseDeps,
): CreateCustomProjectUseCase => {
  return async (command) => {
    const name = command.name.trim()
    if (name.length === 0) {
      throw new Error('DUPLICATE_PROJECT_NAME:')
    }
    const all = await deps.customProjectRepository.findAll()
    if (
      all.some((project) => project.name.toLowerCase() === name.toLowerCase())
    ) {
      throw new Error(`DUPLICATE_PROJECT_NAME:${name}`)
    }
    const id = deps.idGenerator.generate()
    const now = deps.clock.now()
    const newProject = createCustomProject({
      collection: {
        createdAt: now,
        definition: {
          projectKeywords: {
            domainKeywords: [],
            titleKeywords: [],
            urlKeywords: [],
          },
          type: 'custom',
        },
        id,
        name,
        sortOrder: all.length,
        updatedAt: now,
      },
      collectionCategories: [],
      memberships: [],
    })
    const updatedAll: readonly CustomProject[] = [...all, newProject]
    await deps.customProjectRepository.saveAll(updatedAll)
    return {
      all: updatedAll.map(toSavedTabsCustomProjectDto),
      project: toSavedTabsCustomProjectDto(newProject),
    }
  }
}
