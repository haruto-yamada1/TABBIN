---
title: ユーザー意図に基づくプリロード
impact: MEDIUM
impactDescription: 体感レイテンシの低減
tags: bundle, preload, user-intent, hover
---

## ユーザー意図に基づくプリロード

必要になる前に重いバンドルをプリロードし、体感レイテンシを低減します。

**例（ホバー/フォーカス時にプリロード）:**

```tsx
function EditorButton({ onClick }: { onClick: () => void }) {
  const preload = () => {
    if (typeof window !== 'undefined') {
      void import('./monaco-editor')
    }
  }

  return (
    <button
      onMouseEnter={preload}
      onFocus={preload}
      onClick={onClick}
    >
      Open Editor
    </button>
  )
}
```

**例（機能フラグ有効時にプリロード）:**

```tsx
function FlagsProvider({ children, flags }: Props) {
  useEffect(() => {
    if (flags.editorEnabled && typeof window !== 'undefined') {
      void import('./monaco-editor').then(mod => mod.init())
    }
  }, [flags.editorEnabled])

  return <FlagsContext.Provider value={flags}>
    {children}
  </FlagsContext.Provider>
}
```

`typeof window !== 'undefined'` チェックにより、プリロードモジュールが SSR 用にバンドルされるのを防ぎ、サーバーバンドルサイズとビルド速度を最適化します。
