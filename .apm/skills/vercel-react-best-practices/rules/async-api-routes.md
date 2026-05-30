---
title: API ルートのウォーターフォール連鎖を防ぐ
impact: CRITICAL
impactDescription: 2〜10倍の改善
tags: api-routes, server-actions, waterfalls, parallelization
---

## API ルートのウォーターフォール連鎖を防ぐ

API ルートと Server Actions では、まだ await しない場合でも、独立した操作をすぐに開始します。

**不適切（config が auth を待ち、data が両方を待つ）:**

```typescript
export async function GET(request: Request) {
  const session = await auth()
  const config = await fetchConfig()
  const data = await fetchData(session.user.id)
  return Response.json({ data, config })
}
```

**適切（auth と config を即座に開始）:**

```typescript
export async function GET(request: Request) {
  const sessionPromise = auth()
  const configPromise = fetchConfig()
  const session = await sessionPromise
  const [config, data] = await Promise.all([
    configPromise,
    fetchData(session.user.id)
  ])
  return Response.json({ data, config })
}
```

より複雑な依存関係チェーンがある操作には、並列性を自動最大化する `better-all` を使用します（依存関係ベースの並列化を参照）。
