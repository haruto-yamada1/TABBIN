---
title: RegExp 作成を巻き上げ
impact: LOW-MEDIUM
impactDescription: 再作成を回避
tags: javascript, regexp, optimization, memoization
---

## RegExp 作成を巻き上げ

レンダー内で RegExp を作成しないでください。モジュールスコープに巻き上げるか `useMemo()` でメモ化します。

**不適切（レンダーごとに新しい RegExp）:**

```tsx
function Highlighter({ text, query }: Props) {
  const regex = new RegExp(`(${query})`, 'gi')
  const parts = text.split(regex)
  return <>{parts.map((part, i) => ...)}</>
}
```

**適切（メモ化または巻き上げ）:**

```tsx
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function Highlighter({ text, query }: Props) {
  const regex = useMemo(
    () => new RegExp(`(${escapeRegex(query)})`, 'gi'),
    [query]
  )
  const parts = text.split(regex)
  return <>{parts.map((part, i) => ...)}</>
}
```

**警告（グローバル regex は可変 state を持つ）:**

グローバル regex（`/g`）は可変の `lastIndex` state を持ちます:

```typescript
const regex = /foo/g
regex.test('foo')  // true, lastIndex = 3
regex.test('foo')  // false, lastIndex = 0
```
