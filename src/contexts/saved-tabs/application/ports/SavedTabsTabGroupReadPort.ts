import type { SavedTabsDisplayTabGroupDto } from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'

/** Read-only projection that preserves saved-tabs display metadata. */
export interface SavedTabsTabGroupReadPort {
  readonly findAll: () => Promise<readonly SavedTabsDisplayTabGroupDto[]>
}
