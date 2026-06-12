---
title: 非クリティカルなサードパーティライブラリを遅延読み込み
impact: MEDIUM
impactDescription: ハイドレーション後に読み込み
tags: bundle, third-party, analytics, defer
---

## 非クリティカルなサードパーティライブラリを遅延読み込み

アナリティクス、ログ、エラートラッキングはユーザー操作をブロックしません。ハイドレーション後に読み込みます。

**不適切（初期バンドルをブロック）:**

```tsx
import { Analytics } from '@vercel/analytics/react'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
```

**適切（ハイドレーション後に読み込み）:**

```tsx
import dynamic from 'next/dynamic'

const Analytics = dynamic(
  () => import('@vercel/analytics/react').then(m => m.Analytics),
  { ssr: false }
)

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
```
