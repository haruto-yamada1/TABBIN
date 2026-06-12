---
title: フリッカーなしでハイドレーション不一致を防ぐ
impact: MEDIUM
impactDescription: 視覚的フリッカーとハイドレーションエラーを回避
tags: rendering, ssr, hydration, localStorage, flicker
---

## フリッカーなしでハイドレーション不一致を防ぐ

クライアント側ストレージ（localStorage、cookies）に依存するコンテンツをレンダリングする場合、React がハイドレートする前に DOM を更新する同期スクリプトを注入し、SSR 破損とハイドレーション後のフリッカーの両方を防ぎます。

**不適切（SSR を破壊）:**

```tsx
function ThemeWrapper({ children }: { children: ReactNode }) {
  // localStorage is not available on server - throws error
  const theme = localStorage.getItem('theme') || 'light'
  
  return (
    <div className={theme}>
      {children}
    </div>
  )
}
```

サーバー側レンダリングは `localStorage` が undefined のため失敗します。

**不適切（視覚的フリッカー）:**

```tsx
function ThemeWrapper({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState('light')
  
  useEffect(() => {
    // Runs after hydration - causes visible flash
    const stored = localStorage.getItem('theme')
    if (stored) {
      setTheme(stored)
    }
  }, [])
  
  return (
    <div className={theme}>
      {children}
    </div>
  )
}
```

コンポーネントはまずデフォルト値（`light`）でレンダーし、ハイドレーション後に更新されるため、不正なコンテンツの一瞬のフラッシュが発生します。

**適切（フリッカーなし、ハイドレーション不一致なし）:**

```tsx
function ThemeWrapper({ children }: { children: ReactNode }) {
  return (
    <>
      <div id="theme-wrapper">
        {children}
      </div>
      <script
        dangerouslySetInnerHTML={{
          __html: `
            (function() {
              try {
                var theme = localStorage.getItem('theme') || 'light';
                var el = document.getElementById('theme-wrapper');
                if (el) el.className = theme;
              } catch (e) {}
            })();
          `,
        }}
      />
    </>
  )
}
```

インラインスクリプトは要素表示前に同期的に実行され、DOM に正しい値が既にあることを保証します。フリッカーなし、ハイドレーション不一致なし。

このパターンはテーマ切り替え、ユーザー設定、認証状態、デフォルト値のフラッシュなしですぐにレンダリングすべきクライアント専用データに特に有用です。
