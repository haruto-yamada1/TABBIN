---
name: sequencing
description: Remotion のシーケンスパターン — 遅延、トリム、期間制限
metadata:
  tags: sequence, series, timing, delay, trim
---

`<Sequence>` で timeline 上の要素出現タイミングを遅延できます。

```tsx
import { Sequence } from "remotion";

const {fps} = useVideoConfig();

<Sequence from={1 * fps} durationInFrames={2 * fps} premountFor={1 * fps}>
  <Title />
</Sequence>
<Sequence from={2 * fps} durationInFrames={2 * fps} premountFor={1 * fps}>
  <Subtitle />
</Sequence>
```

既定ではコンポーネントを absolute fill 要素で包みます。  
包みたくない場合は `layout` prop を使います:

```tsx
<Sequence layout="none">
  <Title />
</Sequence>
```

## プリマウント

実際の再生前に timeline 上でコンポーネントを読み込みます。  
`<Sequence>` は **常に** premount してください。

```tsx
<Sequence premountFor={1 * fps}>
  <Title />
</Sequence>
```

## Series

要素を重ならず順番に再生するときは `<Series>` を使います。

```tsx
import { Series } from "remotion";

<Series>
  <Series.Sequence durationInFrames={45}>
    <Intro />
  </Series.Sequence>
  <Series.Sequence durationInFrames={60}>
    <MainContent />
  </Series.Sequence>
  <Series.Sequence durationInFrames={30}>
    <Outro />
  </Series.Sequence>
</Series>;
```

`<Sequence>` と同様、`<Series.Sequence>` も `layout` が `none` でない限り absolute fill で包まれます。

### 重なりのある Series

重なる sequence には負の offset を使います:

```tsx
<Series>
  <Series.Sequence durationInFrames={60}>
    <SceneA />
  </Series.Sequence>
  <Series.Sequence offset={-15} durationInFrames={60}>
    {/* SceneA 終了 15 フレーム前に開始 */}
    <SceneB />
  </Series.Sequence>
</Series>
```

## Sequence 内のフレーム参照

Sequence 内では `useCurrentFrame()` は local frame（0 から）を返します:

```tsx
<Sequence from={60} durationInFrames={30}>
  <MyComponent />
  {/* MyComponent 内では useCurrentFrame() は 0-29（60-89 ではない） */}
</Sequence>
```

## ネストした Sequence

複雑なタイミングには Sequence のネストを使います:

```tsx
<Sequence from={0} durationInFrames={120}>
  <Background />
  <Sequence from={15} durationInFrames={90} layout="none">
    <Title />
  </Sequence>
  <Sequence from={45} durationInFrames={60} layout="none">
    <Subtitle />
  </Sequence>
</Sequence>
```

## 別 Composition 内へのネスト

composition 内に別 composition を入れるには、`<Sequence>` に `width` / `height` を指定します。

```tsx
<AbsoluteFill>
  <Sequence width={COMPOSITION_WIDTH} height={COMPOSITION_HEIGHT}>
    <CompositionComponent />
  </Sequence>
</AbsoluteFill>
```
