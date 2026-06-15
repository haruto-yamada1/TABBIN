import {
  migrateParentCategoriesToDomainNames,
  migrateToUrlsStorage,
} from '@/lib/storage/migration'

import type { MigrationPort } from '../../../application/ports/MigrationPort'

/**
 * `MigrationPort` の chrome 実装。実体は `src/lib/storage/migration` の
 * 既存関数をラップするだけで、内部で `chrome.storage.local` の読み書きを
 * 完結させる。
 *
 * `lib/storage` 自体はこの PR で削除しない方針 (issue #509 対象外) なので、
 * adapter 側で `chrome.storage.local` への直アクセスは持たず、lib/storage
 * 関数への薄い delegate に留める。`lib/storage` 削除は別 issue で
 * 段階的に行う。
 */
export const createChromeMigrationAdapter = (): MigrationPort => ({
  migrateParentCategoriesToDomainNames: async () => {
    await migrateParentCategoriesToDomainNames()
  },
  migrateToUrlsStorage: async () => {
    await migrateToUrlsStorage()
  },
})
