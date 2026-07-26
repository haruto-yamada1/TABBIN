export type PersistenceChangeScope =
  | 'analyticsViews'
  | 'categories'
  | 'collections'
  | 'conversations'
  | 'groups'
  | 'memberships'
  | 'recoverySnapshots'
  | 'urls'

export type PersistenceChangeEvent = {
  readonly changeId: string
  readonly revision: number
  readonly scopes: readonly PersistenceChangeScope[]
}

export type PersistenceChangePort = {
  readonly publish: (event: PersistenceChangeEvent) => Promise<void>
  readonly subscribe: (
    listener: (event: PersistenceChangeEvent) => void,
  ) => () => void
}
