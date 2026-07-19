---
title: 非クリティカルなサードパーティライブラリを遅延読み込み
impact: MEDIUM
impactDescription: 初期描画後に読み込み
tags: bundle, third-party, analytics, defer
---

## 非クリティカルなサードパーティライブラリを遅延読み込み

アナリティクス、ログ、エラートラッキングはユーザー操作をブロックしません。初期描画後に読み込みます。

**不適切（初期バンドルをブロック）:**

```tsx
import { Analytics } from 'some-analytics-sdk'

export function App() {
  return (
    <>
      <MainUI />
      <Analytics />
    </>
  )
}
```

**適切（初期描画後に読み込み）:**

```tsx
import { lazy, Suspense } from 'react'

const Analytics = lazy(() =>
  import('some-analytics-sdk').then(m => ({ default: m.Analytics }))
)

export function App() {
  return (
    <>
      <MainUI />
      <Suspense fallback={null}>
        <Analytics />
      </Suspense>
    </>
  )
}
```
