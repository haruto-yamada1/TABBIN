---
title: メモ化コンポーネントの非プリミティブデフォルト値を定数に抽出
impact: MEDIUM
impactDescription: デフォルト値を定数化してメモ化を復元
tags: rerender, memo, optimization
---

## メモ化コンポーネントの非プリミティブデフォルト値を定数に抽出

メモ化コンポーネントの非プリミティブなオプションパラメータ（配列、関数、オブジェクトなど）にデフォルト値がある場合、そのパラメータなしで呼び出すとメモ化が壊れます。再レンダーごとに新しい値インスタンスが作られ、`memo()` の厳密等価比較に通らないためです。

この問題はデフォルト値を定数に抽出して解決します。

**不適切（`onClick` が再レンダーごとに異なる値）:**

```tsx
const UserAvatar = memo(function UserAvatar({ onClick = () => {} }: { onClick?: () => void }) {
  // ...
})

// Used without optional onClick
<UserAvatar />
```

**適切（安定したデフォルト値）:**

```tsx
const NOOP = () => {};

const UserAvatar = memo(function UserAvatar({ onClick = NOOP }: { onClick?: () => void }) {
  // ...
})

// Used without optional onClick
<UserAvatar />
```
