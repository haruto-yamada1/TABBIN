---
title: 非緊急更新に Transitions を使用
impact: MEDIUM
impactDescription: UI の応答性を維持
tags: rerender, transitions, startTransition, performance
---

## 非緊急更新に Transitions を使用

頻繁で非緊急な state 更新を transition としてマークし、UI の応答性を維持します。

**不適切（スクロールごとに UI をブロック）:**

```tsx
function ScrollTracker() {
  const [scrollY, setScrollY] = useState(0)
  useEffect(() => {
    const handler = () => setScrollY(window.scrollY)
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])
}
```

**適切（ノンブロッキング更新）:**

```tsx
import { startTransition } from 'react'

function ScrollTracker() {
  const [scrollY, setScrollY] = useState(0)
  useEffect(() => {
    const handler = () => {
      startTransition(() => setScrollY(window.scrollY))
    }
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])
}
```
