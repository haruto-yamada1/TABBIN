---
title: 関数から早期 return
impact: LOW-MEDIUM
impactDescription: 不要な計算を回避
tags: javascript, functions, optimization, early-return
---

## 関数から早期 return

結果が確定した時点で早期 return し、不要な処理をスキップします。

**不適切（答えが見つかってもすべてのアイテムを処理）:**

```typescript
function validateUsers(users: User[]) {
  let hasError = false
  let errorMessage = ''
  
  for (const user of users) {
    if (!user.email) {
      hasError = true
      errorMessage = 'Email required'
    }
    if (!user.name) {
      hasError = true
      errorMessage = 'Name required'
    }
    // Continues checking all users even after error found
  }
  
  return hasError ? { valid: false, error: errorMessage } : { valid: true }
}
```

**適切（最初のエラーで即 return）:**

```typescript
function validateUsers(users: User[]) {
  for (const user of users) {
    if (!user.email) {
      return { valid: false, error: 'Email required' }
    }
    if (!user.name) {
      return { valid: false, error: 'Name required' }
    }
  }

  return { valid: true }
}
```
