---
title: リクエスト間 LRU キャッシュ
impact: HIGH
impactDescription: リクエスト間でキャッシュ
tags: server, cache, lru, cross-request
---

## リクエスト間 LRU キャッシュ

`React.cache()` は 1 リクエスト内でのみ有効です。連続リクエスト間で共有するデータ（ユーザーがボタン A の後にボタン B をクリック）には LRU キャッシュを使用します。

**実装:**

```typescript
import { LRUCache } from 'lru-cache'

const cache = new LRUCache<string, any>({
  max: 1000,
  ttl: 5 * 60 * 1000  // 5 minutes
})

export async function getUser(id: string) {
  const cached = cache.get(id)
  if (cached) return cached

  const user = await db.user.findUnique({ where: { id } })
  cache.set(id, user)
  return user
}

// Request 1: DB query, result cached
// Request 2: cache hit, no DB query
```

数秒以内に同じデータを必要とする複数エンドポイントに連続ユーザー操作が当たる場合に使用します。

**Vercel の [Fluid Compute](https://vercel.com/docs/fluid-compute) 使用時:** 複数の同時リクエストが同じ関数インスタンスとキャッシュを共有できるため、LRU キャッシュは特に効果的です。Redis などの外部ストレージなしでリクエスト間にキャッシュが永続します。

**従来の serverless では:** 各呼び出しは隔離して実行されるため、プロセス間キャッシュには Redis を検討してください。

参考: [https://github.com/isaacs/node-lru-cache](https://github.com/isaacs/node-lru-cache)
