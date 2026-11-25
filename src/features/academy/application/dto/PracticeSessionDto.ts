import type { PersistenceV2Snapshot } from '@/contexts/saved-tabs/public-api'

export type PracticeSeed = 'saved' | 'empty'

export type PracticeBrowserAction = {
  readonly type: 'open' | 'window'
  readonly urls: readonly string[]
}

export type PracticeSnapshotDto = PersistenceV2Snapshot
