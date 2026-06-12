---
title: localStorage データのバージョン管理と最小化
impact: MEDIUM
impactDescription: スキーマ競合を防ぎストレージサイズを削減
tags: client, localStorage, storage, versioning, data-minimization
---

## localStorage データのバージョン管理と最小化

キーにバージョンプレフィックスを付け、必要なフィールドだけを保存します。スキーマ競合と機密データの誤保存を防ぎます。

**不適切:**

```typescript
// No version, stores everything, no error handling
localStorage.setItem('userConfig', JSON.stringify(fullUserObject))
const data = localStorage.getItem('userConfig')
```

**適切:**

```typescript
const VERSION = 'v2'

function saveConfig(config: { theme: string; language: string }) {
  try {
    localStorage.setItem(`userConfig:${VERSION}`, JSON.stringify(config))
  } catch {
    // Throws in incognito/private browsing, quota exceeded, or disabled
  }
}

function loadConfig() {
  try {
    const data = localStorage.getItem(`userConfig:${VERSION}`)
    return data ? JSON.parse(data) : null
  } catch {
    return null
  }
}

// Migration from v1 to v2
function migrate() {
  try {
    const v1 = localStorage.getItem('userConfig:v1')
    if (v1) {
      const old = JSON.parse(v1)
      saveConfig({ theme: old.darkMode ? 'dark' : 'light', language: old.lang })
      localStorage.removeItem('userConfig:v1')
    }
  } catch {}
}
```

**サーバーレスポンスから最小フィールドを保存:**

```typescript
// User object has 20+ fields, only store what UI needs
function cachePrefs(user: FullUser) {
  try {
    localStorage.setItem('prefs:v1', JSON.stringify({
      theme: user.preferences.theme,
      notifications: user.preferences.notifications
    }))
  } catch {}
}
```

**常に try-catch でラップ:** シークレット/プライベートブラウジング（Safari、Firefox）、クォータ超過、無効化時に `getItem()` と `setItem()` は例外を投げます。

**メリット:** バージョン管理によるスキーマ進化、ストレージサイズ削減、トークン/PII/内部フラグの保存防止。
