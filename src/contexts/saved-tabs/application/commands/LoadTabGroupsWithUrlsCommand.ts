import type { TabGroup } from '@/types/storage'

/**
 * `LoadTabGroupsWithUrlsUseCase` の入力。
 *
 * presentation 層が `useTabData` 内で保持している `TabGroup[]`
 * （= URL 未解決、storage 形）を渡すと、use-case 側が
 * `UrlRecordRepository` から URL を引き直し、`urls` フィールドを
 * 埋めた `TabGroup[]` を返す。
 *
 * `tabGroups` を空配列で呼ぶと即座に空配列を返す（storage アクセスなし）。
 *
 * 旧 `src/lib/storage/tabs.resolveTabGroupsWithUrls(groups)` の
 * 等価物。`@/lib/storage/tabs` への直接依存を撤去するために新設
 * （issue #501）。
 *
 * 入力型は storage 形 `TabGroup` を採用している。domain エンティティは
 * `urlSubCategories` などの rich 補助フィールドを持たないが、
 * presentation 層は `subCategory` の引き継ぎが必要なので
 * storage 形を直接受け取る形にしている。use-case 内部では
 * `UrlRecordRepository.findAll` の結果（domain `UrlRecord`）を
 * storage 形の `TabGroup.urlSubCategories` と突き合わせる。
 */
export interface LoadTabGroupsWithUrlsCommand {
  readonly tabGroups: readonly TabGroup[]
}
