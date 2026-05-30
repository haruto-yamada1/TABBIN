---
title: 依存関係ベースの並列化
impact: CRITICAL
impactDescription: 2〜10倍の改善
tags: async, parallelization, dependencies, better-all
---

## 依存関係ベースの並列化

部分的な依存関係がある操作には `better-all` を使い、並列性を最大化します。各タスクを可能な限り早いタイミングで開始します。

**不適切（profile が config を不必要に待つ）:**

```typescript
const [user, config] = await Promise.all([
  fetchUser(),
  fetchConfig()
])
const profile = await fetchProfile(user.id)
```

**適切（config と profile が並列実行）:**

```typescript
import { all } from 'better-all'

const { user, config, profile } = await all({
  async user() { return fetchUser() },
  async config() { return fetchConfig() },
  async profile() {
    return fetchProfile((await this.$.user).id)
  }
})
```

**追加依存関係なしの代替案:**

すべての Promise を先に作成し、最後に `Promise.all()` を実行することもできます。

```typescript
const userPromise = fetchUser()
const profilePromise = userPromise.then(user => fetchProfile(user.id))

const [user, config, profile] = await Promise.all([
  userPromise,
  fetchConfig(),
  profilePromise
])
```

参考: [https://github.com/shuding/better-all](https://github.com/shuding/better-all)
