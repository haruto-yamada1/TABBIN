---
title: 状態の読み取りを使用箇所まで遅延
impact: MEDIUM
impactDescription: 不要な購読を回避
tags: rerender, searchParams, localStorage, optimization
---

## 状態の読み取りを使用箇所まで遅延

コールバック内でのみ読み取る動的 state（searchParams、localStorage）には購読しないでください。

**不適切（すべての searchParams 変更を購読）:**

```tsx
function ShareButton({ chatId }: { chatId: string }) {
  const searchParams = useSearchParams()

  const handleShare = () => {
    const ref = searchParams.get('ref')
    shareChat(chatId, { ref })
  }

  return <button onClick={handleShare}>Share</button>
}
```

**適切（オンデマンドで読み取り、購読なし）:**

```tsx
function ShareButton({ chatId }: { chatId: string }) {
  const handleShare = () => {
    const params = new URLSearchParams(window.location.search)
    const ref = params.get('ref')
    shareChat(chatId, { ref })
  }

  return <button onClick={handleShare}>Share</button>
}
```
