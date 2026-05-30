---
title: Touchable コンポーネントの代わりに Pressable を使用
impact: LOW
impactDescription: モダン API、より柔軟
tags: ui, pressable, touchable, gestures
---

## Touchable コンポーネントの代わりに Pressable を使用

`TouchableOpacity` や `TouchableHighlight` は使わないでください。代わりに `react-native` または `react-native-gesture-handler` の `Pressable` を使用します。

**不適切（レガシー Touchable コンポーネント）:**

```tsx
import { TouchableOpacity } from 'react-native'

function MyButton({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <Text>Press me</Text>
    </TouchableOpacity>
  )
}
```

**適切（Pressable）:**

```tsx
import { Pressable } from 'react-native'

function MyButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress}>
      <Text>Press me</Text>
    </Pressable>
  )
}
```

**適切（リスト向け gesture handler の Pressable）:**

```tsx
import { Pressable } from 'react-native-gesture-handler'

function ListItem({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress}>
      <Text>Item</Text>
    </Pressable>
  )
}
```

`react-native-gesture-handler` の ScrollView も使用している場合、より良いジェスチャー協調のためスクロール可能リスト内では `react-native-gesture-handler` の Pressable を使用します。

**アニメーション付き press state（scale、opacity 変更）:** Pressable の style コールバックの代わりに Reanimated shared value と `GestureDetector` を使用します。`animation-gesture-detector-press` ルールを参照してください。
