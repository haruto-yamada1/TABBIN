---
title: 繰り返しルックアップ用のインデックス Map を構築
impact: LOW-MEDIUM
impactDescription: 100万操作を2000操作に
tags: javascript, map, indexing, optimization, performance
---

## 繰り返しルックアップ用のインデックス Map を構築

同じキーでの複数 `.find()` 呼び出しには Map を使用します。

**不適切（ルックアップごとに O(n)）:**

```typescript
function processOrders(orders: Order[], users: User[]) {
  return orders.map(order => ({
    ...order,
    user: users.find(u => u.id === order.userId)
  }))
}
```

**適切（ルックアップごとに O(1)）:**

```typescript
function processOrders(orders: Order[], users: User[]) {
  const userById = new Map(users.map(u => [u.id, u]))

  return orders.map(order => ({
    ...order,
    user: userById.get(order.userId)
  }))
}
```

Map を 1 回構築（O(n)）すれば、すべてのルックアップは O(1) です。
1000 注文 × 1000 ユーザー: 100万操作 → 2000 操作。
