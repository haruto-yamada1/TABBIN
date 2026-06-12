---
title: React.cache() によるリクエスト単位の重複排除
impact: MEDIUM
impactDescription: リクエスト内で重複排除
tags: server, cache, react-cache, deduplication
---

## React.cache() によるリクエスト単位の重複排除

サーバー側のリクエスト重複排除には `React.cache()` を使用します。認証とデータベースクエリが最も恩恵を受けます。

**使用例:**

```typescript
import { cache } from 'react'

export const getCurrentUser = cache(async () => {
  const session = await auth()
  if (!session?.user?.id) return null
  return await db.user.findUnique({
    where: { id: session.user.id }
  })
})
```

単一リクエスト内で `getCurrentUser()` を複数回呼んでも、クエリは 1 回だけ実行されます。

**インラインオブジェクトを引数にしない:**

`React.cache()` は浅い等価性（`Object.is`）でキャッシュヒットを判定します。インラインオブジェクトは呼び出しごとに新しい参照を作り、キャッシュヒットを妨げます。

**不適切（常にキャッシュミス）:**

```typescript
const getUser = cache(async (params: { uid: number }) => {
  return await db.user.findUnique({ where: { id: params.uid } })
})

// Each call creates new object, never hits cache
getUser({ uid: 1 })
getUser({ uid: 1 })  // Cache miss, runs query again
```

**適切（キャッシュヒット）:**

```typescript
const getUser = cache(async (uid: number) => {
  return await db.user.findUnique({ where: { id: uid } })
})

// Primitive args use value equality
getUser(1)
getUser(1)  // Cache hit, returns cached result
```

オブジェクトを渡す必要がある場合は、同じ参照を渡してください:

```typescript
const params = { uid: 1 }
getUser(params)  // Query runs
getUser(params)  // Cache hit (same reference)
```

**Next.js 固有の注意:**

Next.js では `fetch` API がリクエストメモ化で自動拡張されます。同じ URL とオプションのリクエストは単一リクエスト内で自動的に重複排除されるため、`fetch` 呼び出しに `React.cache()` は不要です。ただし、他の非同期タスクには `React.cache()` が不可欠です:

- データベースクエリ（Prisma、Drizzle など）
- 重い計算
- 認証チェック
- ファイルシステム操作
- fetch 以外の非同期処理

コンポーネントツリー全体でこれらの操作を重複排除するために `React.cache()` を使用してください。

参考: [React.cache documentation](https://react.dev/reference/react/cache)
