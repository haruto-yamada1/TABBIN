---
title: 長いリストに CSS content-visibility
impact: HIGH
impactDescription: 初期レンダーの高速化
tags: rendering, css, content-visibility, long-lists
---

## 長いリストに CSS content-visibility

画面外レンダリングを遅延するため `content-visibility: auto` を適用します。

**CSS:**

```css
.message-item {
  content-visibility: auto;
  contain-intrinsic-size: 0 80px;
}
```

**例:**

```tsx
function MessageList({ messages }: { messages: Message[] }) {
  return (
    <div className="overflow-y-auto h-screen">
      {messages.map(msg => (
        <div key={msg.id} className="message-item">
          <Avatar user={msg.author} />
          <div>{msg.content}</div>
        </div>
      ))}
    </div>
  )
}
```

1000 メッセージの場合、ブラウザは画面外の約 990 項目の layout/paint をスキップします（初期レンダーが約 10 倍高速）。
