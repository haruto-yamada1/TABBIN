import { v4 as uuidv4 } from 'uuid'

import type { SavedTabsCustomProjectDto } from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'
import { toSavedTabsCustomProjectDto } from '@/contexts/saved-tabs/application/mappers/SavedTabsPresentationMapper'
import type { CustomProject } from '@/contexts/saved-tabs/domain/entities/CustomProject'
import { createCustomProject } from '@/contexts/saved-tabs/domain/entities/CustomProject'
import type { CustomProjectRepository } from '@/contexts/saved-tabs/domain/repositories/CustomProjectRepository'
import type { CustomProjectId } from '@/contexts/saved-tabs/domain/value-objects/CustomProjectId'

/**
 * `CreateCustomProjectUseCase` の入力。
 */
export interface CreateCustomProjectCommand {
  readonly name: string
}

export interface CreateCustomProjectResult {
  readonly all: readonly SavedTabsCustomProjectDto[]
  readonly project: SavedTabsCustomProjectDto
}

export type CreateCustomProjectUseCase = (
  command: CreateCustomProjectCommand,
) => Promise<CreateCustomProjectResult>

export interface CreateCustomProjectUseCaseDeps {
  readonly customProjectRepository: CustomProjectRepository
  readonly generateId?: () => string
  readonly now?: () => number
}

const defaultGenerateId = (): string => uuidv4()
const defaultNow = (): number => Date.now()

/**
 * `CreateCustomProjectUseCase` を生成する。
 *
 * 責務:
 * 1. 既存 `CustomProject` 一覧から同名 (大小無視) 重複を検出
 * 2. `generateId()` で `CustomProjectId` を採番
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
    // eslint-disable-next-line typescript/no-unsafe-type-assertion
    const id = (deps.generateId ?? defaultGenerateId)() as CustomProjectId
    const now = (deps.now ?? defaultNow)()
    const newProject = createCustomProject({
      categories: [],
      createdAt: now,
      id,
      name,
      updatedAt: now,
      urlIds: [],
    })
    const updatedAll: readonly CustomProject[] = [...all, newProject]
    await deps.customProjectRepository.saveAll(updatedAll)
    return {
      all: updatedAll.map(toSavedTabsCustomProjectDto),
      project: toSavedTabsCustomProjectDto(newProject),
    }
  }
}
