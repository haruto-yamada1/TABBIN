---
title: レイアウトプロパティではなく transform と opacity をアニメーション
impact: HIGH
impactDescription: GPU アクセラレーション、レイアウト再計算なし
tags: animation, performance, reanimated, transform, opacity
---

## レイアウトプロパティではなく transform と opacity をアニメーション

`width`、`height`、`top`、`left`、`margin`、`padding` のアニメーションは避けてください。これらはフレームごとにレイアウト再計算をトリガーします。代わりに `transform`（scale、translate）と `opacity` を使い、レイアウトをトリガーせず GPU で実行します。

**不適切（height をアニメーション、毎フレームレイアウト）:**

```tsx
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated'

function CollapsiblePanel({ expanded }: { expanded: boolean }) {
  const animatedStyle = useAnimatedStyle(() => ({
    height: withTiming(expanded ? 200 : 0), // triggers layout on every frame
    overflow: 'hidden',
  }))

  return <Animated.View style={animatedStyle}>{children}</Animated.View>
}
```

**適切（scaleY をアニメーション、GPU アクセラレーション）:**

```tsx
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated'

function CollapsiblePanel({ expanded }: { expanded: boolean }) {
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scaleY: withTiming(expanded ? 1 : 0) },
    ],
    opacity: withTiming(expanded ? 1 : 0),
  }))

  return (
    <Animated.View style={[{ height: 200, transformOrigin: 'top' }, animatedStyle]}>
      {children}
    </Animated.View>
  )
}
```

**適切（スライドアニメーションに translateY）:**

```tsx
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated'

function SlideIn({ visible }: { visible: boolean }) {
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: withTiming(visible ? 0 : 100) },
    ],
    opacity: withTiming(visible ? 1 : 0),
  }))

  return <Animated.View style={animatedStyle}>{children}</Animated.View>
}
```

GPU アクセラレーション対象: `transform`（translate、scale、rotate）、`opacity`。それ以外はレイアウトをトリガーします。
