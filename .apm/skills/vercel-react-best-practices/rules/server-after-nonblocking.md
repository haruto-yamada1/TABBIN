---
title: ノンブロッキング操作には after() を使用
impact: MEDIUM
impactDescription: レスポンス時間の短縮
tags: server, async, logging, analytics, side-effects
---

## ノンブロッキング操作には after() を使用

Next.js の `after()` を使い、レスポンス送信後に実行すべき処理をスケジュールします。ログ、アナリティクス、その他の副作用がレスポンスをブロックするのを防ぎます。

**不適切（レスポンスをブロック）:**

```tsx
import { logUserAction } from '@/app/utils'

export async function POST(request: Request) {
  // Perform mutation
  await updateDatabase(request)
  
  // Logging blocks the response
  const userAgent = request.headers.get('user-agent') || 'unknown'
  await logUserAction({ userAgent })
  
  return new Response(JSON.stringify({ status: 'success' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}
```

**適切（ノンブロッキング）:**

```tsx
import { after } from 'next/server'
import { headers, cookies } from 'next/headers'
import { logUserAction } from '@/app/utils'

export async function POST(request: Request) {
  // Perform mutation
  await updateDatabase(request)
  
  // Log after response is sent
  after(async () => {
    const userAgent = (await headers()).get('user-agent') || 'unknown'
    const sessionCookie = (await cookies()).get('session-id')?.value || 'anonymous'
    
    logUserAction({ sessionCookie, userAgent })
  })
  
  return new Response(JSON.stringify({ status: 'success' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}
```

レスポンスは即座に送信され、ログはバックグラウンドで実行されます。

**一般的なユースケース:**

- アナリティクストラッキング
- 監査ログ
- 通知送信
- キャッシュ無効化
- クリーンアップタスク

**重要な注意点:**

- レスポンスが失敗またはリダイレクトしても `after()` は実行されます
- Server Actions、Route Handlers、Server Components で動作します

参考: [https://nextjs.org/docs/app/api-reference/functions/after](https://nextjs.org/docs/app/api-reference/functions/after)
