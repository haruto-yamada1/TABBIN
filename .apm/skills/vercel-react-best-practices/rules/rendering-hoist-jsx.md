---
title: 静的 JSX 要素を巻き上げ
impact: LOW
impactDescription: 再作成を回避
tags: rendering, jsx, static, optimization
---

## 静的 JSX 要素を巻き上げ

再作成を避けるため、静的 JSX をコンポーネント外に抽出します。

**不適切（レンダーごとに要素を再作成）:**

```tsx
function LoadingSkeleton() {
  return <div className="animate-pulse h-20 bg-gray-200" />
}

function Container() {
  return (
    <div>
      {loading && <LoadingSkeleton />}
    </div>
  )
}
```

**適切（同じ要素を再利用）:**

```tsx
const loadingSkeleton = (
  <div className="animate-pulse h-20 bg-gray-200" />
)

function Container() {
  return (
    <div>
      {loading && loadingSkeleton}
    </div>
  )
}
```

大きく静的な SVG ノードでは特に有効で、毎レンダーでの再作成コストを削減できます。

**注:** プロジェクトで [React Compiler](https://react.dev/learn/react-compiler) が有効な場合、コンパイラが静的 JSX を自動巻き上げし再レンダーを最適化するため、手動巻き上げは不要です。
