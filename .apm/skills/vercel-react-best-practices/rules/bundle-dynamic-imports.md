---
title: 重いコンポーネントには動的インポート
impact: CRITICAL
impactDescription: TTI と LCP に直接影響
tags: bundle, dynamic-import, code-splitting, next-dynamic
---

## 重いコンポーネントには動的インポート

初期レンダリングに不要な大きなコンポーネントは `next/dynamic` で遅延読み込みします。

**不適切（Monaco がメインチャンクに ~300KB バンドル）:**

```tsx
import { MonacoEditor } from './monaco-editor'

function CodePanel({ code }: { code: string }) {
  return <MonacoEditor value={code} />
}
```

**適切（Monaco はオンデマンドで読み込み）:**

```tsx
import dynamic from 'next/dynamic'

const MonacoEditor = dynamic(
  () => import('./monaco-editor').then(m => m.MonacoEditor),
  { ssr: false }
)

function CodePanel({ code }: { code: string }) {
  return <MonacoEditor value={code} />
}
```
