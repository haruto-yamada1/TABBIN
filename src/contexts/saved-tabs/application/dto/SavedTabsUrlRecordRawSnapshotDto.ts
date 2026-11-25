import type { PersistenceV2Url } from '@/contexts/saved-tabs/domain/entities/PersistenceModelV2'

/** Lossless URL history retained by deletion Undo. */
export type SavedTabsUrlRecordRawSnapshotDto = PersistenceV2Url
