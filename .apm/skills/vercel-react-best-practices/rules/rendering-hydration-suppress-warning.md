---
title: 想定内のハイドレーション不一致を抑制
impact: LOW-MEDIUM
impactDescription: 既知の差異によるノイズの多い警告を回避
tags: rendering, hydration, ssr, nextjs
---

## 想定内のハイドレーション不一致を抑制

SSR フレームワーク（例: Next.js）では、サーバーとクライアントで意図的に異なる値があります（ランダム ID、日付、ロケール/タイムゾーン書式）。これら *想定内* の不一致については、動的テキストを `suppressHydrationWarning` 付き要素でラップし、ノイズの多い警告を防ぎます。本物のバグを隠すために使わないでください。乱用も避けてください。

**不適切（既知の不一致警告）:**

```tsx
function Timestamp() {
  return <span>{new Date().toLocaleString()}</span>
}
```

**適切（想定内の不一致のみ抑制）:**

```tsx
function Timestamp() {
  return (
    <span suppressHydrationWarning>
      {new Date().toLocaleString()}
    </span>
  )
}
```
