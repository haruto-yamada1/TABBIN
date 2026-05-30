---
title: state は ground truth を表す必要がある
impact: HIGH
impactDescription: ロジックの明確化、デバッグ容易、単一の source of truth
tags: state, derived-state, reanimated, hooks
---

## state は ground truth を表す必要がある

React `useState` と Reanimated shared value の両方で、state 変数は視覚的な派生値（`scale`、`opacity`、`translateY` など）ではなく、何かの実際の状態（`pressed`、`progress`、`isOpen` など）を表すべきです。計算や補間で state から視覚値を派生させます。

**不適切（視覚出力を保存）:**

```tsx
const scale = useSharedValue(1)

const tap = Gesture.Tap()
  .onBegin(() => {
    scale.set(withTiming(0.95))
  })
  .onFinalize(() => {
    scale.set(withTiming(1))
  })

const animatedStyle = useAnimatedStyle(() => ({
  transform: [{ scale: scale.get() }],
}))
```

**適切（state を保存し、視覚を派生）:**

```tsx
const pressed = useSharedValue(0) // 0 = not pressed, 1 = pressed

const tap = Gesture.Tap()
  .onBegin(() => {
    pressed.set(withTiming(1))
  })
  .onFinalize(() => {
    pressed.set(withTiming(0))
  })

const animatedStyle = useAnimatedStyle(() => ({
  transform: [{ scale: interpolate(pressed.get(), [0, 1], [1, 0.95]) }],
}))
```

**重要な理由:**

state 変数は必ずしも最終結果ではなく、実際の「状態」を表すべきです。

1. **単一の source of truth** — state（`pressed`）が何が起きているかを記述し、視覚は派生
2. **拡張しやすい** — 同じ state から opacity や rotation などを補間で追加可能
3. **デバッグ** — `pressed = 1` の方が `scale = 0.95` より明確
4. **再利用可能なロジック** — 同じ `pressed` 値が複数の視覚プロパティを駆動

**React state でも同じ原則:**

```tsx
// Incorrect: storing derived values
const [isExpanded, setIsExpanded] = useState(false)
const [height, setHeight] = useState(0)

useEffect(() => {
  setHeight(isExpanded ? 200 : 0)
}, [isExpanded])

// Correct: derive from state
const [isExpanded, setIsExpanded] = useState(false)
const height = isExpanded ? 200 : 0
```

state は最小限の真実。それ以外はすべて派生です。
