---
title: Intl フォーマッター作成を巻き上げ
impact: LOW-MEDIUM
impactDescription: 高コストなオブジェクト再作成を回避
tags: javascript, intl, optimization, memoization
---

## Intl フォーマッター作成を巻き上げ

レンダーやループ内で `Intl.DateTimeFormat`、`Intl.NumberFormat`、`Intl.RelativeTimeFormat` を作成しないでください。インスタンス化は高コストです。ロケール/オプションが静的ならモジュールスコープに巻き上げます。

**不適切（レンダーごとに新しいフォーマッター）:**

```tsx
function Price({ amount }: { amount: number }) {
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  })
  return <Text>{formatter.format(amount)}</Text>
}
```

**適切（モジュールスコープに巻き上げ）:**

```tsx
const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

function Price({ amount }: { amount: number }) {
  return <Text>{currencyFormatter.format(amount)}</Text>
}
```

**動的ロケールはメモ化:**

```tsx
const dateFormatter = useMemo(
  () => new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }),
  [locale]
)
```

**巻き上げる一般的なフォーマッター:**

```tsx
// Module-level formatters
const dateFormatter = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' })
const timeFormatter = new Intl.DateTimeFormat('en-US', { timeStyle: 'short' })
const percentFormatter = new Intl.NumberFormat('en-US', { style: 'percent' })
const relativeFormatter = new Intl.RelativeTimeFormat('en-US', {
  numeric: 'auto',
})
```

`Intl` オブジェクトの作成は `RegExp` やプレーンオブジェクトより大幅に高コストです。各インスタンス化でロケールデータを解析し内部ルックアップテーブルを構築します。
