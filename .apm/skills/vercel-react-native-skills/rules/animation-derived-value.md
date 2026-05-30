---
title: useAnimatedReaction より useDerivedValue を優先
impact: MEDIUM
impactDescription: コードの明確化、自動依存関係追跡
tags: animation, reanimated, derived-value
---

## useAnimatedReaction より useDerivedValue を優先

shared value を別の値から派生させる場合、`useAnimatedReaction` ではなく `useDerivedValue` を使用します。派生値は宣言的で依存関係を自動追跡し、直接使用できる値を返します。Animated reaction は副作用用であり、派生用ではありません。

**不適切（派生に useAnimatedReaction）:**

```tsx
import { useSharedValue, useAnimatedReaction } from 'react-native-reanimated'

function MyComponent() {
  const progress = useSharedValue(0)
  const opacity = useSharedValue(1)

  useAnimatedReaction(
    () => progress.value,
    (current) => {
      opacity.value = 1 - current
    }
  )

  // ...
}
```

**適切（useDerivedValue）:**

```tsx
import { useSharedValue, useDerivedValue } from 'react-native-reanimated'

function MyComponent() {
  const progress = useSharedValue(0)

  const opacity = useDerivedValue(() => 1 - progress.get())

  // ...
}
```

値を生成しない副作用（ハプティクス、ログ、`runOnJS` の呼び出し）にのみ `useAnimatedReaction` を使用します。

参考:
[Reanimated useDerivedValue](https://docs.swmansion.com/react-native-reanimated/docs/core/useDerivedValue)
