---
title: Safe Area に contentInsetAdjustmentBehavior を使用
impact: MEDIUM
impactDescription: ネイティブ safe area 処理、レイアウトシフトなし
tags: safe-area, scrollview, layout
---

## Safe Area に contentInsetAdjustmentBehavior を使用

コンテンツを SafeAreaView や手動 padding でラップする代わりに、ルート ScrollView で `contentInsetAdjustmentBehavior="automatic"` を使用します。iOS が適切なスクロール挙動で safe area inset をネイティブに処理します。

**不適切（SafeAreaView ラッパー）:**

```tsx
import { SafeAreaView, ScrollView, View, Text } from 'react-native'

function MyScreen() {
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView>
        <View>
          <Text>Content</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
```

**不適切（手動 safe area padding）:**

```tsx
import { ScrollView, View, Text } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

function MyScreen() {
  const insets = useSafeAreaInsets()

  return (
    <ScrollView contentContainerStyle={{ paddingTop: insets.top }}>
      <View>
        <Text>Content</Text>
      </View>
    </ScrollView>
  )
}
```

**適切（ネイティブ content inset 調整）:**

```tsx
import { ScrollView, View, Text } from 'react-native'

function MyScreen() {
  return (
    <ScrollView contentInsetAdjustmentBehavior='automatic'>
      <View>
        <Text>Content</Text>
      </View>
    </ScrollView>
  )
}
```

ネイティブアプローチは動的 safe area（キーボード、ツールバー）を処理し、コンテンツがステータスバーの後ろに自然にスクロールできます。
