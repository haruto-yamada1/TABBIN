import {
  getChromeStorageLocal,
  warnMissingChromeStorage,
} from '@/lib/browser/chrome-storage'

import type { BrowserTabPort } from '../../application/ports/BrowserTabPort'
import type { NotificationPort } from '../../application/ports/NotificationPort'
import type { CustomProjectRepository } from '../../domain/repositories/CustomProjectRepository'
import type { ParentCategoryRepository } from '../../domain/repositories/ParentCategoryRepository'
import type { TabGroupRepository } from '../../domain/repositories/TabGroupRepository'
import type { UrlRecordRepository } from '../../domain/repositories/UrlRecordRepository'
import { createChromeBrowserTabAdapter } from '../browser/ChromeBrowserTabAdapter'
import { createSonnerNotificationAdapter } from '../browser/SonnerNotificationAdapter'
import { createChromeCustomProjectRepository } from '../persistence/chrome-storage/ChromeCustomProjectRepository'
import { createChromeParentCategoryRepository } from '../persistence/chrome-storage/ChromeParentCategoryRepository'
import { createChromeTabGroupRepository } from '../persistence/chrome-storage/ChromeTabGroupRepository'
import { createChromeUrlRecordRepository } from '../persistence/chrome-storage/ChromeUrlRecordRepository'

/**
 * presentation / composition 層が repository と port を「テスト可能な形」で
 * 受け取るための依存バンドル。
 *
 * use-case ファクトリ (`create*UseCase`) へ直接このオブジェクトを分割して渡す。
 * ポートを `null` 許容にしないことで、未注入の依存で use-case が
 * 動作してしまう事故を防ぐ。
 */
export interface SavedTabsUseCasesDeps {
  readonly tabGroupRepository: TabGroupRepository
  readonly urlRecordRepository: UrlRecordRepository
  readonly customProjectRepository: CustomProjectRepository
  readonly parentCategoryRepository: ParentCategoryRepository
  readonly browserTabPort: BrowserTabPort
  readonly notificationPort: NotificationPort
}

interface ChromeLike {
  readonly tabs?: {
    readonly create?: (createProperties: {
      readonly active?: boolean
      readonly url: string
    }) => Promise<{ readonly url?: string } | undefined> | undefined
  }
}

const getChromeApi = (): ChromeLike | undefined =>
  (globalThis as typeof globalThis & { chrome?: ChromeLike }).chrome

/**
 * chrome 実環境向けに SavedTabsUseCasesDeps を構築する。
 *
 * `chrome.storage.local` が無い環境（テストで `chrome` を未注入）では
 * `SavedTabsRepositoryUnavailableError` が repository factory から投げられる。
 * presentation 層はそれを呼び出し元（`SavedTabsPage`）でハンドルし、
 * loading 状態を `error` へ遷移させる。
 *
 * @example
 * ```tsx
 * const deps = createSavedTabsUseCasesDeps()
 * const controller = useSavedTabsController({ deps })
 * ```
 */
export const createSavedTabsUseCasesDeps = (): SavedTabsUseCasesDeps => {
  const local = getChromeStorageLocal()
  if (!local) {
    warnMissingChromeStorage('createSavedTabsUseCasesDeps')
  }
  const port = local
    ? {
        get: (key: string) => local.get(key),
        remove: (key: string) => local.remove(key),
        set: (value: Record<string, unknown>) => local.set(value),
      }
    : null

  return {
    browserTabPort: createChromeBrowserTabAdapter({
      getApi: () => getChromeApi(),
    }),
    customProjectRepository: createChromeCustomProjectRepository(port),
    notificationPort: createSonnerNotificationAdapter(),
    parentCategoryRepository: createChromeParentCategoryRepository(port),
    tabGroupRepository: createChromeTabGroupRepository(port),
    urlRecordRepository: createChromeUrlRecordRepository(port),
  }
}
