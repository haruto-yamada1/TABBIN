import { createUrlIdentityKey } from '@/contexts/saved-tabs/domain/services/UrlIdentityPolicy'
import { createBroadcastChannelPersistenceChangeAdapter } from '@/contexts/saved-tabs/infrastructure/browser/BroadcastChannelPersistenceChangeAdapter'
import { getPersistenceBootstrapRuntime } from '@/contexts/saved-tabs/infrastructure/composition/persistenceBootstrapRuntime'
import { IndexedDbPersistenceSnapshotReader } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceSnapshotReader'

export const readNativeTitleSavedUrls = async (): Promise<
  ReadonlySet<string>
> => {
  const runtime = getPersistenceBootstrapRuntime()
  const { savedTabs } = await new IndexedDbPersistenceSnapshotReader(
    runtime.connectionManager,
    runtime.operationGate,
  ).readVerifiedSavedTabsSnapshot()
  const referenced = new Set(savedTabs.memberships.map(({ urlId }) => urlId))
  return new Set(
    savedTabs.urls
      .filter(({ id }) => referenced.has(id))
      .map(({ url }) => createUrlIdentityKey(url)),
  )
}

export const subscribeNativeTitleSavedChanges = (
  listener: () => void,
): (() => void) =>
  createBroadcastChannelPersistenceChangeAdapter().subscribe(({ scopes }) => {
    if (
      scopes.some(
        (scope) =>
          scope === 'urls' ||
          scope === 'memberships' ||
          scope === 'collections',
      )
    ) {
      listener()
    }
  })
