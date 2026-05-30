---
name: measuring-dom-nodes
description: Remotion での DOM 要素寸法の計測
metadata:
  tags: measure, layout, dimensions, getBoundingClientRect, scale
---

# Measuring DOM nodes in Remotion

Remotion applies a `scale()` transform to the video container, which affects values from `getBoundingClientRect()`. Use `useCurrentScale()` to get correct measurements.

## 要素寸法の計測

```tsx
import { useCurrentScale } from "remotion";
import { useRef, useEffect, useState } from "react";

export const MyComponent = () => {
  const ref = useRef<HTMLDivElement>(null);
  const scale = useCurrentScale();
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setDimensions({
      width: rect.width / scale,
      height: rect.height / scale,
    });
  }, [scale]);

  return <div ref={ref}>Content to measure</div>;
};
```
