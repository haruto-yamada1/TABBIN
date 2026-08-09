import type {
  SavedTabsDisplayTabGroupDto,
  SavedTabsTabGroupDto,
} from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'

/**
 * `LoadTabGroupsWithUrlsUseCase` の入力。
 *
 * presentation 層が `useTabData` 内で保持している `TabGroupDto[]`
 * （= URL 未解決）を渡すと、use-case 側が `UrlRecordRepository` から
 * URL を引き直し、`urls` フィールドを埋めた `TabGroupDto[]` を返す。
 *
 * `tabGroups` を空配列で呼ぶと即座に空配列を返す（storage アクセスなし）。
 *
 * 旧 `src/lib/storage/tabs.resolveTabGroupsWithUrls(groups)` の
 * 等価物。`@/lib/storage/tabs` への直接依存を撤去するために新設
 * （issue #501）。
 *
 * 入力型は domain DTO `TabGroupDto` を採用している (issue #511)。
 * `urlSubCategories` の引き継ぎは `TabGroupDto` widening 後の
 * `resolveGroupUrls` 側で吸収する（domain 層 widening は
 * `TabGroupUrlResolver.ts` 内で行う）。
 */
export type LoadTabGroupsWithUrlsCommand = {
  readonly tabGroups: readonly (
    | SavedTabsTabGroupDto
    | SavedTabsDisplayTabGroupDto
  )[]
}
