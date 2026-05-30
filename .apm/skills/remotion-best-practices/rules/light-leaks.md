---
name: light-leaks
description: Remotion でのライトリーク効果
metadata:
  tags: light-leaks, overlays, effects, transitions
---

## ライトリーク

Remotion 4.0.415 以降のみ動作します。`npx remotion versions` でバージョン確認、`npx remotion upgrade` で upgrade できます。

`@remotion/light-leaks` の `<LightLeak>` は WebGL ベースのライトリーク効果です。duration の前半で reveal、後半で retract します。

通常は 2 シーン間のカット点上で `<TransitionSeries.Overlay>` 内に使います。**transitions** rule の `<TransitionSeries>` / overlay 用法を参照してください。

## 前提条件

```bash
npx remotion add @remotion/light-leaks
```

## TransitionSeries との基本用法

```tsx
import { TransitionSeries } from "@remotion/transitions";
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
</TransitionSeries>;
```

## Props

- `durationInFrames?` — 親 sequence/composition の duration が既定。前半で reveal、後半で retract。
- `seed?` — ライトリークパターンの形状。seed ごとに異なるパターン。既定: `0`。
- `hueShift?` — 色相回転（度、`0`–`360`）。既定: `0`（黄〜橙）。`120` = 緑、`240` = 青。

## 見た目のカスタマイズ

```tsx
import { LightLeak } from "@remotion/light-leaks";

// 青みのライトリーク、別パターン
<LightLeak seed={5} hueShift={240} />;

// 緑みのライトリーク
<LightLeak seed={2} hueShift={120} />;
```

## 単体利用

`<LightLeak>` は `<TransitionSeries>` 外でも、任意 composition の装飾 overlay として使えます:

```tsx
import { AbsoluteFill } from "remotion";
import { LightLeak } from "@remotion/light-leaks";

const MyComp: React.FC = () => (
  <AbsoluteFill>
    <MyContent />
    <LightLeak durationInFrames={60} seed={3} />
  </AbsoluteFill>
);
```
