---
title: 不変性のため sort() の代わりに toSorted() を使用
impact: MEDIUM-HIGH
impactDescription: React state の mutation バグを防ぐ
tags: javascript, arrays, immutability, react, state, mutation
---

## 不変性のため sort() の代わりに toSorted() を使用

`.sort()` は配列をインプレースで変更し、React state や props でバグの原因になります。mutation なしで新しいソート済み配列を作る `.toSorted()` を使用します。

**不適切（元の配列を変更）:**

```typescript
function UserList({ users }: { users: User[] }) {
  // Mutates the users prop array!
  const sorted = useMemo(
    () => users.sort((a, b) => a.name.localeCompare(b.name)),
    [users]
  )
  return <div>{sorted.map(renderUser)}</div>
}
```

**適切（新しい配列を作成）:**

```typescript
function UserList({ users }: { users: User[] }) {
  // Creates new sorted array, original unchanged
  const sorted = useMemo(
    () => users.toSorted((a, b) => a.name.localeCompare(b.name)),
    [users]
  )
  return <div>{sorted.map(renderUser)}</div>
}
```

**React で重要な理由:**

1. props/state の mutation は React の不変性モデルを破る — React は props と state を読み取り専用として扱うことを期待
2. stale closure バグの原因 — クロージャ（コールバック、effect）内で配列を変更すると予期しない挙動になる

**ブラウザサポート（旧ブラウザ向けフォールバック）:**

`.toSorted()` はすべてのモダンブラウザ（Chrome 110+、Safari 16+、Firefox 115+、Node.js 20+）で利用可能です。旧環境ではスプレッド演算子を使用:

```typescript
// Fallback for older browsers
const sorted = [...items].sort((a, b) => a.value - b.value)
```

**その他の不変配列メソッド:**

- `.toSorted()` - 不変ソート
- `.toReversed()` - 不変リバース
- `.toSpliced()` - 不変スプライス
- `.with()` - 不変要素置換
