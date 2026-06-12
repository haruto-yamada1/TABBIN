---
title: Effect 依存関係を絞り込む
impact: LOW
impactDescription: effect の再実行を最小化
tags: rerender, useEffect, dependencies, optimization
---

## Effect 依存関係を絞り込む

オブジェクトではなくプリミティブな依存関係を指定し、effect の再実行を最小化します。

**不適切（user の任意フィールド変更で再実行）:**

```tsx
useEffect(() => {
  console.log(user.id)
}, [user])
```

**適切（id 変更時のみ再実行）:**

```tsx
useEffect(() => {
  console.log(user.id)
}, [user.id])
```

**派生 state は effect の外で計算:**

```tsx
// Incorrect: runs on width=767, 766, 765...
useEffect(() => {
  if (width < 768) {
    enableMobileMode()
  }
}, [width])

// Correct: runs only on boolean transition
const isMobile = width < 768
useEffect(() => {
  if (isMobile) {
    enableMobileMode()
  }
}, [isMobile])
```
