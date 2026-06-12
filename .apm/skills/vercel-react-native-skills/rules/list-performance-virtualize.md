---
title: すべてのリストにリスト仮想化を使用
impact: HIGH
impactDescription: メモリ削減、マウントの高速化
tags: lists, performance, virtualization, scrollview
---

## すべてのリストにリスト仮想化を使用

子要素を map した ScrollView の代わりに、LegendList や FlashList などのリスト仮想化を使用してください。短いリストでも同様です。仮想化は表示中のアイテムだけをレンダリングし、メモリ使用量とマウント時間を削減します。ScrollView はすべての子要素を事前にレンダリングするため、すぐにコストが高くなります。

**不適切（ScrollView がすべてのアイテムを一度にレンダリング）:**

```tsx
function Feed({ items }: { items: Item[] }) {
  return (
    <ScrollView>
      {items.map((item) => (
        <ItemCard key={item.id} item={item} />
      ))}
    </ScrollView>
  )
}
// 50 items = 50 components mounted, even if only 10 visible
```

**適切（仮想化は表示中のアイテムだけレンダリング）:**

```tsx
import { LegendList } from '@legendapp/list'

function Feed({ items }: { items: Item[] }) {
  return (
    <LegendList
      data={items}
      // if you aren't using React Compiler, wrap these with useCallback
      renderItem={({ item }) => <ItemCard item={item} />}
      keyExtractor={(item) => item.id}
      estimatedItemSize={80}
    />
  )
}
// Only ~10-15 visible items mounted at a time
```

**代替案（FlashList）:**

```tsx
import { FlashList } from '@shopify/flash-list'

function Feed({ items }: { items: Item[] }) {
  return (
    <FlashList
      data={items}
      // if you aren't using React Compiler, wrap these with useCallback
      renderItem={({ item }) => <ItemCard item={item} />}
      keyExtractor={(item) => item.id}
    />
  )
}
```

プロフィール、設定、フィード、検索結果など、スクロール可能なコンテンツを持つあらゆる画面にメリットがあります。デフォルトで仮想化を使用してください。
