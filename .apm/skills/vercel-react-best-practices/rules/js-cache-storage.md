---
title: Storage API 呼び出しをキャッシュ
impact: LOW-MEDIUM
impactDescription: 高コスト I/O を削減
tags: javascript, localStorage, storage, caching, performance
---

## Storage API 呼び出しをキャッシュ

`localStorage`、`sessionStorage`、`document.cookie` は同期的で高コストです。読み取りはメモリにキャッシュします。

**不適切（呼び出しごとに storage を読み取り）:**

```typescript
function getTheme() {
  return localStorage.getItem('theme') ?? 'light'
}
// Called 10 times = 10 storage reads
```

**適切（Map キャッシュ）:**

```typescript
const storageCache = new Map<string, string | null>()

function getLocalStorage(key: string) {
  if (!storageCache.has(key)) {
    storageCache.set(key, localStorage.getItem(key))
  }
  return storageCache.get(key)
}

function setLocalStorage(key: string, value: string) {
  localStorage.setItem(key, value)
  storageCache.set(key, value)  // keep cache in sync
}
```

フックではなく Map を使うことで、React コンポーネントだけでなくユーティリティやイベントハンドラーなどどこでも動作します。

**Cookie キャッシュ:**

```typescript
let cookieCache: Record<string, string> | null = null

function getCookie(name: string) {
  if (!cookieCache) {
    cookieCache = Object.fromEntries(
      document.cookie.split('; ').map(c => c.split('='))
    )
  }
  return cookieCache[name]
}
```

**重要（外部変更時は無効化）:**

storage が外部から変更され得る場合（別タブ、サーバー設定 cookie）、キャッシュを無効化します:

```typescript
window.addEventListener('storage', (e) => {
  if (e.key) storageCache.delete(e.key)
})

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    storageCache.clear()
  }
})
```
