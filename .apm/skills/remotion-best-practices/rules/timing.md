---
name: timing
description: Remotion の補間カーブ — linear、easing、spring
metadata:
  tags: spring, bounce, easing, interpolation
---

単純な線形補間には `interpolate` を使います。

```ts title="100 フレームで 0 から 1 へ"
import { interpolate } from "remotion";

const opacity = interpolate(frame, [0, 100], [0, 1]);
```

既定では値は clamp されず、[0, 1] の範囲外にもなり得ます。  
clamp する例:

```ts title="extrapolation 付きで 100 フレームで 0 から 1 へ"
const opacity = interpolate(frame, [0, 100], [0, 1], {
  extrapolateRight: "clamp",
  extrapolateLeft: "clamp",
});
```

## Spring アニメーション

Spring アニメーションはより自然な動きです。  
時間とともに 0 から 1 へ進みます。

```ts title="100 フレームで 0 から 1 への spring"
import { spring, useCurrentFrame, useVideoConfig } from "remotion";

const frame = useCurrentFrame();
const { fps } = useVideoConfig();

const scale = spring({
  frame,
  fps,
});
```

### 物理プロパティ

既定設定は `mass: 1, damping: 10, stiffness: 100` です。  
落ち着く前に少し bounce する動きになります。

設定は次のように上書きできます:

```ts
const scale = spring({
  frame,
  fps,
  config: { damping: 200 },
});
```

bounce のない自然な動きの推奨設定は `{ damping: 200 }` です。

よく使う設定:

```tsx
const smooth = { damping: 200 }; // 滑らか、bounce なし（控えめな reveal）
const snappy = { damping: 20, stiffness: 200 }; // キビキビ、最小 bounce（UI 要素）
const bouncy = { damping: 8 }; // bounce あり entrance（遊び心のあるアニメ）
const heavy = { damping: 15, stiffness: 80, mass: 2 }; // 重く遅く、小さな bounce
```

### 遅延

既定ではアニメーションは即座に開始します。  
`delay` でフレーム数だけ遅延できます。

```tsx
const entrance = spring({
  frame: frame - ENTRANCE_DELAY,
  fps,
  delay: 20,
});
```

### duration

`spring()` の自然な duration は物理プロパティで決まります。  
特定 duration に伸ばすには `durationInFrames` を使います。

```tsx
const spring = spring({
  frame,
  fps,
  durationInFrames: 40,
});
```

### `spring()` と `interpolate()` の組み合わせ

spring 出力（0-1）を任意範囲へ map:

```tsx
const springProgress = spring({
  frame,
  fps,
});

// 回転へ map
const rotation = interpolate(springProgress, [0, 1], [0, 360]);

<div style={{ rotate: rotation + "deg" }} />;
```

### spring の加算

Spring は数値を返すので演算できます:

```tsx
const frame = useCurrentFrame();
const { fps, durationInFrames } = useVideoConfig();

const inAnimation = spring({
  frame,
  fps,
});
const outAnimation = spring({
  frame,
  fps,
  durationInFrames: 1 * fps,
  delay: durationInFrames - 1 * fps,
});

const scale = inAnimation - outAnimation;
```

## イージング

`interpolate` に easing を追加できます:

```ts
import { interpolate, Easing } from "remotion";

const value1 = interpolate(frame, [0, 100], [0, 1], {
  easing: Easing.inOut(Easing.quad),
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
});
```

既定 easing は `Easing.linear` です。  
他の convexity:

- `Easing.in` — ゆっくり始まり加速
- `Easing.out` — 速く始まり減速
- `Easing.inOut`

curve（直線に近い順）:

- `Easing.quad`
- `Easing.sin`
- `Easing.exp`
- `Easing.circle`

convexity と curve は組み合わせて easing 関数にします:

```ts
const value1 = interpolate(frame, [0, 100], [0, 1], {
  easing: Easing.inOut(Easing.quad),
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
});
```

cubic bezier もサポート:

```ts
const value1 = interpolate(frame, [0, 100], [0, 1], {
  easing: Easing.bezier(0.8, 0.22, 0.96, 0.65),
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
});
```
