import { PersistenceBootstrapService } from '@/contexts/saved-tabs/application/services/PersistenceBootstrapService'
import type { PersistenceBootstrapServiceOptions } from '@/contexts/saved-tabs/application/services/PersistenceBootstrapService'

type CompletePersistenceBootstrapServiceOptions = Omit<
  PersistenceBootstrapServiceOptions,
  'cutoverPolicy'
>

export const createCompletePersistenceBootstrapServiceForTesting = (
  options: CompletePersistenceBootstrapServiceOptions,
): PersistenceBootstrapService =>
  new PersistenceBootstrapService({
    ...options,
    cutoverPolicy: 'complete',
  })
