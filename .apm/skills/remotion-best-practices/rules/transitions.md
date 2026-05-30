---
name: transitions
description: TransitionSeries によるシーン遷移とオーバーレイ
metadata:
  tags: transitions, overlays, fade, slide, wipe, scenes
---

## TransitionSeries

`<TransitionSeries>` はシーンを並べ、カット点を強化する 2 つの方法をサポートします:

- **Transitions** (`<TransitionSeries.Transition>`) — 2 シーン間の crossfade、slide、wipe など。transition 中は両シーンが同時再生されるため timeline が短くなります。
- **Overlays** (`<TransitionSeries.Overlay>`) — ライトリークなどの effect をカット点上に重ね、timeline を短くしません。

子要素は absolute positioning されます。

## 前提条件

```bash
npx remotion add @remotion/transitions
```

## Transition の例

```tsx
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";

<TransitionSeries>
  <TransitionSeries.Sequence durationInFrames={60}>
    <SceneA />
  </TransitionSeries.Sequence>
  <TransitionSeries.Transition
    presentation={fade()}
    timing={linearTiming({ durationInFrames: 15 })}
  />
  <TransitionSeries.Sequence durationInFrames={60}>
    <SceneB />
  </TransitionSeries.Sequence>
</TransitionSeries>;
```

## Overlay の例

任意の React コンポーネントを overlay にできます。既製 effect には **light-leaks** rule を参照。

```tsx
import { TransitionSeries } from "@remotion/transitions";
import { LightLeak } from "@remotion/light-leaks";

<TransitionSeries>
  <TransitionSeries.Sequence durationInFrames={60}>
    <SceneA />
  </TransitionSeries.Sequence>
  <TransitionSeries.Overlay durationInFrames={20}>
    <LightLeak />
  </TransitionSeries.Overlay>
  <TransitionSeries.Sequence durationInFrames={60}>
    <SceneB />
  </TransitionSeries.Sequence>
</TransitionSeries>;
```

## Transition と Overlay の併用

同一 `<TransitionSeries>` 内で transition と overlay を共存できますが、overlay は transition や別 overlay に隣接できません。

```tsx
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { LightLeak } from "@remotion/light-leaks";

<TransitionSeries>
  <TransitionSeries.Sequence durationInFrames={60}>
    <SceneA />
  </TransitionSeries.Sequence>
  <TransitionSeries.Overlay durationInFrames={30}>
    <LightLeak />
  </TransitionSeries.Overlay>
  <TransitionSeries.Sequence durationInFrames={60}>
    <SceneB />
  </TransitionSeries.Sequence>
  <TransitionSeries.Transition
    presentation={fade()}
    timing={linearTiming({ durationInFrames: 15 })}
  />
  <TransitionSeries.Sequence durationInFrames={60}>
    <SceneC />
  </TransitionSeries.Sequence>
</TransitionSeries>;
```

## Transition props

`<TransitionSeries.Transition>` には次が必要:

- `presentation` — 視覚 effect（例: `fade()`、`slide()`、`wipe()`）
- `timing` — 速度と easing（例: `linearTiming()`、`springTiming()`）

## Overlay props

`<TransitionSeries.Overlay>` は次を受け取ります:

- `durationInFrames` — overlay 表示時間（正の整数）
- `offset?` — カット点中心からのずれ。正 = 遅く、負 = 早く。既定: `0`

## 利用可能な transition 型

各 module から import:

```tsx
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { flip } from "@remotion/transitions/flip";
import { clockWipe } from "@remotion/transitions/clock-wipe";
```

## 方向付き slide transition

```tsx
import { slide } from "@remotion/transitions/slide";

<TransitionSeries.Transition
  presentation={slide({ direction: "from-left" })}
  timing={linearTiming({ durationInFrames: 20 })}
/>;
```

方向: `"from-left"`, `"from-right"`, `"from-top"`, `"from-bottom"`

## タイミングオプション

```tsx
import { linearTiming, springTiming } from "@remotion/transitions";

// Linear timing — 一定速度
linearTiming({ durationInFrames: 20 });

// Spring timing — 有機的な動き
springTiming({ config: { damping: 200 }, durationInFrames: 25 });
```

## 期間の計算

Transition は隣接シーンを overlap するため、composition 全体の長さは全 sequence duration の合計より **短く** なります。Overlay は合計 duration に **影響しません**。

例: 60 フレーム × 2 sequence と 15 フレーム transition:

- transition なし: `60 + 60 = 120` フレーム
- transition あり: `60 + 60 - 15 = 105` フレーム

他 2 sequence 間の overlay 追加は合計を変えません。

### transition の duration を取得

timing オブジェクトの `getDurationInFrames()` を使います:

```tsx
import { linearTiming, springTiming } from "@remotion/transitions";

const linearDuration = linearTiming({
  durationInFrames: 20,
}).getDurationInFrames({ fps: 30 });
// 20 を返す

const springDuration = springTiming({
  config: { damping: 200 },
}).getDurationInFrames({ fps: 30 });
// spring 物理に基づく duration を返す
```

`durationInFrames` 未指定の `springTiming` では、spring が落ち着くタイミングに依存するため duration は `fps` に依存します。

### composition 合計 duration の計算

```tsx
import { linearTiming } from "@remotion/transitions";

const scene1Duration = 60;
const scene2Duration = 60;
const scene3Duration = 60;

const timing1 = linearTiming({ durationInFrames: 15 });
const timing2 = linearTiming({ durationInFrames: 20 });

const transition1Duration = timing1.getDurationInFrames({ fps: 30 });
const transition2Duration = timing2.getDurationInFrames({ fps: 30 });

const totalDuration =
  scene1Duration + scene2Duration + scene3Duration - transition1Duration - transition2Duration;
// 60 + 60 + 60 - 15 - 20 = 145 フレーム
```
