---
title: initialState の代わりに fallback state を使用
impact: MEDIUM
impactDescription: 同期なしでリアクティブなフォールバック
tags: state, hooks, derived-state, props, initialState
---

## initialState の代わりに fallback state を使用

初期 state に `undefined` を使い、nullish coalescing（`??`）で親またはサーバー値にフォールバックします。state はユーザー意図のみを表し、`undefined` は「ユーザーがまだ選択していない」意味です。初期レンダーだけでなく、ソース変更時にも更新されるリアクティブなフォールバックが可能になります。

**不適切（state を同期し、リアクティビティを失う）:**

```tsx
type Props = { fallbackEnabled: boolean }

function Toggle({ fallbackEnabled }: Props) {
  const [enabled, setEnabled] = useState(defaultEnabled)
  // If fallbackEnabled changes, state is stale
  // State mixes user intent with default value

  return <Switch value={enabled} onValueChange={setEnabled} />
}
```

**適切（state はユーザー意図、リアクティブなフォールバック）:**

```tsx
type Props = { fallbackEnabled: boolean }

function Toggle({ fallbackEnabled }: Props) {
  const [_enabled, setEnabled] = useState<boolean | undefined>(undefined)
  const enabled = _enabled ?? defaultEnabled
  // undefined = user hasn't touched it, falls back to prop
  // If defaultEnabled changes, component reflects it
  // Once user interacts, their choice persists

  return <Switch value={enabled} onValueChange={setEnabled} />
}
```

**サーバーデータ付き:**

```tsx
function ProfileForm({ data }: { data: User }) {
  const [_theme, setTheme] = useState<string | undefined>(undefined)
  const theme = _theme ?? data.theme
  // Shows server value until user overrides
  // Server refetch updates the fallback automatically

  return <ThemePicker value={theme} onChange={setTheme} />
}
```
