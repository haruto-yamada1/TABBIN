---
title: 複数の配列反復を結合
impact: LOW-MEDIUM
impactDescription: 反復回数を削減
tags: javascript, arrays, loops, performance
---

## 複数の配列反復を結合

複数の `.filter()` や `.map()` 呼び出しは配列を複数回反復します。1 つのループに結合します。

**不適切（3 回反復）:**

```typescript
const admins = users.filter(u => u.isAdmin)
const testers = users.filter(u => u.isTester)
const inactive = users.filter(u => !u.isActive)
```

**適切（1 回反復）:**

```typescript
const admins: User[] = []
const testers: User[] = []
const inactive: User[] = []

for (const user of users) {
  if (user.isAdmin) admins.push(user)
  if (user.isTester) testers.push(user)
  if (!user.isActive) inactive.push(user)
}
```
