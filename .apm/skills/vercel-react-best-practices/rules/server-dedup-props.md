---
title: RSC props の重複シリアライズを避ける
impact: LOW
impactDescription: 重複シリアライズを避けネットワークペイロードを削減
tags: server, rsc, serialization, props, client-components
---

## RSC props の重複シリアライズを避ける

**Impact: LOW（重複シリアライズを避けネットワークペイロードを削減）**

RSC→client のシリアライズは値ではなくオブジェクト参照で重複排除します。同じ参照 = 1 回だけシリアライズ、新しい参照 = 再シリアライズ。変換（`.toSorted()`、`.filter()`、`.map()`）はサーバーではなくクライアントで行います。

**不適切（配列を重複）:**

```tsx
// RSC: sends 6 strings (2 arrays × 3 items)
<ClientList usernames={usernames} usernamesOrdered={usernames.toSorted()} />
```

**適切（3 文字列だけ送信）:**

```tsx
// RSC: send once
<ClientList usernames={usernames} />

// Client: transform there
'use client'
const sorted = useMemo(() => [...usernames].sort(), [usernames])
```

**ネストした重複排除の挙動:**

重複排除は再帰的に機能します。データ型によって影響が異なります:

- `string[]`、`number[]`、`boolean[]`: **HIGH impact** - 配列 + すべてのプリミティブが完全に重複
- `object[]`: **LOW impact** - 配列は重複するが、ネストオブジェクトは参照で重複排除

```tsx
// string[] - duplicates everything
usernames={['a','b']} sorted={usernames.toSorted()} // sends 4 strings

// object[] - duplicates array structure only
users={[{id:1},{id:2}]} sorted={users.toSorted()} // sends 2 arrays + 2 unique objects (not 4)
```

**重複排除を壊す操作（新しい参照を作成）:**

- 配列: `.toSorted()`、`.filter()`、`.map()`、`.slice()`、`[...arr]`
- オブジェクト: `{...obj}`、`Object.assign()`、`structuredClone()`、`JSON.parse(JSON.stringify())`

**その他の例:**

```tsx
// ❌ Bad
<C users={users} active={users.filter(u => u.active)} />
<C product={product} productName={product.name} />

// ✅ Good
<C users={users} />
<C product={product} />
// Do filtering/destructuring in client
```

**例外:** 変換が高コスト、またはクライアントが元データを不要な場合は派生データを渡します。
