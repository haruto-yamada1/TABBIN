---
title: ループ内のプロパティアクセスをキャッシュ
impact: LOW-MEDIUM
impactDescription: ルックアップ回数を削減
tags: javascript, loops, optimization, caching
---

## ループ内のプロパティアクセスをキャッシュ

ホットパスではオブジェクトプロパティのルックアップをキャッシュします。

**不適切（N 回の反復 × 3 ルックアップ）:**

```typescript
for (let i = 0; i < arr.length; i++) {
  process(obj.config.settings.value)
}
```

**適切（合計 1 ルックアップ）:**

```typescript
const value = obj.config.settings.value
const len = arr.length
for (let i = 0; i < len; i++) {
  process(value)
}
```
