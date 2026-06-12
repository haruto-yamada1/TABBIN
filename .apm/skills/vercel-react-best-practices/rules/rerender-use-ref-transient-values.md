---
title: 一時的な値に useRef を使用
impact: MEDIUM
impactDescription: 頻繁な更新での不要な再レンダーを回避
tags: rerender, useref, state, performance
---

## 一時的な値に useRef を使用

値が頻繁に変わり、更新ごとに再レンダーしたくない場合（マウストラッカー、インターバル、一時フラグなど）、`useState` ではなく `useRef` に保存します。UI 用はコンポーネント state、一時的な DOM 隣接値は ref を使います。ref の更新は再レンダーをトリガーしません。

**不適切（更新ごとにレンダー）:**

```tsx
function Tracker() {
  const [lastX, setLastX] = useState(0)

  useEffect(() => {
    const onMove = (e: MouseEvent) => setLastX(e.clientX)
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [])

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: lastX,
        width: 8,
        height: 8,
        background: 'black',
      }}
    />
  )
}
```

**適切（トラッキングで再レンダーなし）:**

```tsx
function Tracker() {
  const lastXRef = useRef(0)
  const dotRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      lastXRef.current = e.clientX
      const node = dotRef.current
      if (node) {
        node.style.transform = `translateX(${e.clientX}px)`
      }
    }
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [])

  return (
    <div
      ref={dotRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: 8,
        height: 8,
        background: 'black',
        transform: 'translateX(0px)',
      }}
    />
  )
}
```
