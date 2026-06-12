---
title: 明示的な条件付きレンダリングを使用
impact: LOW
impactDescription: 0 や NaN のレンダリングを防ぐ
tags: rendering, conditional, jsx, falsy-values
---

## 明示的な条件付きレンダリングを使用

条件が `0`、`NaN`、またはレンダリングされるその他の falsy 値になり得る場合、条件付きレンダリングには `&&` ではなく明示的な三項演算子（`? :`）を使用します。

**不適切（count が 0 のとき "0" をレンダリング）:**

```tsx
function Badge({ count }: { count: number }) {
  return (
    <div>
      {count && <span className="badge">{count}</span>}
    </div>
  )
}

// When count = 0, renders: <div>0</div>
// When count = 5, renders: <div><span class="badge">5</span></div>
```

**適切（count が 0 のとき何もレンダリングしない）:**

```tsx
function Badge({ count }: { count: number }) {
  return (
    <div>
      {count > 0 ? <span className="badge">{count}</span> : null}
    </div>
  )
}

// When count = 0, renders: <div></div>
// When count = 5, renders: <div><span class="badge">5</span></div>
```
