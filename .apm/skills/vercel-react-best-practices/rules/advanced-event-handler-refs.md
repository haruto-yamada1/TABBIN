---
title: イベントハンドラーを ref に保存
impact: LOW
impactDescription: 安定した購読
tags: advanced, hooks, refs, event-handlers, optimization
---

## イベントハンドラーを ref に保存

コールバック変更時に再購読すべきでない effect でコールバックを使う場合、ref に保存します。

**不適切（レンダーごとに再購読）:**

```tsx
function useWindowEvent(event: string, handler: (e) => void) {
  useEffect(() => {
    window.addEventListener(event, handler)
    return () => window.removeEventListener(event, handler)
  }, [event, handler])
}
```

**適切（安定した購読）:**

```tsx
function useWindowEvent(event: string, handler: (e) => void) {
  const handlerRef = useRef(handler)
  useEffect(() => {
    handlerRef.current = handler
  }, [handler])

  useEffect(() => {
    const listener = (e) => handlerRef.current(e)
    window.addEventListener(event, listener)
    return () => window.removeEventListener(event, listener)
  }, [event])
}
```

**代替案: 最新 React なら `useEffectEvent` を使用:**

```tsx
import { useEffectEvent } from 'react'

function useWindowEvent(event: string, handler: (e) => void) {
  const onEvent = useEffectEvent(handler)

  useEffect(() => {
    window.addEventListener(event, onEvent)
    return () => window.removeEventListener(event, onEvent)
  }, [event])
}
```

`useEffectEvent` は同じパターンのよりクリーンな API を提供します。常に最新版のハンドラーを呼ぶ安定した関数参照を作ります。
