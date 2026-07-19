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

`React.lazy` は別チャンク化するだけで初期描画と並行して読み込み始まるため、初期描画「後」に読み込みたい場合は mount 後に lazy component を取り付けます。

```tsx
import { lazy, Suspense, useEffect, useState } from 'react'

const Analytics = lazy(() =>
  import('some-analytics-sdk').then(m => ({ default: m.Analytics }))
)

export function App() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    // 初期描画後に lazy chunk の読み込みを開始
    setMounted(true)
  }, [])
  return (
    <>
      <MainUI />
      {mounted && (
        <Suspense fallback={null}>
          <Analytics />
        </Suspense>
      )}
    </>
  )
}
```

即時ではなく idle 時に読み込みたい場合は `requestIdleCallback` で `setMounted` を遅らせます。
