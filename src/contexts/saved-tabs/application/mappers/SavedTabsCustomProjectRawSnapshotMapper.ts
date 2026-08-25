import type { SavedTabsCustomProjectRawSnapshotDto } from '@/contexts/saved-tabs/application/dto/SavedTabsCustomProjectRawSnapshotDto'
import { toSavedTabsCustomProjectDto } from '@/contexts/saved-tabs/application/mappers/SavedTabsPresentationMapper'
import type { CustomProjectRawSnapshot } from '@/contexts/saved-tabs/domain/repositories/CustomProjectRepository'

export const toSavedTabsCustomProjectRawSnapshotDto = (
  raw: CustomProjectRawSnapshot,
): SavedTabsCustomProjectRawSnapshotDto => toSavedTabsCustomProjectDto(raw)

export const toCustomProjectRawSnapshot = (
  dto: SavedTabsCustomProjectRawSnapshotDto,
): CustomProjectRawSnapshot => toSavedTabsCustomProjectDto(dto)
