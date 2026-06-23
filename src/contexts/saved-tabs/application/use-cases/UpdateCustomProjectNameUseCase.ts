import type { SavedTabsCustomProjectDto } from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'
import { toSavedTabsCustomProjectDto } from '@/contexts/saved-tabs/application/mappers/SavedTabsPresentationMapper'
import type { ClockPort } from '@/contexts/saved-tabs/application/ports/ClockPort'
import type { CustomProject } from '@/contexts/saved-tabs/domain/entities/CustomProject'
import type { CustomProjectRepository } from '@/contexts/saved-tabs/domain/repositories/CustomProjectRepository'
import { createCategoryName } from '@/contexts/saved-tabs/domain/value-objects/CategoryName'
import { createCustomProjectId } from '@/contexts/saved-tabs/domain/value-objects/CustomProjectId'
import { createSavedAt } from '@/contexts/saved-tabs/domain/value-objects/SavedAt'

export interface UpdateCustomProjectNameCommand {
  readonly projectId: string
  readonly newName: string
}

export interface UpdateCustomProjectNameResult {
  readonly all: readonly SavedTabsCustomProjectDto[]
  readonly project: SavedTabsCustomProjectDto
}

export type UpdateCustomProjectNameUseCase = (
  command: UpdateCustomProjectNameCommand,
) => Promise<UpdateCustomProjectNameResult>

export interface UpdateCustomProjectNameUseCaseDeps {
  readonly customProjectRepository: CustomProjectRepository
  readonly clock: ClockPort
}

/**
 * `UpdateCustomProjectNameUseCase` を生成する。
 *
 * 旧 `src/lib/storage/projects.updateCustomProjectName` の DDD use-case 化
 * (issue #509)。同名重複は自分自身を除外して検出。
 */
export const createUpdateCustomProjectNameUseCase = (
  deps: UpdateCustomProjectNameUseCaseDeps,
): UpdateCustomProjectNameUseCase => {
  return async (command) => {
    const all = await deps.customProjectRepository.findAll()
    const newName = command.newName.trim()
    if (newName.length === 0) {
      throw new Error('DUPLICATE_PROJECT_NAME:')
    }
    if (
      all.some(
        (project) =>
          project.name.toLowerCase() === newName.toLowerCase() &&
          project.id !== command.projectId,
      )
    ) {
      throw new Error(`DUPLICATE_PROJECT_NAME:${newName}`)
    }
    const targetId = createCustomProjectId(command.projectId)
    const now = createSavedAt(deps.clock.now())
    const updatedAll: CustomProject[] = []
    let updated: CustomProject | null = null
    for (const project of all) {
      if (project.id === targetId) {
        const next: CustomProject = {
          ...project,
          name: createCategoryName(newName),
          updatedAt: now,
        }
        updatedAll.push(next)
        updated = next
      } else {
        updatedAll.push(project)
      }
    }
    if (!updated) {
      throw new Error(`Project with ID ${command.projectId} not found`)
    }
    await deps.customProjectRepository.saveAll(updatedAll)
    return {
      all: updatedAll.map(toSavedTabsCustomProjectDto),
      project: toSavedTabsCustomProjectDto(updated),
    }
  }
}
