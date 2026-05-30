---
name: trimming
description: Remotion のトリムパターン — アニメーションの先頭・末尾カット
metadata:
  tags: sequence, trim, clip, cut, offset
---

Use `<Sequence>` with a negative `from` value to trim the start of an animation.

## 先頭をトリム

A negative `from` value shifts time backwards, making the animation start partway through:

```tsx
import { Sequence, useVideoConfig } from "remotion";

const fps = useVideoConfig();

<Sequence from={-0.5 * fps}>
  <MyAnimation />
</Sequence>;
```

animation appears 15 frames into its progress - the first 15 frames are trimmed off。
Inside `<MyAnimation>`, `useCurrentFrame()` starts at 15 instead of 0.

## 末尾をトリム

Use `durationInFrames` to unmount content after a specified duration:

```tsx
<Sequence durationInFrames={1.5 * fps}>
  <MyAnimation />
</Sequence>
```

animation plays for 45 frames, then the component unmounts。

## トリムと遅延

Nest sequences to both trim the beginning and delay when it appears:

```tsx
<Sequence from={30}>
  <Sequence from={-15}>
    <MyAnimation />
  </Sequence>
</Sequence>
```

inner sequence trims 15 frames from the start, and the outer sequence delays the result by 30 frames。
