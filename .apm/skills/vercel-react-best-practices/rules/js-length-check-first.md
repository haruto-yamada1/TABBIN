---
title: 配列比較の早期長さチェック
impact: MEDIUM-HIGH
impactDescription: 長さが異なる場合の高コスト操作を回避
tags: javascript, arrays, performance, optimization, comparison
---

## 配列比較の早期長さチェック

高コスト操作（ソート、深い等価性、シリアライズ）で配列を比較する場合、まず長さをチェックします。長さが異なれば配列は等しくなり得ません。

実アプリケーションでは、比較がホットパス（イベントハンドラー、レンダーループ）で実行される場合に特に有効です。

**不適切（常に高コスト比較を実行）:**

```typescript
function hasChanges(current: string[], original: string[]) {
  // Always sorts and joins, even when lengths differ
  return current.sort().join() !== original.sort().join()
}
```

`current.length` が 5 で `original.length` が 100 でも 2 つの O(n log n) ソートが実行されます。配列の join と文字列比較のオーバーヘッドもあります。

**適切（O(1) の長さチェックを先に）:**

```typescript
function hasChanges(current: string[], original: string[]) {
  // Early return if lengths differ
  if (current.length !== original.length) {
    return true
  }
  // Only sort when lengths match
  const currentSorted = current.toSorted()
  const originalSorted = original.toSorted()
  for (let i = 0; i < currentSorted.length; i++) {
    if (currentSorted[i] !== originalSorted[i]) {
      return true
    }
  }
  return false
}
```

この新しいアプローチがより効率的な理由:
- 長さが異なる場合のソートと join のオーバーヘッドを回避
- join 文字列のメモリ消費を回避（大きな配列で特に重要）
- 元の配列を変更しない
- 差異が見つかった時点で早期 return
