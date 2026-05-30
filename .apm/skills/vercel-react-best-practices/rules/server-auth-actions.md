---
title: API ルートと同様に Server Actions を認証
impact: CRITICAL
impactDescription: サーバー mutation への不正アクセスを防ぐ
tags: server, server-actions, authentication, security, authorization
---

## API ルートと同様に Server Actions を認証

**Impact: CRITICAL（サーバー mutation への不正アクセスを防ぐ）**

Server Actions（`"use server"` 付き関数）は API ルートと同様に公開エンドポイントとして露出します。各 Server Action **内部**で必ず認証と認可を検証してください。Server Actions は直接呼び出せるため、middleware、layout ガード、ページレベルのチェックだけに頼ってはいけません。

Next.js ドキュメントには次のように明記されています: 「Server Actions は公開 API エンドポイントと同じセキュリティ考慮事項で扱い、ユーザーが mutation を実行する権限があるか検証してください。」

**不適切（認証チェックなし）:**

```typescript
'use server'

export async function deleteUser(userId: string) {
  // Anyone can call this! No auth check
  await db.user.delete({ where: { id: userId } })
  return { success: true }
}
```

**適切（アクション内部で認証）:**

```typescript
'use server'

import { verifySession } from '@/lib/auth'
import { unauthorized } from '@/lib/errors'

export async function deleteUser(userId: string) {
  // Always check auth inside the action
  const session = await verifySession()
  
  if (!session) {
    throw unauthorized('Must be logged in')
  }
  
  // Check authorization too
  if (session.user.role !== 'admin' && session.user.id !== userId) {
    throw unauthorized('Cannot delete other users')
  }
  
  await db.user.delete({ where: { id: userId } })
  return { success: true }
}
```

**入力検証付き:**

```typescript
'use server'

import { verifySession } from '@/lib/auth'
import { z } from 'zod'

const updateProfileSchema = z.object({
  userId: z.string().uuid(),
  name: z.string().min(1).max(100),
  email: z.string().email()
})

export async function updateProfile(data: unknown) {
  // Validate input first
  const validated = updateProfileSchema.parse(data)
  
  // Then authenticate
  const session = await verifySession()
  if (!session) {
    throw new Error('Unauthorized')
  }
  
  // Then authorize
  if (session.user.id !== validated.userId) {
    throw new Error('Can only update own profile')
  }
  
  // Finally perform the mutation
  await db.user.update({
    where: { id: validated.userId },
    data: {
      name: validated.name,
      email: validated.email
    }
  })
  
  return { success: true }
}
```

参考: [https://nextjs.org/docs/app/guides/authentication](https://nextjs.org/docs/app/guides/authentication)
