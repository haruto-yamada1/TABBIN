/**
 * `ParentCategory` の並び順計算を担う pure domain service (issue #519)。
 *
 * 旧 `src/contexts/saved-tabs/presentation/hooks/useCategoryManagement.ts`
 * 内の `buildReorderedCategoryOrder` を domain 等価物として抽出した
 * もの。`@dnd-kit/sortable` への直接依存を避け、`arrayMove` 相当の
 * pure logic を自前実装する（domain 層ガードの React 依存禁止に
 * 合わせるため）。
 *
 * UI 側で受け取った `active` / `over` ID をキーに、現在の表示順を
 * 「並び替えモードの一時配列」または「確定済み配列」のどちらから
 * 読み出すかを引数で切り替える。
 */
export interface BuildReorderedCategoryOrderParams {
  readonly activeId: string
  readonly overId: string
  /**
   * 並び替えモード中の一時順序。`isCategoryReorderMode=true` の
   * 場合はこの配列を対象にし、`false` の場合は `categoryOrder` を対象にする。
   */
  readonly tempCategoryOrder: readonly string[]
  /** 確定済みの `ParentCategory` 表示順（`tempCategoryOrder` のシード）。 */
  readonly categoryOrder: readonly string[]
  /**
   * 並び替えモード中なら `tempCategoryOrder`、それ以外は
   * `categoryOrder` を編集対象にする。
   */
  readonly isCategoryReorderMode: boolean
}

/**
 * `@dnd-kit/sortable.arrayMove` と同じ挙動の pure 関数。
 *
 * `from` / `to` の負数対応を含む。`@dnd-kit/sortable` ESM 経由では
 * React import が漏れ、domain 層の React 依存禁止に抵触するため
 * ここで自前実装する。
 */
function moveItem<T>(array: readonly T[], from: number, to: number): T[] {
  const newArray = array.slice()
  const normalizedTo = to < 0 ? newArray.length + to : to
  const [moved] = newArray.splice(from, 1)
  newArray.splice(normalizedTo, 0, moved)
  return newArray
}

/**
 * カテゴリ ID 配列に対し、`activeId` を `overId` の位置へ移動した
 * 新しい配列を返す。
 *
 * - `activeId` / `overId` のいずれかが現在の順序に存在しない場合は
 *   `null` を返し、呼び出し側で並び替えをスキップさせる。
 * - 自分自身へのドラッグ (`activeId === overId`) は呼び出し元で
 *   弾く想定だが、念のため同一 ID の場合は元の配列をコピーして返す。
 *
 * 旧 `useCategoryManagement.buildReorderedCategoryOrder` の
 * 挙動を保ったまま domain 層へ移設する。
 *
 * @example
 * ```ts
 * buildReorderedCategoryOrder({
 *   activeId: 'cat-b',
 *   categoryOrder: ['cat-a', 'cat-b', 'cat-c'],
 *   isCategoryReorderMode: false,
 *   overId: 'cat-c',
 *   tempCategoryOrder: [],
 * })
 * // => ['cat-a', 'cat-c', 'cat-b']
 * ```
 */
export const buildReorderedCategoryOrder = (
  params: BuildReorderedCategoryOrderParams,
): readonly string[] | null => {
  const {
    activeId,
    overId,
    tempCategoryOrder,
    categoryOrder,
    isCategoryReorderMode,
  } = params
  const currentOrder: readonly string[] = isCategoryReorderMode
    ? tempCategoryOrder
    : categoryOrder
  if (activeId === overId) {
    return [...currentOrder]
  }
  const oldIndex = currentOrder.indexOf(activeId)
  const newIndex = currentOrder.indexOf(overId)
  if (oldIndex === -1 || newIndex === -1) {
    return null
  }
  return moveItem(currentOrder, oldIndex, newIndex)
}
