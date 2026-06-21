import { createCustomProjectId } from '@/contexts/saved-tabs/domain/value-objects/CustomProjectId'

/**
 * 旧 `src/lib/storage/projects.CUSTOM_UNCATEGORIZED_PROJECT_ID` を
 * domain 層に再配置した定数。`lib/storage` 側に存在した `id` は
 * `custom-uncategorized` 固定で、chrome.storage 上に必ず存在する
 * システム予約の project ID として扱われる。
 *
 * presentation 層から直接 `lib/storage/projects` を import しない
 * 方針 (issue #509) に伴い、本定数を domain 側で公開する。
 * branded `CustomProjectId` 型を返す。
 */
export const UNCATEGORIZED_PROJECT_ID = createCustomProjectId(
  'custom-uncategorized',
)

/**
 * 旧 `src/lib/storage/projects.CUSTOM_UNCATEGORIZED_PROJECT_NAME` を
 * domain 層に再配置した定数。「未分類」のローカライズ前の素の値。
 */
