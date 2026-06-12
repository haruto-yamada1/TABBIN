---
title: スクロールパフォーマンスにパッシブイベントリスナーを使用
impact: MEDIUM
impactDescription: イベントリスナーによるスクロール遅延を排除
tags: client, event-listeners, scrolling, performance, touch, wheel
---

## スクロールパフォーマンスにパッシブイベントリスナーを使用

即座にスクロールできるよう、touch と wheel イベントリスナーに `{ passive: true }` を追加します。ブラウザは通常、`preventDefault()` が呼ばれるか確認するためにリスナーの完了を待ち、スクロール遅延が発生します。

**不適切:**

```typescript
useEffect(() => {
  const handleTouch = (e: TouchEvent) => console.log(e.touches[0].clientX)
  const handleWheel = (e: WheelEvent) => console.log(e.deltaY)
  
  document.addEventListener('touchstart', handleTouch)
  document.addEventListener('wheel', handleWheel)
  
  return () => {
    document.removeEventListener('touchstart', handleTouch)
    document.removeEventListener('wheel', handleWheel)
  }
}, [])
```

**適切:**

```typescript
useEffect(() => {
  const handleTouch = (e: TouchEvent) => console.log(e.touches[0].clientX)
  const handleWheel = (e: WheelEvent) => console.log(e.deltaY)
  
  document.addEventListener('touchstart', handleTouch, { passive: true })
  document.addEventListener('wheel', handleWheel, { passive: true })
  
  return () => {
    document.removeEventListener('touchstart', handleTouch)
    document.removeEventListener('wheel', handleWheel)
  }
}, [])
```

**passive を使う場合:** トラッキング/アナリティクス、ログ、`preventDefault()` を呼ばないリスナー。

**passive を使わない場合:** カスタムスワイプジェスチャー、カスタムズーム、`preventDefault()` が必要なリスナー。
