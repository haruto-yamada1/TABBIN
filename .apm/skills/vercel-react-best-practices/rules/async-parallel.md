---
title: 独立した操作には Promise.all() を使用
impact: CRITICAL
impactDescription: 2〜10倍の改善
tags: async, parallelization, promises, waterfalls
---

## 独立した操作には Promise.all() を使用

非同期操作に相互依存がない場合、`Promise.all()` を使って並行実行します。

**不適切（逐次実行、3 ラウンドトリップ）:**

```typescript
const user = await fetchUser()
const posts = await fetchPosts()
const comments = await fetchComments()
```

**適切（並列実行、1 ラウンドトリップ）:**

```typescript
const [user, posts, comments] = await Promise.all([
  fetchUser(),
  fetchPosts(),
  fetchComments()
])
```
