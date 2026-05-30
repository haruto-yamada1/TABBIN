---
title: 派生 state を購読する
impact: MEDIUM
impactDescription: 再レンダー頻度を低減
tags: rerender, derived-state, media-query, optimization
---

## 派生 state を購読する

連続値ではなく派生した boolean state を購読し、再レンダー頻度を低減します。

**不適切（ピクセル変更ごとに再レンダー）:**

```tsx
function Sidebar() {
  const width = useWindowWidth()  // updates continuously
  const isMobile = width < 768
  return <nav className={isMobile ? 'mobile' : 'desktop'} />
}
```

**適切（boolean 変更時のみ再レンダー）:**

```tsx
function Sidebar() {
  const isMobile = useMediaQuery('(max-width: 767px)')
  return <nav className={isMobile ? 'mobile' : 'desktop'} />
}
```
