---
title: 遅延 state 初期化を使用
impact: MEDIUM
impactDescription: 毎レンダーでの無駄な計算を回避
tags: react, hooks, useState, performance, initialization
---

## 遅延 state 初期化を使用

高コストな初期値には `useState` に関数を渡します。関数形式を使わないと、値は 1 回しか使われないのに初期化子が毎レンダー実行されます。

**不適切（毎レンダー実行）:**

```tsx
function FilteredList({ items }: { items: Item[] }) {
  // buildSearchIndex() runs on EVERY render, even after initialization
  const [searchIndex, setSearchIndex] = useState(buildSearchIndex(items))
  const [query, setQuery] = useState('')
  
  // When query changes, buildSearchIndex runs again unnecessarily
  return <SearchResults index={searchIndex} query={query} />
}

function UserProfile() {
  // JSON.parse runs on every render
  const [settings, setSettings] = useState(
    JSON.parse(localStorage.getItem('settings') || '{}')
  )
  
  return <SettingsForm settings={settings} onChange={setSettings} />
}
```

**適切（1 回だけ実行）:**

```tsx
function FilteredList({ items }: { items: Item[] }) {
  // buildSearchIndex() runs ONLY on initial render
  const [searchIndex, setSearchIndex] = useState(() => buildSearchIndex(items))
  const [query, setQuery] = useState('')
  
  return <SearchResults index={searchIndex} query={query} />
}

function UserProfile() {
  // JSON.parse runs only on initial render
  const [settings, setSettings] = useState(() => {
    const stored = localStorage.getItem('settings')
    return stored ? JSON.parse(stored) : {}
  })
  
  return <SettingsForm settings={settings} onChange={setSettings} />
}
```

localStorage/sessionStorage から初期値を計算、データ構造（インデックス、マップ）の構築、DOM からの読み取り、重い変換を行う場合に遅延初期化を使用します。

単純なプリミティブ（`useState(0)`）、直接参照（`useState(props.value)`）、低コストなリテラル（`useState({})`）では関数形式は不要です。
