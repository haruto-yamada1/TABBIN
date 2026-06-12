---
title: O(1) ルックアップに Set/Map を使用
impact: LOW-MEDIUM
impactDescription: O(n) から O(1) へ
tags: javascript, set, map, data-structures, performance
---

## O(1) ルックアップに Set/Map を使用

繰り返しメンバーシップチェックには配列を Set/Map に変換します。

**不適切（チェックごとに O(n)）:**

```typescript
const allowedIds = ['a', 'b', 'c', ...]
items.filter(item => allowedIds.includes(item.id))
```

**適切（チェックごとに O(1)）:**

```typescript
const allowedIds = new Set(['a', 'b', 'c', ...])
items.filter(item => allowedIds.has(item.id))
```
