---
title: 表示/非表示に Activity コンポーネントを使用
impact: MEDIUM
impactDescription: state/DOM を保持
tags: rendering, activity, visibility, state-preservation
---

## 表示/非表示に Activity コンポーネントを使用

表示が頻繁に切り替わる高コストなコンポーネントの state/DOM を保持するには、React の `<Activity>` を使用します。

**使用例:**

```tsx
import { Activity } from 'react'

function Dropdown({ isOpen }: Props) {
  return (
    <Activity mode={isOpen ? 'visible' : 'hidden'}>
      <ExpensiveMenu />
    </Activity>
  )
}
```

高コストな再レンダーと state 損失を回避します。
