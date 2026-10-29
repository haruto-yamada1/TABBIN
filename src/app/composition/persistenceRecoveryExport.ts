import { getPersistenceBootstrapRuntime } from '@/contexts/saved-tabs/infrastructure/composition/persistenceBootstrapRuntime'
import { IndexedDbConnectionManager } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbConnectionManager'
import { readSavedTabsRecoveryData } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbSavedTabsRecoveryReader'

const ISO_DATE_LENGTH = 10

export const exportSavedTabsRecoveryData = async (): Promise<void> => {
  const { downloadAsJson } =
    await import('@/features/options/lib/import-export')
  const manager = new IndexedDbConnectionManager()
  try {
    const data = await readSavedTabsRecoveryData(
      manager,
      getPersistenceBootstrapRuntime().operationGate,
    )
    await downloadAsJson(
      data,
      `tabbin-saved-tabs-recovery-${new Date().toISOString().slice(0, ISO_DATE_LENGTH)}.json`,
    )
  } finally {
    manager.close()
  }
}
