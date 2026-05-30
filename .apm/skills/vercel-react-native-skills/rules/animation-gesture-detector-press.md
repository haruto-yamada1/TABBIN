---
title: アニメーション付き Press 状態に GestureDetector を使用
impact: MEDIUM
impactDescription: UI スレッドアニメーション、滑らかな press フィードバック
tags: animation, gestures, press, reanimated
---

## アニメーション付き Press 状態に GestureDetector を使用

アニメーション付き press 状態（scale、opacity）には、Pressable の `onPressIn`/`onPressOut` の代わりに `GestureDetector` と `Gesture.Tap()`、shared value を使用します。ジェスチャーコールバックは worklet として UI スレッドで実行され、press アニメーションの JS スレッド往復がありません。

**不適切（JS スレッドコールバック付き Pressable）:**

```tsx
import { Pressable } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated'

function AnimatedButton({ onPress }: { onPress: () => void }) {
  const scale = useSharedValue(1)

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }))

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => (scale.value = withTiming(0.95))}
      onPressOut={() => (scale.value = withTiming(1))}
    >
      <Animated.View style={animatedStyle}>
        <Text>Press me</Text>
      </Animated.View>
    </Pressable>
  )
}
```

**適切（UI スレッド worklet 付き GestureDetector）:**

```tsx
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  runOnJS,
} from 'react-native-reanimated'

function AnimatedButton({ onPress }: { onPress: () => void }) {
  // Store the press STATE (0 = not pressed, 1 = pressed)
  const pressed = useSharedValue(0)

  const tap = Gesture.Tap()
    .onBegin(() => {
      pressed.set(withTiming(1))
    })
    .onFinalize(() => {
      pressed.set(withTiming(0))
    })
    .onEnd(() => {
      runOnJS(onPress)()
    })

  // Derive visual values from the state
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(withTiming(pressed.get()), [0, 1], [1, 0.95]) },
    ],
  }))

  return (
    <GestureDetector gesture={tap}>
      <Animated.View style={animatedStyle}>
        <Text>Press me</Text>
      </Animated.View>
    </GestureDetector>
  )
}
```

press **state**（0 または 1）を保存し、`interpolate` で scale を派生させます。shared value を ground truth に保ちます。worklet から JS 関数を呼ぶには `runOnJS` を使用します。React Compiler 互換のため `.set()` と `.get()` を使用します。

参考:
[Gesture Handler Tap Gesture](https://docs.swmansion.com/react-native-gesture-handler/docs/gestures/tap-gesture)
