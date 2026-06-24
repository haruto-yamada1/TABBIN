/**
 * `ReorderParentCategoriesUseCase` の入力 (issue #519)。
 *
 * UI 側で並び替えを確定した `ParentCategory[]` を受け取り、
 * use-case 内で domain entity へ widening キャストして
 * `parentCategoryRepository.saveAll` に委譲する。
 *
 * `@/types/storage` を使うのは、 `presentation` 層が保持する
 * `ParentCategory` state が storage 層型であり、 domain entity と
 * の branded 差異は use-case 境界で吸収する設計 (issue #511/#519)
 * に従うため。
 *
 * 並び順検証は UI 側（dnd-kit の arrayMove 出力、 domain
 * `ParentCategoryReorderService.buildReorderedCategoryOrder` 出力）
 * に委ねる方針。
 */
import type { SavedTabsParentCategoryDto as ParentCategory } from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'

export interface ReorderParentCategoriesCommand {
  readonly categories: readonly ParentCategory[]
}
