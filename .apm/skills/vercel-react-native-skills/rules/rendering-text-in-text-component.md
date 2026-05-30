---
title: 文字列を Text コンポーネントでラップ
impact: CRITICAL
impactDescription: ランタイムクラッシュを防ぐ
tags: rendering, text, core
---

## 文字列を Text コンポーネントでラップ

文字列は `<Text>` 内でレンダリングする必要があります。文字列が `<View>` の直接の子になると React Native はクラッシュします。

**不適切（クラッシュ）:**

```tsx
import { View } from 'react-native'

function Greeting({ name }: { name: string }) {
  return <View>Hello, {name}!</View>
}
// Error: Text strings must be rendered within a <Text> component.
```

**適切:**

```tsx
import { View, Text } from 'react-native'

function Greeting({ name }: { name: string }) {
  return (
    <View>
      <Text>Hello, {name}!</Text>
    </View>
  )
}
```
