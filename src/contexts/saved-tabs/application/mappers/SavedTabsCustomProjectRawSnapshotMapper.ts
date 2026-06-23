import type { SavedTabsCustomProjectRawSnapshotDto } from '@/contexts/saved-tabs/application/dto/SavedTabsCustomProjectRawSnapshotDto'
import type { CustomProjectRawSnapshot } from '@/contexts/saved-tabs/domain/repositories/CustomProjectRepository'

export const toSavedTabsCustomProjectRawSnapshotDto = (
  raw: CustomProjectRawSnapshot,
): SavedTabsCustomProjectRawSnapshotDto => ({
  categories: [...raw.categories],
  categoryOrder: raw.categoryOrder ? [...raw.categoryOrder] : undefined,
  createdAt: raw.createdAt,
  id: raw.id,
  name: raw.name,
  projectKeywords: raw.projectKeywords
    ? {
        domainKeywords: [...raw.projectKeywords.domainKeywords],
        titleKeywords: [...raw.projectKeywords.titleKeywords],
        urlKeywords: [...raw.projectKeywords.urlKeywords],
      }
    : undefined,
  updatedAt: raw.updatedAt,
  urlIds: raw.urlIds ? [...raw.urlIds] : undefined,
  urlMetadata: raw.urlMetadata
    ? Object.fromEntries(
        Object.entries(raw.urlMetadata).map(([url, metadata]) => [
          url,
          { ...metadata },
        ]),
      )
    : undefined,
  urls: raw.urls?.map((url) => ({ ...url })),
})

export const toCustomProjectRawSnapshot = (
  dto: SavedTabsCustomProjectRawSnapshotDto,
): CustomProjectRawSnapshot => ({
  ...dto,
  categories: [...dto.categories],
  categoryOrder: dto.categoryOrder ? [...dto.categoryOrder] : undefined,
  projectKeywords: dto.projectKeywords
    ? {
        domainKeywords: [...dto.projectKeywords.domainKeywords],
        titleKeywords: [...dto.projectKeywords.titleKeywords],
        urlKeywords: [...dto.projectKeywords.urlKeywords],
      }
    : undefined,
  urlIds: dto.urlIds ? [...dto.urlIds] : undefined,
  urlMetadata: dto.urlMetadata
    ? Object.fromEntries(
        Object.entries(dto.urlMetadata).map(([url, metadata]) => [
          url,
          { ...metadata },
        ]),
      )
    : undefined,
  urls: dto.urls?.map((url) => ({ ...url })),
})
