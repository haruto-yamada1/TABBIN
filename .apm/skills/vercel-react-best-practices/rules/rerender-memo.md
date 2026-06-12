---
title: メモ化コンポーネントへ抽出
impact: MEDIUM
impactDescription: 早期 return を可能にする
tags: rerender, memo, useMemo, optimization
---

## メモ化コンポーネントへ抽出

高コストな処理をメモ化コンポーネントに抽出し、計算前の早期 return を可能にします。

**不適切（loading 中も avatar を計算）:**

```tsx
function Profile({ user, loading }: Props) {
  const avatar = useMemo(() => {
    const id = computeAvatarId(user)
    return <Avatar id={id} />
  }, [user])

  if (loading) return <Skeleton />
  return <div>{avatar}</div>
}
```

**適切（loading 時は計算をスキップ）:**

```tsx
const UserAvatar = memo(function UserAvatar({ user }: { user: User }) {
  const id = useMemo(() => computeAvatarId(user), [user])
  return <Avatar id={id} />
})

function Profile({ user, loading }: Props) {
  if (loading) return <Skeleton />
  return (
    <div>
      <UserAvatar user={user} />
    </div>
  )
}
```

**注:** プロジェクトで [React Compiler](https://react.dev/learn/react-compiler) が有効な場合、`memo()` と `useMemo()` による手動メモ化は不要です。コンパイラが再レンダーを自動最適化します。
