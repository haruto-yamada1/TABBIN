import type { CollectionProjectionDto } from './CollectionProjectionDto'

/**
 * Current category settings are a normalized Collection projection. Legacy
 * domain/category arrays are reconstructed only by the Chrome adapter.
 */
export type DomainCategorySettingsDto = Pick<
  CollectionProjectionDto,
  'collection' | 'collectionCategories'
>
