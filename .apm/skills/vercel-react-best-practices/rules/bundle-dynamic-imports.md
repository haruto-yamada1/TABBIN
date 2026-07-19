---
title: 重いコンポーネントには動的インポート
impact: CRITICAL
impactDescription: TTI と LCP に直接影響
tags: bundle, dynamic-import, code-splitting, react-lazy
---

## 重いコンポーネントには動的インポート

初期レンダリングに不要な大きなコンポーネントは `React.lazy` と `Suspense` で遅延読み込みします。

**不適切（Monaco がメインチャンクに ~300KB バンドル）:**

```tsx
import { MonacoEditor } from './monaco-editor'

function CodePanel({ code }: { code: string }) {
  return <MonacoEditor value={code} />
}
```

**適切（Monaco はオンデマンドで読み込み）:**

```tsx
import { lazy, Suspense } from 'react'

const MonacoEditor = lazy(() =>
  import('./monaco-editor').then(m => ({ default: m.MonacoEditor }))
)

function CodePanel({ code }: { code: string }) {
  return (
    <Suspense fallback={<EditorSkeleton />}>
      <MonacoEditor value={code} />
    </Suspense>
  )
}
```
