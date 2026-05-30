---
title: Reanimated Shared Value には .get() と .set() を使用（.value ではない）
impact: LOW
impactDescription: React Compiler 互換に必須
tags: reanimated, react-compiler, shared-values
---

## React Compiler では Shared Value に .get() と .set() を使用

React Compiler 有効時は、Reanimated shared value の `.value` の直接読み書きの代わりに `.get()` と `.set()` を使用します。コンパイラはプロパティアクセスを追跡できないため、明示的メソッドで正しい挙動を保証します。

**不適切（React Compiler で壊れる）:**

```tsx
import { useSharedValue } from 'react-native-reanimated'

function Counter() {
  const count = useSharedValue(0)

  const increment = () => {
    count.value = count.value + 1 // opts out of react compiler
  }

  return <Button onPress={increment} title={`Count: ${count.value}`} />
}
```

**適切（React Compiler 互換）:**

```tsx
import { useSharedValue } from 'react-native-reanimated'

function Counter() {
  const count = useSharedValue(0)

  const increment = () => {
    count.set(count.get() + 1)
  }

  return <Button onPress={increment} title={`Count: ${count.get()}`} />
}
```

詳細は
[Reanimated docs](https://docs.swmansion.com/react-native-reanimated/docs/core/useSharedValue/#react-compiler-support)
を参照してください。
