---
title: falsy になり得る値で && を使わない
impact: CRITICAL
impactDescription: 本番クラッシュを防ぐ
tags: rendering, conditional, jsx, crash
---

## falsy になり得る値で && を使わない

`value` が空文字列や `0` になり得る場合、`{value && <Component />}` は使わないでください。これらは falsy ですが JSX でレンダリング可能です。React Native は `<Text>` 外でテキストとしてレンダリングしようとし、本番でハードクラッシュします。

**不適切（count が 0 または name が "" のときクラッシュ）:**

```tsx
function Profile({ name, count }: { name: string; count: number }) {
  return (
    <View>
      {name && <Text>{name}</Text>}
      {count && <Text>{count} items</Text>}
    </View>
  )
}
// If name="" or count=0, renders the falsy value → crash
```

**適切（null 付き三項演算子）:**

```tsx
function Profile({ name, count }: { name: string; count: number }) {
  return (
    <View>
      {name ? <Text>{name}</Text> : null}
      {count ? <Text>{count} items</Text> : null}
    </View>
  )
}
```

**適切（明示的 boolean 変換）:**

```tsx
function Profile({ name, count }: { name: string; count: number }) {
  return (
    <View>
      {!!name && <Text>{name}</Text>}
      {!!count && <Text>{count} items</Text>}
    </View>
  )
}
```

**最良（早期 return）:**

```tsx
function Profile({ name, count }: { name: string; count: number }) {
  if (!name) return null

  return (
    <View>
      <Text>{name}</Text>
      {count > 0 ? <Text>{count} items</Text> : null}
    </View>
  )
}
```

早期 return が最も明確です。インライン条件を使う場合は三項演算子または明示的 boolean チェックを優先してください。

**Lint ルール:** [eslint-plugin-react](https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/jsx-no-leaked-render.md) の `react/jsx-no-leaked-render` を有効にして自動検出してください。
