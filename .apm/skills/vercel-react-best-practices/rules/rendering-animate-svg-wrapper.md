---
title: SVG 要素ではなく SVG ラッパーをアニメーション
impact: LOW
impactDescription: ハードウェアアクセラレーションを有効化
tags: rendering, svg, css, animation, performance
---

## SVG 要素ではなく SVG ラッパーをアニメーション

多くのブラウザは SVG 要素上の CSS3 アニメーションにハードウェアアクセラレーションを提供しません。SVG を `<div>` でラップし、ラッパーをアニメーションします。

**不適切（SVG を直接アニメーション - ハードウェアアクセラレーションなし）:**

```tsx
function LoadingSpinner() {
  return (
    <svg 
      className="animate-spin"
      width="24" 
      height="24" 
      viewBox="0 0 24 24"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" />
    </svg>
  )
}
```

**適切（ラッパー div をアニメーション - ハードウェアアクセラレーション）:**

```tsx
function LoadingSpinner() {
  return (
    <div className="animate-spin">
      <svg 
        width="24" 
        height="24" 
        viewBox="0 0 24 24"
      >
        <circle cx="12" cy="12" r="10" stroke="currentColor" />
      </svg>
    </div>
  )
}
```

これはすべての CSS transform と transition（`transform`、`opacity`、`translate`、`scale`、`rotate`）に適用されます。ラッパー div によりブラウザが GPU アクセラレーションを使い、より滑らかなアニメーションが可能になります。
