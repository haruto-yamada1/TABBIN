---
name: animations
description: Remotion の基本アニメーションスキル
metadata:
  tags: animations, transitions, frames, useCurrentFrame
---

すべてのアニメーションは `useCurrentFrame()` フックで駆動する必要があります。  
Write animations in seconds and multiply them by the `fps` value from `useVideoConfig()`.

```tsx
import { useCurrentFrame } from "remotion";

export const FadeIn = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const opacity = interpolate(frame, [0, 2 * fps], [0, 1], {
    extrapolateRight: "clamp",
  });

  return <div style={{ opacity }}>Hello World!</div>;
};
```

CSS transition や animation は禁止 — 正しくレンダリングされません。  
Tailwind アニメーションクラス名は禁止 — 正しくレンダリングされません。
