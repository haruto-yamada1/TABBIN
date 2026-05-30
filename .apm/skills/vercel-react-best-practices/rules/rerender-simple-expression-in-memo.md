---
title: プリミティブ結果の単純式を useMemo でラップしない
impact: LOW-MEDIUM
impactDescription: 毎レンダーでの無駄な計算を回避
tags: rerender, useMemo, optimization
---

## プリミティブ結果の単純式を useMemo でラップしない

式が単純（論理/算術演算子が少数）でプリミティブ型（boolean、number、string）の結果の場合、`useMemo` でラップしないでください。`useMemo` の呼び出しと依存関係の比較が、式自体より多くのリソースを消費する可能性があります。

**不適切:**

```tsx
function Header({ user, notifications }: Props) {
  const isLoading = useMemo(() => {
    return user.isLoading || notifications.isLoading
  }, [user.isLoading, notifications.isLoading])

  if (isLoading) return <Skeleton />
  // return some markup
}
```

**適切:**

```tsx
function Header({ user, notifications }: Props) {
  const isLoading = user.isLoading || notifications.isLoading

  if (isLoading) return <Skeleton />
  // return some markup
}
```
