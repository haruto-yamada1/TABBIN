---
title: マウントごとではなくアプリを 1 回初期化
impact: LOW-MEDIUM
impactDescription: 開発環境での重複 init を回避
tags: initialization, useEffect, app-startup, side-effects
---

## マウントごとではなくアプリを 1 回初期化

アプリ読み込みごとに 1 回実行すべきアプリ全体の初期化を、コンポーネントの `useEffect([])` 内に置かないでください。コンポーネントは再マウントでき、effect が再実行されます。モジュールレベルのガードまたはエントリモジュールのトップレベル init を使用してください。

**不適切（dev で 2 回実行、再マウントで再実行）:**

```tsx
function Comp() {
  useEffect(() => {
    loadFromStorage()
    checkAuthToken()
  }, [])

  // ...
}
```

**適切（アプリ読み込みごとに 1 回）:**

```tsx
let didInit = false

function Comp() {
  useEffect(() => {
    if (didInit) return
    didInit = true
    loadFromStorage()
    checkAuthToken()
  }, [])

  // ...
}
```

参考: [Initializing the application](https://react.dev/learn/you-might-not-need-an-effect#initializing-the-application)
