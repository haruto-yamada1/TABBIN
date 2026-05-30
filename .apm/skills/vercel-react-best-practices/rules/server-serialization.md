---
title: RSC 境界でのシリアライズを最小化
impact: HIGH
impactDescription: データ転送サイズの削減
tags: server, rsc, serialization, props
---

## RSC 境界でのシリアライズを最小化

React Server/Client 境界では、すべてのオブジェクトプロパティが文字列にシリアライズされ、HTML レスポンスと後続の RSC リクエストに埋め込まれます。このシリアライズデータはページ重量と読み込み時間に直接影響するため、**サイズは非常に重要**です。クライアントが実際に使用するフィールドだけを渡してください。

**不適切（50 フィールドすべてをシリアライズ）:**

```tsx
async function Page() {
  const user = await fetchUser()  // 50 fields
  return <Profile user={user} />
}

'use client'
function Profile({ user }: { user: User }) {
  return <div>{user.name}</div>  // uses 1 field
}
```

**適切（1 フィールドだけシリアライズ）:**

```tsx
async function Page() {
  const user = await fetchUser()
  return <Profile name={user.name} />
}

'use client'
function Profile({ name }: { name: string }) {
  return <div>{name}</div>
}
```
