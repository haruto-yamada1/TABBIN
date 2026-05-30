---
title: ソートの代わりにループで min/max を求める
impact: LOW
impactDescription: O(n log n) ではなく O(n)
tags: javascript, arrays, performance, sorting, algorithms
---

## ソートの代わりにループで min/max を求める

最小/最大要素の探索は配列を 1 回走査すれば足ります。ソートは無駄で遅くなります。

**不適切（O(n log n) - 最新を求めるためにソート）:**

```typescript
interface Project {
  id: string
  name: string
  updatedAt: number
}

function getLatestProject(projects: Project[]) {
  const sorted = [...projects].sort((a, b) => b.updatedAt - a.updatedAt)
  return sorted[0]
}
```

最大値を求めるだけなのに配列全体をソートします。

**不適切（O(n log n) - 最古と最新をソートで求める）:**

```typescript
function getOldestAndNewest(projects: Project[]) {
  const sorted = [...projects].sort((a, b) => a.updatedAt - b.updatedAt)
  return { oldest: sorted[0], newest: sorted[sorted.length - 1] }
}
```

min/max だけ必要なのに不必要にソートしています。

**適切（O(n) - 単一ループ）:**

```typescript
function getLatestProject(projects: Project[]) {
  if (projects.length === 0) return null
  
  let latest = projects[0]
  
  for (let i = 1; i < projects.length; i++) {
    if (projects[i].updatedAt > latest.updatedAt) {
      latest = projects[i]
    }
  }
  
  return latest
}

function getOldestAndNewest(projects: Project[]) {
  if (projects.length === 0) return { oldest: null, newest: null }
  
  let oldest = projects[0]
  let newest = projects[0]
  
  for (let i = 1; i < projects.length; i++) {
    if (projects[i].updatedAt < oldest.updatedAt) oldest = projects[i]
    if (projects[i].updatedAt > newest.updatedAt) newest = projects[i]
  }
  
  return { oldest, newest }
}
```

配列を 1 回走査、コピーなし、ソートなし。

**代替案（小さな配列向け Math.min/Math.max）:**

```typescript
const numbers = [5, 2, 8, 1, 9]
const min = Math.min(...numbers)
const max = Math.max(...numbers)
```

小さな配列では有効ですが、スプレッド演算子の制限により非常に大きな配列では遅くなるかエラーになる可能性があります。最大配列長は Chrome 143 で約 124000、Safari 18 で 638000 程度です（環境により異なります）— [the fiddle](https://jsfiddle.net/qw1jabsx/4/) を参照。信頼性のためループアプローチを使用してください。
